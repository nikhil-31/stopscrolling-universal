import { powerMonitor, powerSaveBlocker } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { isUnresolvedCategory, resolveCategory } from "@shared/categories";
import { acceptedJevCategory, overlayCategory, type JevCategoryCache, type JevCategoryCacheEntry } from "@shared/jev";
import { entryToPayload, persistenceKey } from "@shared/payload";
import { appBreakdownKey, entryFromSession } from "@shared/timeline";
import { currentDevicePlatform, localTimeZone } from "@shared/platform";
import type {
  DeviceRow,
  DeviceStatusRow,
  ForegroundContext,
  ScreenTimeEntry,
  TrackingCapabilities,
} from "@shared/types";
import { createCollector } from "./collectors";
import type { ActivityCollector, ActivitySnapshot } from "./collectors/types";
import { contextEquals } from "./collectors/types";
import { loadCheckpoint, saveCheckpoint } from "./checkpoint";
import { decideIdle, IDLE_THRESHOLD_SECONDS, recoveredSessionEnd } from "./idle-session";
import { logObservability } from "./logger";
import { PendingUploadStore } from "./outbox";
import { JevClassifier } from "./jev-classifier";
import { deviceName, jevCategoriesPath, localDeviceIdPath } from "./paths";
import { resolveTypesafeApiKey } from "./typesafe-key-store";
import type { StopScrollingAPI } from "./api-client";

const SAMPLE_MS = 1000;
const FLUSH_MS = 60_000;
const HEARTBEAT_MS = 60_000;
const FLUSH_THRESHOLD = 20;
const CHECKPOINT_MS = 15_000;
const RANGE_CACHE_LIMIT = 8;

function rangeKey(start: Date, end: Date, timeZone: string) {
  return `${start.getTime()}|${end.getTime()}|${timeZone}`;
}

export class ScreenTimeTracker {
  readonly outbox = new PendingUploadStore();
  readonly collector: ActivityCollector = createCollector();
  isTracking = false;
  currentContext: ForegroundContext | null = null;
  pendingUploadCount = 0;
  registeredDevices: DeviceRow[] = [];
  deviceStatus: DeviceStatusRow[] = [];
  serverEntries: ScreenTimeEntry[] = [];
  loadingEntries = false;
  entriesUnavailableReason: string | null = null;
  private readonly rangeCache = new Map<string, ScreenTimeEntry[]>();
  private loadGeneration = 0;
  private mergedBase: {
    server: ScreenTimeEntry[];
    outbox: ScreenTimeEntry[];
    entries: ScreenTimeEntry[];
    keys: Set<string>;
  } | null = null;
  localDeviceId: string | null = existsSync(localDeviceIdPath())
    ? readFileSync(localDeviceIdPath(), "utf8").trim()
    : null;

  private sampleTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private keepAliveId: number | null = null;
  private openStart: Date | null = null;
  private openContext: ForegroundContext | null = null;
  private lastCheckpoint = 0;
  private idle = false;
  private lastActiveAt: Date | null = null;
  readonly classifier: JevClassifier;

  constructor(
    private readonly api: StopScrollingAPI,
    private readonly onChange: () => void,
    private readonly syncReady: () => boolean,
    classifier?: JevClassifier,
  ) {
    this.classifier = classifier ?? new JevClassifier({
      getApiKey: resolveTypesafeApiKey,
      cachePath: jevCategoriesPath(),
    });
    this.classifier.onResolved = (key, entry) => this.applyClassification(key, entry);
    this.pendingUploadCount = this.outbox.count();
    this.recoverCheckpoint();
    powerMonitor.on("lock-screen", () => {
      void this.closeForPower("lock");
    });
    powerMonitor.on("suspend", () => {
      void this.closeForPower("sleep");
    });
  }

  categoryCache(): JevCategoryCache {
    return this.classifier.cache;
  }

  capabilities(): TrackingCapabilities {
    return this.collector.capabilities();
  }

  requestAccessibility() {
    return this.collector.requestPermission();
  }

  mergedEntries(): ScreenTimeEntry[] {
    const base = this.mergedBaseEntries();
    if (!this.isTracking || !this.openStart || !this.openContext) return base.entries;
    const live = this.liveEntry(this.openStart, this.openContext, this.liveEnd());
    const liveKey = persistenceKey(live);
    const merged = base.keys.has(liveKey)
      ? base.entries.filter((entry) => persistenceKey(entry) !== liveKey)
      : base.entries.slice();
    const liveStart = Date.parse(live.startTimeUTC);
    let index = merged.length;
    while (index > 0 && Date.parse(merged[index - 1].startTimeUTC) > liveStart) index -= 1;
    merged.splice(index, 0, live);
    return merged;
  }

  /** Changes whenever `mergedEntries()` would; the live end is bucketed to `liveResolutionMs`. */
  entriesSignature(liveResolutionMs: number): unknown[] {
    const live = this.isTracking && this.openStart && this.openContext;
    return [
      this.serverEntries,
      this.outbox.load(),
      live ? this.openStart : null,
      live ? this.openContext : null,
      live ? Math.floor(this.liveEnd().getTime() / liveResolutionMs) : null,
    ];
  }

  private mergedBaseEntries() {
    const server = this.serverEntries;
    const outbox = this.outbox.load();
    if (this.mergedBase && this.mergedBase.server === server && this.mergedBase.outbox === outbox) {
      return this.mergedBase;
    }
    const byKey = new Map<string, ScreenTimeEntry>();
    for (const entry of server) byKey.set(persistenceKey(entry), entry);
    for (const entry of outbox) byKey.set(persistenceKey(entry), entry);
    const entries = Array.from(byKey.values())
      .map((entry) => ({ entry, start: Date.parse(entry.startTimeUTC) }))
      .sort((a, b) => a.start - b.start)
      .map((item) => item.entry);
    this.mergedBase = { server, outbox, entries, keys: new Set(byKey.keys()) };
    return this.mergedBase;
  }

  async startTracking() {
    if (this.isTracking) return;
    await this.collector.start();
    this.isTracking = true;
    this.keepAliveId = powerSaveBlocker.start("prevent-app-suspension");
    this.sampleTimer = setInterval(() => {
      void this.sample();
    }, SAMPLE_MS);
    this.flushTimer = setInterval(() => {
      void this.flushOutbox();
    }, FLUSH_MS);
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat();
    }, HEARTBEAT_MS);
    await this.sample();
    void this.flushOutbox();
    void this.heartbeat();
    logObservability("Tracking started");
    this.onChange();
  }

  async stopTracking() {
    if (!this.isTracking) return;
    await this.closeOpenSession("stop", this.lastActiveAt ?? new Date());
    this.isTracking = false;
    this.currentContext = null;
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.sampleTimer = this.flushTimer = this.heartbeatTimer = null;
    if (this.keepAliveId !== null) {
      powerSaveBlocker.stop(this.keepAliveId);
      this.keepAliveId = null;
    }
    await this.collector.stop();
    logObservability("Tracking stopped");
    this.onChange();
  }

  async shutdown() {
    await this.stopTracking();
  }

  async sample() {
    if (!this.isTracking) return;
    const decision = decideIdle({
      nowMs: Date.now(),
      idleSeconds: powerMonitor.getSystemIdleTime(),
      lastActiveAt: this.lastActiveAt,
      openStart: this.openStart,
    });
    if (decision.close && decision.end) {
      await this.closeOpenSession(decision.stillAway ? "idle" : "gap", decision.end);
      this.currentContext = null;
      this.onChange();
    }
    if (decision.stillAway) {
      this.idle = true;
      return;
    }
    this.idle = false;
    this.lastActiveAt = decision.activeAt;
    const result = await this.collector.sample();
    if (result.type === "unavailable") return;
    if (result.type === "suppress") {
      if (this.openStart) {
        await this.closeOpenSession("shell", this.lastActiveAt);
        this.currentContext = null;
        this.onChange();
      }
      return;
    }
    const snapshot = result.snapshot;
    if (contextEquals(this.currentContext, snapshot)) {
      this.maybeCheckpoint();
      return;
    }
    await this.closeOpenSession("switch", this.lastActiveAt ?? new Date());
    this.openContext = this.toContext(snapshot);
    this.openStart = new Date();
    this.currentContext = this.openContext;
    this.maybeCheckpoint(true);
    this.onChange();
  }

  async flushOutbox() {
    if (!this.syncReady()) {
      this.pendingUploadCount = this.outbox.count();
      this.onChange();
      return;
    }
    const items = this.outbox.load();
    if (!items.length) {
      this.pendingUploadCount = 0;
      return;
    }
    const batches: ScreenTimeEntry[][] = [];
    for (let i = 0; i < items.length; i += 200) batches.push(items.slice(i, i + 200));
    const uploaded = new Set<string>();
    try {
      for (const batch of batches) {
        await this.api.postEventsBulk(batch.map((entry) => entryToPayload(entry, deviceName())));
        for (const entry of batch) uploaded.add(persistenceKey(entry));
      }
      this.outbox.removeKeys(uploaded);
    } catch (error) {
      logObservability(`Outbox flush failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.pendingUploadCount = this.outbox.count();
    this.onChange();
  }

  /**
   * Shows a cached copy of the range immediately (no loading state) and
   * revalidates it from the server; only uncached ranges show `loadingEntries`.
   */
  async loadRange(start: Date, end: Date, timeZone: string) {
    const generation = ++this.loadGeneration;
    if (!this.syncReady()) {
      this.serverEntries = [];
      this.rangeCache.clear();
      this.loadingEntries = false;
      this.entriesUnavailableReason = this.api.getTokens()
        ? null
        : "Sign in to load multi-device timelines. Local sessions still record to the outbox.";
      this.pendingUploadCount = this.outbox.count();
      this.onChange();
      return;
    }
    const key = rangeKey(start, end, timeZone);
    const cached = this.rangeCache.get(key);
    if (cached) this.serverEntries = cached;
    this.loadingEntries = !cached;
    this.onChange();
    try {
      const entries = await this.fetchRange(key, start, end, timeZone);
      if (generation !== this.loadGeneration) return;
      this.serverEntries = entries;
      this.entriesUnavailableReason = null;
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.entriesUnavailableReason = error instanceof Error ? error.message : "Timeline unavailable";
    }
    this.loadingEntries = false;
    this.pendingUploadCount = this.outbox.count();
    this.onChange();
  }

  clearRangeCache() {
    this.rangeCache.clear();
  }

  /** Warms the range cache without changing what is on screen. */
  async prefetchRange(start: Date, end: Date, timeZone: string) {
    if (!this.syncReady()) return;
    const key = rangeKey(start, end, timeZone);
    if (this.rangeCache.has(key)) return;
    try {
      await this.fetchRange(key, start, end, timeZone);
    } catch (error) {
      logObservability(`Range prefetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchRange(key: string, start: Date, end: Date, timeZone: string) {
    const sessions = await this.api.sessions({
      start: start.toISOString(),
      end: end.toISOString(),
      time_zone: timeZone,
    });
    const entries = sessions.map((session) =>
      entryFromSession(session, currentDevicePlatform(), deviceName(), timeZone),
    );
    this.rangeCache.delete(key);
    this.rangeCache.set(key, entries);
    while (this.rangeCache.size > RANGE_CACHE_LIMIT) {
      const oldest = this.rangeCache.keys().next().value;
      if (oldest === undefined) break;
      this.rangeCache.delete(oldest);
    }
    return entries;
  }

  async refreshDevices(notify = true) {
    if (!this.syncReady()) return;
    try {
      this.registeredDevices = await this.api.devices();
      this.deviceStatus = await this.api.deviceStatus();
    } catch (error) {
      logObservability(`Device refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (notify) this.onChange();
  }

  async pullFromServer() {
    if (!this.syncReady()) return;
    await this.registerLocalDevice();
    const devices = await this.api.devices();
    this.registeredDevices = devices;
    const collected: ScreenTimeEntry[] = [];
    for (const device of devices) {
      let since: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const response = await this.api.pullDevice(device.device_id, since);
        const sessions = response.sessions ?? [];
        for (const session of sessions) {
          collected.push(
            entryFromSession(
              session,
              device.device_platform,
              device.device_name,
              device.time_zone,
            ),
          );
        }
        if (!response.has_more_sessions || !sessions.length) break;
        since = sessions[sessions.length - 1]?.ended_at;
      }
    }
    this.serverEntries = collected;
    this.rangeCache.clear();
    this.onChange();
  }

  async heartbeat() {
    if (!this.syncReady()) return;
    try {
      const id = await this.registerLocalDevice();
      await this.api.heartbeat(id);
      this.deviceStatus = await this.api.deviceStatus();
    } catch (error) {
      logObservability(`Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.onChange();
  }

  async registerLocalDevice() {
    if (this.localDeviceId) return this.localDeviceId;
    const row = await this.api.registerDevice({
      device_platform: currentDevicePlatform(),
      device_name: deviceName(),
      time_zone: localTimeZone(),
    });
    this.localDeviceId = row.device_id;
    mkdirSync(dirname(localDeviceIdPath()), { recursive: true });
    writeFileSync(localDeviceIdPath(), row.device_id, "utf8");
    return row.device_id;
  }

  private liveEnd(): Date {
    if (!this.openStart) return new Date();
    if (!this.lastActiveAt || this.lastActiveAt.getTime() <= this.openStart.getTime()) return this.openStart;
    return this.lastActiveAt;
  }

  private async closeForPower(reason: string) {
    const end = this.lastActiveAt ?? new Date();
    await this.closeOpenSession(reason, end);
    this.currentContext = null;
    this.idle = true;
    this.onChange();
  }

  private async closeOpenSession(_reason: string, end = new Date()) {
    if (!this.openStart || !this.openContext) {
      saveCheckpoint(null);
      return;
    }
    const bounded = end.getTime() < this.openStart.getTime() ? this.openStart : end;
    if (bounded.getTime() - this.openStart.getTime() >= 1000) {
      const entry = this.liveEntry(this.openStart, this.openContext, bounded);
      entry.source = "local";
      this.outbox.append(entry);
      this.pendingUploadCount = this.outbox.count();
      if (this.pendingUploadCount >= FLUSH_THRESHOLD) void this.flushOutbox();
    }
    this.openStart = null;
    this.openContext = null;
    saveCheckpoint(null);
  }

  private maybeCheckpoint(force = false) {
    if (!this.openStart || !this.openContext) return;
    if (!force && Date.now() - this.lastCheckpoint < CHECKPOINT_MS) return;
    this.lastCheckpoint = Date.now();
    const lastActive =
      this.lastActiveAt && this.lastActiveAt.getTime() >= this.openStart.getTime()
        ? this.lastActiveAt
        : this.openStart;
    saveCheckpoint({
      start: this.openStart.toISOString(),
      lastActive: lastActive.toISOString(),
      context: this.openContext,
      timeZoneIdentifier: localTimeZone(),
    });
  }

  private recoverCheckpoint() {
    const checkpoint = loadCheckpoint();
    if (!checkpoint) return;
    const start = new Date(checkpoint.start);
    const end = recoveredSessionEnd(checkpoint);
    if (end.getTime() - start.getTime() >= 1000) {
      const entry = this.liveEntry(start, checkpoint.context, end);
      entry.source = "local";
      this.outbox.append(entry);
    }
    saveCheckpoint(null);
    this.pendingUploadCount = this.outbox.count();
  }

  private contextKey(context: Pick<ForegroundContext, "url" | "appName" | "title">) {
    return appBreakdownKey({ url: context.url, appName: context.appName, label: context.title });
  }

  private toContext(snapshot: ActivitySnapshot): ForegroundContext {
    const resolved = resolveCategory(snapshot.bundleID, snapshot.url, snapshot.title, snapshot.appName);
    const key = this.contextKey({ url: snapshot.url, appName: snapshot.appName, title: snapshot.title });
    const category = overlayCategory(resolved, key, this.classifier.cache);
    if (isUnresolvedCategory(category)) {
      this.classifier.enqueue({
        key,
        appName: snapshot.appName,
        bundleID: snapshot.bundleID,
        url: snapshot.url,
      });
    }
    return {
      title: snapshot.title,
      url: snapshot.url,
      appName: snapshot.appName,
      bundleID: snapshot.bundleID,
      category,
    };
  }

  private applyClassification(key: string, entry: JevCategoryCacheEntry) {
    const category = acceptedJevCategory(entry.category, entry.confidence);
    if (!category) return;
    if (this.openContext && this.contextKey(this.openContext) === key) {
      this.openContext = { ...this.openContext, category };
      this.currentContext = this.openContext;
      this.maybeCheckpoint(true);
    }
    this.onChange();
  }

  private liveEntry(start: Date, context: ForegroundContext, end: Date): ScreenTimeEntry {
    return {
      id: randomUUID(),
      startTimeUTC: start.toISOString(),
      endTimeUTC: end.toISOString(),
      title: context.title,
      url: context.url,
      bundleID: context.bundleID,
      appName: context.appName,
      category: context.category,
      platform: currentDevicePlatform(),
      deviceName: deviceName(),
      timeZoneIdentifier: localTimeZone(),
      source: "live",
    };
  }
}

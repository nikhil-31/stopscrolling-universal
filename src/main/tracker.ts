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
import { logObservability } from "./logger";
import { PendingUploadStore } from "./outbox";
import { JevClassifier } from "./jev-classifier";
import { deviceName, jevCategoriesPath, localDeviceIdPath } from "./paths";
import { resolveTypesafeApiKey } from "./typesafe-key-store";
import type { StopScrollingAPI } from "./api-client";

const IDLE_THRESHOLD_SECONDS = 60;
const SAMPLE_MS = 1000;
const FLUSH_MS = 60_000;
const HEARTBEAT_MS = 60_000;
const FLUSH_THRESHOLD = 20;
const CHECKPOINT_MS = 15_000;

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
      void this.closeOpenSession("lock");
    });
    powerMonitor.on("suspend", () => {
      void this.closeOpenSession("sleep");
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
    const live: ScreenTimeEntry[] = [];
    if (this.isTracking && this.openStart && this.openContext) {
      live.push(this.liveEntry(this.openStart, this.openContext, new Date()));
    }
    const byKey = new Map<string, ScreenTimeEntry>();
    for (const entry of this.serverEntries) byKey.set(persistenceKey(entry), entry);
    for (const entry of this.outbox.load()) byKey.set(persistenceKey(entry), entry);
    for (const entry of live) byKey.set(persistenceKey(entry), entry);
    return Array.from(byKey.values()).sort(
      (a, b) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime(),
    );
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
    await this.closeOpenSession("stop");
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
    const idleSeconds = powerMonitor.getSystemIdleTime();
    if (idleSeconds >= IDLE_THRESHOLD_SECONDS) {
      if (!this.idle) {
        this.idle = true;
        await this.closeOpenSession("idle");
        this.currentContext = null;
        this.onChange();
      }
      return;
    }
    this.idle = false;
    const snapshot = await this.collector.sample();
    if (!snapshot) return;
    if (contextEquals(this.currentContext, snapshot)) {
      this.maybeCheckpoint();
      return;
    }
    await this.closeOpenSession("switch");
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

  async loadRange(start: Date, end: Date, timeZone: string) {
    this.loadingEntries = true;
    this.onChange();
    try {
      if (!this.syncReady()) {
        this.serverEntries = [];
        this.entriesUnavailableReason = this.api.getTokens()
          ? null
          : "Sign in to load multi-device timelines. Local sessions still record to the outbox.";
        return;
      }
      const sessions = await this.api.sessions({
        start: start.toISOString(),
        end: end.toISOString(),
        time_zone: timeZone,
      });
      this.serverEntries = sessions.map((session) =>
        entryFromSession(session, currentDevicePlatform(), deviceName(), timeZone),
      );
      this.entriesUnavailableReason = null;
    } catch (error) {
      this.entriesUnavailableReason = error instanceof Error ? error.message : "Timeline unavailable";
    } finally {
      this.loadingEntries = false;
      this.pendingUploadCount = this.outbox.count();
      this.onChange();
    }
  }

  async refreshDevices() {
    if (!this.syncReady()) return;
    try {
      this.registeredDevices = await this.api.devices();
      this.deviceStatus = await this.api.deviceStatus();
    } catch (error) {
      logObservability(`Device refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.onChange();
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

  private async closeOpenSession(_reason: string) {
    if (!this.openStart || !this.openContext) {
      saveCheckpoint(null);
      return;
    }
    const end = new Date();
    if (end.getTime() - this.openStart.getTime() >= 1000) {
      const entry = this.liveEntry(this.openStart, this.openContext, end);
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
    saveCheckpoint({
      start: this.openStart.toISOString(),
      context: this.openContext,
      timeZoneIdentifier: localTimeZone(),
    });
  }

  private recoverCheckpoint() {
    const checkpoint = loadCheckpoint();
    if (!checkpoint) return;
    const start = new Date(checkpoint.start);
    const end = new Date();
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

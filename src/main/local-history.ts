import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decryptAesGcm, encryptAesGcm } from "@shared/crypto";
import { persistenceKey } from "@shared/payload";
import type { ScreenTimeEntry } from "@shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sessions can start in another time zone and still overlap the requested window. */
const RANGE_PAD_MS = 36 * 60 * 60 * 1000;
const RETENTION_DAYS = 400;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.bin$/;

export class LocalHistoryStore {
  private readonly days = new Map<string, ScreenTimeEntry[]>();
  /** Day names found on disk, listed once and then kept current by this store. */
  private listed: Set<string> | null = null;
  private readonly dirty = new Set<string>();
  private writeTimer: NodeJS.Timeout | null = null;
  private prunedOn = "";

  /** `writeDelayMs` coalesces day-file writes; reads always see the latest entries. */
  constructor(
    private readonly directory: string,
    private readonly key: Buffer,
    private readonly writeDelayMs = 0,
  ) {}

  remember(entries: ScreenTimeEntry[]) {
    const incoming = new Map<string, ScreenTimeEntry[]>();
    for (const entry of entries) {
      const day = dayKey(entry.startTimeUTC);
      if (!day) continue;
      const bucket = incoming.get(day);
      if (bucket) bucket.push(entry);
      else incoming.set(day, [entry]);
    }
    if (!incoming.size) return;
    for (const [day, batch] of incoming) {
      const existing = this.loadDay(day);
      const merged = dedupe([...existing, ...batch]);
      // Range refreshes re-send days that are already stored; skip rewriting those.
      if (this.listed?.has(day) && sameEntries(existing, merged)) continue;
      this.days.set(day, merged);
      this.dirty.add(day);
    }
    if (this.writeDelayMs <= 0) this.flush();
    else if (this.dirty.size && !this.writeTimer) {
      this.writeTimer = setTimeout(() => this.flush(), this.writeDelayMs);
      this.writeTimer.unref?.();
    }
  }

  /** Writes every changed day file now. */
  flush() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    if (!this.dirty.size) return;
    mkdirSync(this.directory, { recursive: true });
    const names = this.dayNames();
    for (const day of this.dirty) {
      const entries = this.days.get(day) ?? [];
      writeFileSync(this.file(day), encryptAesGcm(Buffer.from(JSON.stringify(entries), "utf8"), this.key));
      names.add(day);
    }
    this.dirty.clear();
    this.prune();
  }

  overlapping(start: Date, end: Date): ScreenTimeEntry[] {
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (!(endMs > startMs)) return [];
    const matches: ScreenTimeEntry[] = [];
    for (const day of this.daySpan(start, end)) {
      for (const entry of this.entriesForDay(day)) {
        const entryStart = Date.parse(entry.startTimeUTC);
        const entryEnd = Date.parse(entry.endTimeUTC);
        if (entryEnd > startMs && entryStart < endMs) matches.push(entry);
      }
    }
    return matches.sort((a, b) => Date.parse(a.startTimeUTC) - Date.parse(b.startTimeUTC));
  }

  /** UTC day-file names that can overlap the range, oldest first. */
  daySpan(start: Date, end: Date): string[] {
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (!(endMs > startMs)) return [];
    const from = dayKey(new Date(startMs - RANGE_PAD_MS).toISOString());
    const to = dayKey(new Date(endMs).toISOString());
    if (!from || !to) return [];
    return [...this.dayNames()].filter((day) => day >= from && day <= to).sort();
  }

  entriesForDay(day: string): ScreenTimeEntry[] {
    return this.loadDay(day);
  }

  /** Day files on disk, oldest names included, without decrypting them. */
  listedDays(): string[] {
    return [...this.dayNames()];
  }

  /**
   * Device identities in one day file. Uses a cached day when Insights already
   * loaded it, and otherwise decrypts without keeping the sessions in memory.
   */
  identitiesForDay(day: string): Array<{ platform: string; deviceName: string; timeZoneIdentifier: string }> {
    const entries = this.days.get(day) ?? this.parseDay(day);
    const seen = new Map<string, { platform: string; deviceName: string; timeZoneIdentifier: string }>();
    for (const entry of entries) {
      if (!entry.deviceName) continue;
      const key = `${entry.platform}\0${entry.deviceName}`;
      if (!seen.has(key)) {
        seen.set(key, {
          platform: entry.platform,
          deviceName: entry.deviceName,
          timeZoneIdentifier: entry.timeZoneIdentifier,
        });
      }
    }
    return [...seen.values()];
  }

  private loadDay(day: string): ScreenTimeEntry[] {
    const cached = this.days.get(day);
    if (cached) return cached;
    const entries = this.parseDay(day);
    this.days.set(day, entries);
    return entries;
  }

  private parseDay(day: string): ScreenTimeEntry[] {
    const path = this.file(day);
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(decryptAesGcm(readFileSync(path), this.key).toString("utf8")) as ScreenTimeEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Day files on disk plus days held in memory. The directory is read once. */
  private dayNames(): Set<string> {
    if (!this.listed) {
      this.listed = new Set();
      if (existsSync(this.directory)) {
        for (const file of readdirSync(this.directory)) {
          const match = DAY_FILE.exec(file);
          if (match) this.listed.add(match[1]);
        }
      }
    }
    for (const day of this.days.keys()) this.listed.add(day);
    return this.listed;
  }

  /** Drops day files past retention, at most once per UTC day. */
  private prune() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.prunedOn === today) return;
    this.prunedOn = today;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
    const names = this.dayNames();
    for (const day of [...names]) {
      if (day >= cutoff) continue;
      this.days.delete(day);
      names.delete(day);
      const path = this.file(day);
      if (existsSync(path)) unlinkSync(path);
    }
  }

  private file(day: string) {
    return join(this.directory, `${day}.bin`);
  }
}

function dayKey(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function dedupe(entries: ScreenTimeEntry[]) {
  const byKey = new Map<string, ScreenTimeEntry>();
  for (const entry of entries) byKey.set(persistenceKey(entry), entry);
  return [...byKey.values()];
}

/** `primary` wins when the same session is in both lists. */
export function mergeEntries(primary: ScreenTimeEntry[], extra: ScreenTimeEntry[]) {
  if (!extra.length) return primary;
  const byKey = new Map<string, ScreenTimeEntry>();
  for (const entry of extra) byKey.set(persistenceKey(entry), entry);
  for (const entry of primary) byKey.set(persistenceKey(entry), entry);
  return [...byKey.values()].sort((a, b) => Date.parse(a.startTimeUTC) - Date.parse(b.startTimeUTC));
}

function sameEntries(a: ScreenTimeEntry[], b: ScreenTimeEntry[]) {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

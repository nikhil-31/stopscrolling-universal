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

  constructor(
    private readonly directory: string,
    private readonly key: Buffer,
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
    mkdirSync(this.directory, { recursive: true });
    for (const [day, batch] of incoming) {
      const merged = dedupe([...this.loadDay(day), ...batch]);
      this.days.set(day, merged);
      writeFileSync(this.file(day), encryptAesGcm(Buffer.from(JSON.stringify(merged), "utf8"), this.key));
    }
    this.prune();
  }

  overlapping(start: Date, end: Date): ScreenTimeEntry[] {
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (!(endMs > startMs)) return [];
    const from = dayKey(new Date(startMs - RANGE_PAD_MS).toISOString());
    const to = dayKey(new Date(endMs).toISOString());
    if (!from || !to) return [];
    const matches: ScreenTimeEntry[] = [];
    for (const day of this.dayNames()) {
      if (day < from || day > to) continue;
      for (const entry of this.loadDay(day)) {
        const entryStart = Date.parse(entry.startTimeUTC);
        const entryEnd = Date.parse(entry.endTimeUTC);
        if (entryEnd > startMs && entryStart < endMs) matches.push(entry);
      }
    }
    return matches.sort((a, b) => Date.parse(a.startTimeUTC) - Date.parse(b.startTimeUTC));
  }

  private loadDay(day: string): ScreenTimeEntry[] {
    const cached = this.days.get(day);
    if (cached) return cached;
    const path = this.file(day);
    if (!existsSync(path)) {
      this.days.set(day, []);
      return [];
    }
    try {
      const parsed = JSON.parse(decryptAesGcm(readFileSync(path), this.key).toString("utf8")) as ScreenTimeEntry[];
      const entries = Array.isArray(parsed) ? parsed : [];
      this.days.set(day, entries);
      return entries;
    } catch {
      this.days.set(day, []);
      return [];
    }
  }

  private dayNames(): string[] {
    const names = new Set(this.days.keys());
    if (existsSync(this.directory)) {
      for (const file of readdirSync(this.directory)) {
        const match = DAY_FILE.exec(file);
        if (match) names.add(match[1]);
      }
    }
    return [...names];
  }

  private prune() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
    for (const day of this.dayNames()) {
      if (day >= cutoff) continue;
      this.days.delete(day);
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

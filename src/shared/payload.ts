import type { ScreenTimeApiPayload, ScreenTimeEntry } from "./types";
import { clip } from "./platform";

export function persistenceKey(entry: Pick<ScreenTimeEntry, "startTimeUTC" | "endTimeUTC" | "bundleID" | "title" | "url">): string {
  return [
    String(new Date(entry.startTimeUTC).getTime() / 1000),
    String(new Date(entry.endTimeUTC).getTime() / 1000),
    entry.bundleID,
    entry.title,
    entry.url,
  ].join("|");
}

export function entryToPayload(entry: ScreenTimeEntry, fallbackDeviceName: string): ScreenTimeApiPayload {
  const deviceName = entry.deviceName || fallbackDeviceName;
  const appName =
    entry.title && entry.title !== entry.appName ? entry.title : entry.appName;
  return {
    recorded_at: entry.endTimeUTC,
    device_platform: clip(entry.platform, 64),
    device_name: clip(deviceName, 4096),
    app_name: clip(appName, 4096),
    app_category: clip(entry.category, 4096),
    app_bundle_id: clip(entry.bundleID, 255),
    duration_seconds: Math.max(
      0,
      Math.round((new Date(entry.endTimeUTC).getTime() - new Date(entry.startTimeUTC).getTime()) / 1000),
    ),
    foreground_state: "foreground",
    started_at: entry.startTimeUTC,
    session_title: clip(entry.title, 4096),
    session_url: clip(entry.url, 4096),
    process_name: clip(entry.appName, 4096),
    time_zone: clip(entry.timeZoneIdentifier, 64),
  };
}

export function mergeRecords(local: ScreenTimeEntry[], remote: ScreenTimeEntry[]): ScreenTimeEntry[] {
  if (!remote.length) return local;
  if (!local.length) return remote;
  const byKey = new Map<string, ScreenTimeEntry>();
  for (const entry of local) byKey.set(persistenceKey(entry), entry);
  for (const entry of remote) byKey.set(persistenceKey(entry), { ...entry, source: "sync" });
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime(),
  );
}

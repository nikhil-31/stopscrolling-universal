import type { ForegroundContext, TrackingCapabilities } from "@shared/types";

export interface ActivitySnapshot {
  appName: string;
  bundleID: string;
  title: string;
  url: string;
}

export interface ActivityCollector {
  start(): Promise<void>;
  stop(): Promise<void>;
  sample(): Promise<ActivitySnapshot | null>;
  capabilities(): TrackingCapabilities;
  requestPermission(): boolean;
}

export function contextEquals(a: ForegroundContext | null, b: ActivitySnapshot | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.bundleID === b.bundleID && a.title === b.title && a.url === b.url && a.appName === b.appName;
}

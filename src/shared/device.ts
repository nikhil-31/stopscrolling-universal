import type { DeviceListEntry, DeviceStatusRow } from "./types";

const ONLINE_FALLBACK_MS = 5 * 60 * 1000;

export function platformDisplayName(platform: string): string {
  switch (platform.toLowerCase()) {
    case "macos":
      return "Mac";
    case "ios":
      return "iPhone";
    case "ipados":
      return "iPad";
    case "watchos":
      return "Apple Watch";
    case "android":
      return "Android";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform ? platform[0].toUpperCase() + platform.slice(1) : "Device";
  }
}

export function resolvedDeviceName(platform: string, deviceName: string): string {
  return deviceName || platformDisplayName(platform);
}

export function deviceKey(platform: string, deviceName: string): string {
  return `${platform || "unknown"}|${resolvedDeviceName(platform, deviceName)}`;
}

export function isDeviceOnline(entry: {
  lastSeenAt?: string | Date | null;
  reportedOnline?: boolean | null;
}): boolean {
  if (entry.reportedOnline === true) return true;
  if (entry.reportedOnline === false) return false;
  const lastSeen = entry.lastSeenAt ? new Date(entry.lastSeenAt).getTime() : NaN;
  if (Number.isNaN(lastSeen)) return false;
  return Date.now() - lastSeen < ONLINE_FALLBACK_MS;
}

export function withComputedOnline(entry: Omit<DeviceListEntry, "isOnline">): DeviceListEntry {
  return {
    ...entry,
    isOnline: isDeviceOnline({
      lastSeenAt: entry.lastSeenAt ?? entry.lastOnlineAt,
      reportedOnline: entry.reportedOnline,
    }),
  };
}

export function statusToOnline(row: DeviceStatusRow): boolean {
  return isDeviceOnline({
    lastSeenAt: row.last_online_at,
    reportedOnline: row.is_online,
  });
}

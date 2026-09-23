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

export function deviceDisplayName(platform: string, deviceName: string, nickname = ""): string {
  return nickname.trim() || resolvedDeviceName(platform, deviceName);
}

export function displayNameForDevice(
  platform: string,
  deviceName: string,
  devices: Array<Pick<DeviceListEntry, "visibilityKey" | "nickname" | "deviceName" | "devicePlatform">> = [],
): string {
  const key = deviceKey(platform, deviceName);
  const match = (devices ?? []).find((device) => device.visibilityKey === key);
  return deviceDisplayName(platform, deviceName, match?.nickname ?? "");
}

export function deviceKey(platform: string, deviceName: string): string {
  return `${platform || "unknown"}|${resolvedDeviceName(platform, deviceName)}`;
}

const DEVICE_COLOR_COUNT = 8;

function colorSlot(value: number) {
  return ((value % DEVICE_COLOR_COUNT) + DEVICE_COLOR_COUNT) % DEVICE_COLOR_COUNT;
}

function hashKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function deviceColorIndex(key: string, colorIndex?: number | null) {
  if (typeof colorIndex === "number" && Number.isFinite(colorIndex)) return colorSlot(Math.trunc(colorIndex));
  return colorSlot(hashKey(key));
}

export function deviceColor(
  key: string,
  devices: Array<Pick<DeviceListEntry, "visibilityKey" | "colorIndex">> = [],
) {
  const match = devices.find((device) => device.visibilityKey === key);
  return `var(--device-${deviceColorIndex(key, match?.colorIndex)})`;
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

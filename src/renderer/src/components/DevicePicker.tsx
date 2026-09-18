import { displayNameForDevice } from "@shared/device";
import { ALL_DEVICES, normalizeInsightsDeviceKey } from "@shared/timeline";
import type { DeviceListEntry } from "@shared/types";

export function visibleDevicesForPicker(
  devices: DeviceListEntry[] = [],
  hiddenKeys: string[] = [],
): DeviceListEntry[] {
  const hidden = new Set(hiddenKeys ?? []);
  return (devices ?? []).filter((device) => !hidden.has(device.visibilityKey));
}

export function DevicePicker({
  devices,
  hiddenDeviceKeys,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  devices: DeviceListEntry[];
  hiddenDeviceKeys: string[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const visibleDevices = visibleDevicesForPicker(devices, hiddenDeviceKeys);
  if (visibleDevices.length < 2) return null;
  const deviceKey = normalizeInsightsDeviceKey(
    value,
    visibleDevices.map((device) => device.visibilityKey),
  );
  const classes = ["seg", "device-picker", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="tablist" aria-label={ariaLabel}>
      <button
        type="button"
        role="tab"
        aria-selected={deviceKey === ALL_DEVICES}
        className={deviceKey === ALL_DEVICES ? "active" : ""}
        onClick={() => onChange(ALL_DEVICES)}
      >
        All devices
      </button>
      {visibleDevices.map((device) => {
        const label = displayNameForDevice(device.devicePlatform, device.deviceName, visibleDevices);
        return (
          <button
            key={device.visibilityKey}
            type="button"
            role="tab"
            aria-selected={deviceKey === device.visibilityKey}
            className={deviceKey === device.visibilityKey ? "active" : ""}
            onClick={() => onChange(device.visibilityKey)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

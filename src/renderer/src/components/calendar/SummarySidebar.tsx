import { formatHourMinute } from "@shared/calendar-workspace";
import { deviceColor, displayNameForDevice } from "@shared/device";
import { effectiveTimeZone, toDateInput } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { Settings2 } from "lucide-react";
import { IconButton } from "../ui";

export function SummarySidebar({
  state,
  onEditTarget,
}: {
  state: AppSnapshot;
  onEditTarget: () => void;
}) {
  const stats = state.calendarDayStats;
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const isToday = toDateInput(new Date(state.calendarAnchor), timeZone) === toDateInput(new Date(), timeZone);
  const devices = stats.deviceTotals;
  const totalDeviceSeconds = devices.reduce((sum, device) => sum + device.seconds, 0);

  return (
    <aside className="calendar-summary" aria-label="Day summary">
      <header className="calendar-summary-head">
        <strong>{`>> Summary · Day - ${isToday ? "Today" : "Selected"}`}</strong>
        <IconButton label="Edit work hours target" icon={Settings2} onClick={onEditTarget} />
      </header>

      <section className="calendar-summary-card">
        <div className="calendar-work-hours">
          <div className="calendar-work-value">{formatHourMinute(stats.trackedSeconds)}</div>
          <div className="calendar-work-label">Day total</div>
          <div className="calendar-work-pending">{formatHourMinute(stats.pendingSeconds)} pending</div>
        </div>
        <div className="calendar-target-row">
          <span>Work Hours</span>
          <strong>{formatHourMinute(stats.workSeconds)}</strong>
        </div>
        <div className="calendar-target-row">
          <span>Percent of Target</span>
          <strong>{stats.percentOfTarget}% of {formatHourMinute(stats.targetSeconds)}</strong>
        </div>
        <div className="calendar-target-track" aria-hidden="true">
          <span style={{ width: `${Math.min(100, stats.percentOfTarget)}%` }} />
        </div>
      </section>

      <section className="calendar-summary-card">
        {totalDeviceSeconds > 0 ? (
          <>
            <div className="calendar-productivity-track" aria-hidden="true">
              {devices.map((device) => (
                <span
                  key={device.key}
                  style={{
                    width: `${(device.seconds / totalDeviceSeconds) * 100}%`,
                    background: deviceColor(device.key, state.devices),
                  }}
                />
              ))}
            </div>
            <div className="calendar-productivity-legend">
              {devices.map((device) => (
                <div key={device.key} className="calendar-legend-row">
                  <span className="calendar-legend-dot" style={{ background: deviceColor(device.key, state.devices) }} />
                  <span>{displayNameForDevice(device.devicePlatform, device.deviceName, state.devices)}</span>
                  <strong>{formatHourMinute(device.seconds)}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="calendar-empty-copy">No device time</p>
        )}
      </section>
    </aside>
  );
}

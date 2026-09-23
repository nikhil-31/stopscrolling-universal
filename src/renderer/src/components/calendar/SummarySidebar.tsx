import {
  formatHourMinute,
  PRODUCTIVITY_BUCKETS,
  PRODUCTIVITY_COLORS,
  type ProductivityBucket,
} from "@shared/calendar-workspace";
import { effectiveTimeZone, toDateInput } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { CircleHelp, Settings2 } from "lucide-react";
import { IconButton } from "../ui";

const bucketLabels: Record<ProductivityBucket, string> = {
  focus: "Focus",
  meetings: "Meetings",
  breaks: "Breaks",
  other: "Other",
};

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
  const totalProductivity = PRODUCTIVITY_BUCKETS.reduce((sum, bucket) => sum + stats.productivity[bucket], 0);

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
        <div className="calendar-productivity-track" aria-hidden="true">
          {PRODUCTIVITY_BUCKETS.map((bucket) => {
            const seconds = stats.productivity[bucket];
            if (!seconds || !totalProductivity) return null;
            return (
              <span
                key={bucket}
                style={{
                  width: `${(seconds / totalProductivity) * 100}%`,
                  background: PRODUCTIVITY_COLORS[bucket],
                }}
              />
            );
          })}
        </div>
        <div className="calendar-productivity-legend">
          {PRODUCTIVITY_BUCKETS.map((bucket) => (
            <div key={bucket} className="calendar-legend-row">
              <span className="calendar-legend-dot" style={{ background: PRODUCTIVITY_COLORS[bucket] }} />
              <span>{bucketLabels[bucket]}</span>
              {bucket === "other" ? <CircleHelp size={11} aria-hidden="true" /> : null}
              <strong>{formatHourMinute(stats.productivity[bucket])}</strong>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

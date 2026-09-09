import {
  formatHourMinute,
  PRODUCTIVITY_BUCKETS,
  PRODUCTIVITY_COLORS,
  type ProductivityBucket,
} from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import { CircleHelp, ListChecks, Settings2 } from "lucide-react";
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
  const isToday = sameDay(new Date(state.calendarAnchor), new Date());
  const totalProductivity = PRODUCTIVITY_BUCKETS.reduce((sum, bucket) => sum + stats.productivity[bucket], 0);
  const donutTotal = stats.labelTotals.reduce((sum, item) => sum + item.seconds, 0);
  let angle = 0;
  const slices = stats.labelTotals.map((item) => {
    const sweep = donutTotal ? (item.seconds / donutTotal) * 360 : 0;
    const start = angle;
    angle += sweep;
    return `${item.color} ${start}deg ${angle}deg`;
  });

  return (
    <aside className="calendar-summary" aria-label="Day summary">
      <header className="calendar-summary-head">
        <strong>{`>> Summary · Day - ${isToday ? "Today" : "Selected"}`}</strong>
        <IconButton label="Edit work hours target" icon={Settings2} onClick={onEditTarget} />
      </header>

      <section className="calendar-summary-card">
        <div className="calendar-work-hours">
          <div className="calendar-work-value">{formatHourMinute(stats.workSeconds)}</div>
          <div className="calendar-work-label">Work Hours</div>
          <div className="calendar-work-pending">{formatHourMinute(stats.pendingSeconds)} pending</div>
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
        <div className="calendar-summary-chip">
          <ListChecks size={14} aria-hidden="true" />
          Tasks
        </div>
        {stats.dayTasks.length ? (
          <div className="calendar-task-list">
            {stats.dayTasks.map((task) => (
              <div key={task.id} className="calendar-task-row">
                <span>{task.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="calendar-empty-copy">No tasks tracked.</p>
        )}
      </section>

      <section className="calendar-summary-card">
        {stats.labelTotals.length ? (
          <div className="calendar-donut">
            <div
              className="calendar-donut-ring"
              role="img"
              aria-label={stats.labelTotals.map((item) => `${item.name} ${formatHourMinute(item.seconds)}`).join(", ")}
              style={{ background: `conic-gradient(${slices.join(",")})` }}
            />
            <div className="calendar-donut-legend">
              {stats.labelTotals.map((item) => (
                <div key={item.labelId} className="calendar-legend-row">
                  <span className="calendar-legend-dot" style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <strong>{formatHourMinute(item.seconds)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="calendar-empty-copy">No labels applied yet.</p>
        )}
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

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

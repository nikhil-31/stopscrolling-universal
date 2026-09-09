import {
  buildCalendarRangeStats,
  collectDayBlocks,
  formatHourMinute,
} from "@shared/calendar-workspace";
import { todayPeriodBounds } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";

export function ActivityPie({ state }: { state: AppSnapshot }) {
  const bounds = todayPeriodBounds(state.todayPeriod, new Date(state.todayDay));
  const stats = buildCalendarRangeStats(
    state.calendarWorkspace,
    collectDayBlocks(state.timelines),
    bounds.start,
    bounds.end,
    state.settings.dailyWorkTargetSeconds || 8 * 60 * 60,
  );
  const tracked = Math.max(stats.trackedSeconds, 1);
  const labeled = Math.max(0, stats.trackedSeconds - stats.pendingSeconds);
  const labeledDeg = (labeled / tracked) * 360;
  const total = formatHourMinute(state.snapshot.totalSeconds);

  return (
    <section className="activity-panel" aria-label="Pie chart">
      <div className="activity-panel-label">Pie Chart</div>
      <div className="activity-pie-wrap">
        <div
          className="activity-pie"
          data-testid="activity-pie-chart"
          role="img"
          aria-label={`Tracked ${total}, ${formatHourMinute(labeled)} labeled, ${formatHourMinute(stats.pendingSeconds)} unlabeled`}
          style={{
            background: stats.trackedSeconds
              ? `conic-gradient(var(--brand) 0deg ${labeledDeg}deg, transparent ${labeledDeg}deg 360deg)`
              : "var(--line)",
          }}
        />
        {stats.pendingSeconds > 0 ? (
          <span
            className="activity-pie-dash"
            aria-hidden="true"
            style={{ ["--labeled-deg" as string]: `${labeledDeg}deg` }}
          />
        ) : null}
        <div className="activity-pie-center">
          <strong>{total}</strong>
        </div>
      </div>
    </section>
  );
}

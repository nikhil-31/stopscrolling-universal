import { formatHourMinute } from "@shared/calendar-workspace";
import type { TimesheetStats as Stats } from "@shared/timesheet";

function percent(part: number, total: number) {
  return total > 0 ? `${(part / total) * 100}%` : "0%";
}

export function TimesheetStats({ stats }: { stats: Stats }) {
  const reviewSeconds = stats.pendingSeconds - stats.processingSeconds;
  return (
    <section className="timesheet-stats" data-testid="timesheet-stats" aria-label="Timesheet summary">
      <div className="timesheet-stat">
        <span className="timesheet-stat-label"><i className="timesheet-swatch is-review" />Pending review</span>
        <strong>{formatHourMinute(stats.pendingSeconds)}</strong>
      </div>
      <div className="timesheet-stat">
        <span className="timesheet-stat-label"><i className="timesheet-swatch is-approved" />Approved</span>
        <strong>{formatHourMinute(stats.approvedSeconds)}</strong>
      </div>
      <div className="timesheet-stat">
        <span className="timesheet-stat-label">Time entry hours</span>
        <strong>{formatHourMinute(stats.totalSeconds)}</strong>
      </div>
      <div className="timesheet-progress-wrap">
        <div
          className="timesheet-progress"
          role="progressbar"
          aria-label="Approved entries"
          aria-valuemin={0}
          aria-valuemax={stats.totalCount}
          aria-valuenow={stats.approvedCount}
        >
          <span className="is-approved" style={{ width: percent(stats.approvedSeconds, stats.totalSeconds) }} />
          <span className="is-processing" style={{ width: percent(stats.processingSeconds, stats.totalSeconds) }} />
          <span className="is-review" style={{ width: percent(reviewSeconds, stats.totalSeconds) }} />
        </div>
        <span className="timesheet-progress-label">{stats.approvedCount}/{stats.totalCount} approved</span>
      </div>
    </section>
  );
}

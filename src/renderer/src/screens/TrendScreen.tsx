import { effectiveTimeZone } from "@shared/platform";
import { formatPeriod, formatTodayPeriod, formatTrackedDuration } from "@shared/timeline";
import type { TrackedTimeComparison } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarDays, Clock3 } from "lucide-react";
import { DevicePicker, visibleDevicesForPicker } from "../components/DevicePicker";
import { TrendCard } from "../components/timeline";
import { MetricCard, Skeleton } from "../components/ui";

function TrendSkeleton() {
  return (
    <div className="trend-skeleton" role="status" aria-live="polite">
      <span className="sr-only">Building your activity trend…</span>
      <Skeleton className="trend-skeleton-chart" />
    </div>
  );
}

function changePercent(deltaSeconds: number, previousSeconds: number) {
  const percent = Math.round((Math.abs(deltaSeconds) / previousSeconds) * 100);
  return percent < 1 ? "<1%" : `${percent}%`;
}

function comparisonDetail(comparison: TrackedTimeComparison, previousLabel: string) {
  if (comparison.previousSeconds <= 0) return `No time ${previousLabel}`;
  if (comparison.deltaSeconds === 0) return `Same as ${previousLabel}`;
  const amount = formatTrackedDuration(Math.abs(comparison.deltaSeconds));
  const direction = comparison.deltaSeconds > 0 ? "more than" : "less than";
  return `${amount} ${direction} ${previousLabel} · ${changePercent(comparison.deltaSeconds, comparison.previousSeconds)}`;
}

export function TrendScreen({ state }: { state: AppSnapshot }) {
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const visibleDevices = visibleDevicesForPicker(state.devices, state.hiddenDeviceKeys);
  const comparisons = state.trendComparisons;
  return (
    <div className="trend-page" data-testid="trend-page">
      <header className="today-chrome">
        <h2 className="today-chrome-title">
          <span>Activity</span>
          <span className="today-chrome-slash">/</span>
          <span>
            {state.insightsPeriod === "day"
              ? formatTodayPeriod("day", new Date(state.insightsAnchor), timeZone)
              : formatPeriod(state.insightsPeriod, new Date(state.insightsAnchor), timeZone)}
          </span>
        </h2>
        <div className="today-chrome-controls">
          <DevicePicker
            devices={state.devices}
            hiddenDeviceKeys={state.hiddenDeviceKeys}
            value={state.insightsDeviceKey}
            onChange={(key) => window.stopscrolling.setInsightsDevice(key)}
            ariaLabel="Trend devices"
          />
        </div>
      </header>
      {state.loadingEntries ? <TrendSkeleton /> : (
        <>
          {comparisons ? (
            <section className="stats">
              <MetricCard
                label="Day over day"
                value={formatTrackedDuration(comparisons.day.currentSeconds)}
                detail={comparisonDetail(comparisons.day, "yesterday")}
                icon={Clock3}
              />
              <MetricCard
                label="Week over week"
                value={formatTrackedDuration(comparisons.week.currentSeconds)}
                detail={comparisonDetail(comparisons.week, "last week")}
                icon={CalendarDays}
              />
            </section>
          ) : null}
          <TrendCard
            buckets={state.snapshot.buckets}
            period={state.insightsPeriod}
            devices={visibleDevices}
          />
        </>
      )}
    </div>
  );
}

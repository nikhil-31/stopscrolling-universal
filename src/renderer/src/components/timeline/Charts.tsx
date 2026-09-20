import {
  colorForCategory,
  durationAxisTicks,
  formatDuration,
} from "@shared/timeline";
import type {
  InsightsPeriod,
  ScreenTimeCategoryBreakdown,
  ScreenTimePeriodBucket,
} from "@shared/types";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { Card, EmptyState } from "../ui";

export function PieChart({ categories }: { categories: ScreenTimeCategoryBreakdown[] }) {
  const total = categories.reduce((sum, item) => sum + item.seconds, 0);
  let angle = 0;
  const slices = categories.map((item) => {
    const sweep = total ? (item.seconds / total) * 360 : 0;
    const start = angle;
    angle += sweep;
    return `${colorForCategory(item.category)} ${start}deg ${angle}deg`;
  });

  if (!categories.length) {
    return <EmptyState title="No breakdown yet" body="Categories appear after activity is tracked." icon={PieChartIcon} />;
  }

  return (
    <div className="donut-card">
      <div className="donut-wrap">
        <div
          className="pie"
          data-testid="category-pie-chart"
          role="img"
          aria-label={categories
            .map((item) => `${item.category} ${formatDuration(item.seconds)}, ${Math.round(item.percentage * 100)} percent`)
            .join(", ")}
          style={{ background: `conic-gradient(${slices.join(",")})` }}
        />
        <div className="donut-center">
          <strong>{formatDuration(total)}</strong>
          <span>Total time</span>
        </div>
      </div>
      <div className="legend">
        {categories.slice(0, 6).map((item) => (
          <span className="legend-item" key={item.category}>
            <span
              className="legend-dot"
              style={{ ["--swatch" as string]: colorForCategory(item.category) }}
            />
            {item.category} · {formatDuration(item.seconds)} · {Math.round(item.percentage * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function BucketBars({
  buckets,
  period,
}: {
  buckets: ScreenTimePeriodBucket[];
  period?: InsightsPeriod;
}) {
  const max = Math.max(0, ...buckets.map((bucket) => bucket.seconds));
  if (!buckets.length) {
    return <EmptyState title="No trend data" body="Track some activity to reveal your rhythm." icon={BarChart3} />;
  }

  const dense = period === "month";
  const axis = durationAxisTicks(max);
  return (
    <div className="bar-chart-frame">
      <div className="bar-y-axis" data-testid="activity-trend-y-axis" aria-hidden="true">
        {axis.ticks.map((tick) => (
          <span
            key={tick.seconds}
            className="bar-y-tick"
            style={{ bottom: `${tick.fraction * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div
        className={`bar-chart ${dense ? "bar-chart-month" : ""}`}
        role="img"
        aria-label={`Tracked time chart, 0 to ${formatDuration(axis.max)}`}
        style={{ ["--bucket-count" as string]: buckets.length }}
      >
        <div className="bar-grid" aria-hidden="true">
          {axis.ticks.map((tick) => (
            <span
              key={tick.seconds}
              className={`bar-grid-line ${tick.fraction === 0 ? "is-baseline" : ""}`}
              style={{ bottom: `${tick.fraction * 100}%` }}
            />
          ))}
        </div>
        {buckets.map((bucket) => {
          const height = axis.max && bucket.seconds ? Math.max(2, (bucket.seconds / axis.max) * 100) : 0;
          return (
            <div
              className="bar-item"
              key={bucket.id}
              title={`${bucket.label}: ${formatDuration(bucket.seconds)}`}
              style={{ ["--height" as string]: `${height}%` }}
            >
              <span className="bar-value">{formatDuration(bucket.seconds)}</span>
              <span className="bar-column" style={{ height: `${height}%` }} />
              <span className="bar-label">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrendCard({
  buckets,
  period,
}: {
  buckets: ScreenTimePeriodBucket[];
  period?: InsightsPeriod;
}) {
  return (
    <Card className={`chart-card ${period === "month" ? "chart-card-month" : ""}`}>
      <div className="data-card-header">
        <div>
          <h3 className="data-card-title">Activity trend</h3>
          <div className="data-card-subtitle">Tracked time across this period</div>
        </div>
      </div>
      <BucketBars buckets={buckets} period={period} />
    </Card>
  );
}

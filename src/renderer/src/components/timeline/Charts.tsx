import {
  colorForCategory,
  formatDuration,
} from "@shared/timeline";
import type {
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
            .map((item) => `${item.category} ${Math.round(item.percentage * 100)} percent`)
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
            {item.category} · {Math.round(item.percentage * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function BucketBars({ buckets }: { buckets: ScreenTimePeriodBucket[] }) {
  const max = Math.max(0, ...buckets.map((bucket) => bucket.seconds));
  if (!max) {
    return <EmptyState title="No trend data" body="Track some activity to reveal your rhythm." icon={BarChart3} />;
  }

  return (
    <div className="bar-chart" role="img" aria-label="Tracked time chart">
      {buckets.map((bucket) => {
        const height = Math.max(2, (bucket.seconds / max) * 100);
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
  );
}

export function TrendCard({ buckets }: { buckets: ScreenTimePeriodBucket[] }) {
  return (
    <Card className="chart-card">
      <div className="data-card-header">
        <div>
          <h3 className="data-card-title">Activity trend</h3>
          <div className="data-card-subtitle">Tracked time across this period</div>
        </div>
      </div>
      <BucketBars buckets={buckets} />
    </Card>
  );
}

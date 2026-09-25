import { memo, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { deviceColor, displayNameForDevice } from "@shared/device";
import {
  colorForCategory,
  dayAxisHour,
  dayHourTitle,
  durationAxisTicks,
  formatDuration,
} from "@shared/timeline";
import type {
  ClockFormat,
  DeviceListEntry,
  InsightsPeriod,
  ScreenTimeBucketDevice,
  ScreenTimeCategoryBreakdown,
  ScreenTimePeriodBucket,
} from "@shared/types";
import { useClockFormat } from "../../clock-format";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { hoverCardPosition } from "./SessionHoverCard";
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

function deviceName(key: string, devices: DeviceListEntry[]) {
  const split = key.indexOf("|");
  const platform = split < 0 ? "" : key.slice(0, split);
  const name = split < 0 ? key : key.slice(split + 1);
  return displayNameForDevice(platform, name, devices);
}

function dayBucketHour(bucket: ScreenTimePeriodBucket) {
  const match = /^day-(\d+)$/.exec(bucket.id);
  return match ? Number(match[1]) : null;
}

function DayAxisLabel({
  bucket,
  period,
  clockFormat,
}: {
  bucket: ScreenTimePeriodBucket;
  period?: InsightsPeriod;
  clockFormat: ClockFormat;
}) {
  if (period !== "day") return <span className="bar-label">{bucket.label}</span>;
  const hour = dayBucketHour(bucket);
  if (hour == null) return <span className="bar-label">{bucket.label}</span>;
  const { text, period: meridiem } = dayAxisHour(hour, clockFormat);
  return (
    <span className="bar-label">
      {text}
      {meridiem ? <span className="bar-label-period">{meridiem}</span> : null}
    </span>
  );
}

function periodDeviceKeys(buckets: ScreenTimePeriodBucket[]) {
  const keys = new Set<string>();
  for (const bucket of buckets) {
    for (const share of bucket.devices ?? []) keys.add(share.key);
  }
  return [...keys];
}

function orderedShares(shares: ScreenTimeBucketDevice[], devices: DeviceListEntry[]) {
  const order = new Map(devices.map((device, index) => [device.visibilityKey, index]));
  return [...shares].sort((a, b) => (order.get(a.key) ?? devices.length) - (order.get(b.key) ?? devices.length));
}

function ActivityBarHover({
  bucket,
  devices,
  clockFormat,
  x,
  y,
}: {
  bucket: ScreenTimePeriodBucket;
  devices: DeviceListEntry[];
  clockFormat: ClockFormat;
  x: number;
  y: number;
}) {
  const hour = dayBucketHour(bucket);
  const title = hour == null ? bucket.label : dayHourTitle(hour, clockFormat);
  const shares = orderedShares(bucket.devices ?? [], devices);
  const appRows = shares.reduce((sum, share) => sum + (share.apps?.length ?? 0), 0);
  const cardHeight = 48 + shares.length * 28 + appRows * 16;
  const { left, top } = hoverCardPosition(x, y, cardHeight);
  return createPortal(
    <div className="native-hover-card activity-bar-hover" data-testid="activity-bar-hover" style={{ left, top }}>
      <div className="native-hover-heading">
        <strong>{title}</strong>
        <span>{formatDuration(bucket.seconds)}</span>
      </div>
      {shares.length ? (
        <div className="native-hover-items">
          {shares.map((share) => (
            <div key={share.key} className="activity-bar-hover-device">
              <div className="activity-bar-hover-device-row">
                <span className="legend-dot" style={{ ["--swatch" as string]: deviceColor(share.key, devices) }} />
                <span>{deviceName(share.key, devices)}</span>
                <span>{formatDuration(share.seconds)}</span>
              </div>
              {share.apps?.length ? (
                <div className="activity-bar-hover-apps">
                  {share.apps.map((app) => (
                    <div key={app.label}>
                      <span>{app.label}</span>
                      <span>{formatDuration(app.seconds)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export function BucketBars({
  buckets,
  period,
  devices = [],
  clockFormat,
}: {
  buckets: ScreenTimePeriodBucket[];
  period?: InsightsPeriod;
  devices?: DeviceListEntry[];
  clockFormat?: ClockFormat;
}) {
  const selectedFormat = clockFormat ?? useClockFormat();
  const [hover, setHover] = useState<{ bucket: ScreenTimePeriodBucket; x: number; y: number } | null>(null);
  const max = Math.max(0, ...buckets.map((bucket) => bucket.seconds));
  if (!buckets.length) {
    return <EmptyState title="No trend data" body="Track some activity to reveal your rhythm." icon={BarChart3} />;
  }

  const keysInPeriod = periodDeviceKeys(buckets);
  const stacked = keysInPeriod.length >= 2;
  const singleDeviceKey = keysInPeriod.length === 1 ? keysInPeriod[0] : null;
  const known = devices.map((device) => device.visibilityKey).filter((key) => keysInPeriod.includes(key));
  const legendKeys = stacked
    ? [...known, ...keysInPeriod.filter((key) => !known.includes(key))]
    : [];
  const dense = period === "month";
  const axis = durationAxisTicks(max);
  const trackHover = (bucket: ScreenTimePeriodBucket, event: PointerEvent<HTMLDivElement>) => {
    setHover({ bucket, x: event.clientX, y: event.clientY });
  };
  return (
    <>
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
          className={`bar-chart ${dense ? "bar-chart-month" : ""} ${period === "day" ? "bar-chart-day" : ""}`}
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
            const shares = stacked ? orderedShares(bucket.devices ?? [], devices) : [];
            const singleDeviceColor = singleDeviceKey && (bucket.devices ?? []).some((share) => share.key === singleDeviceKey)
              ? deviceColor(singleDeviceKey, devices)
              : undefined;
            return (
              <div
                className="bar-item"
                key={bucket.id}
                style={{ ["--height" as string]: `${height}%` }}
                onPointerEnter={(event) => trackHover(bucket, event)}
                onPointerMove={(event) => trackHover(bucket, event)}
                onPointerLeave={() => setHover(null)}
              >
                <span className="bar-value">{formatDuration(bucket.seconds)}</span>
                <span
                  className={`bar-column ${shares.length ? "is-stacked" : ""}`}
                  style={{
                    height: `${height}%`,
                    ...(singleDeviceColor ? { background: singleDeviceColor } : {}),
                  }}
                >
                  {shares.map((share) => (
                    <span
                      key={share.key}
                      className="bar-device"
                      style={{
                        flexGrow: share.seconds,
                        background: deviceColor(share.key, devices),
                      }}
                    />
                  ))}
                </span>
                <DayAxisLabel bucket={bucket} period={period} clockFormat={selectedFormat} />
              </div>
            );
          })}
        </div>
      </div>
      {legendKeys.length ? (
        <div className="legend" data-testid="activity-trend-legend">
          {legendKeys.map((key) => (
            <span className="legend-item" key={key}>
              <span className="legend-dot" style={{ ["--swatch" as string]: deviceColor(key, devices) }} />
              {deviceName(key, devices)}
            </span>
          ))}
        </div>
      ) : null}
      {hover ? <ActivityBarHover bucket={hover.bucket} devices={devices} clockFormat={selectedFormat} x={hover.x} y={hover.y} /> : null}
    </>
  );
}

export const TrendCard = memo(function TrendCard({
  buckets,
  period,
  devices = [],
  clockFormat,
}: {
  buckets: ScreenTimePeriodBucket[];
  period?: InsightsPeriod;
  devices?: DeviceListEntry[];
  clockFormat?: ClockFormat;
}) {
  return (
    <Card className={`chart-card ${period === "month" ? "chart-card-month" : ""}`}>
      <div className="data-card-header">
        <div>
          <h3 className="data-card-title">Activity trend</h3>
          <div className="data-card-subtitle">Tracked time across this period</div>
        </div>
      </div>
      <BucketBars buckets={buckets} period={period} devices={devices} clockFormat={clockFormat} />
    </Card>
  );
});

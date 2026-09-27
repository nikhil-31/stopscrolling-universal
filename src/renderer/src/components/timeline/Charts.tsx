import { memo, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { deviceColor, displayNameForDevice } from "@shared/device";
import {
  buildDeviceSeries,
  colorForCategory,
  dayAxisHour,
  dayHourTitle,
  durationAxisTicks,
  formatDuration,
  type DeviceSeries,
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
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from "lucide-react";
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

function chartToken(key: string) {
  return key.replace(/[^A-Za-z0-9_-]/g, "-");
}

function orderedDeviceSeries(series: DeviceSeries[], devices: DeviceListEntry[]) {
  const order = new Map(devices.map((device, index) => [device.visibilityKey, index]));
  return [...series].sort((a, b) => {
    const rank = (order.get(a.key) ?? devices.length) - (order.get(b.key) ?? devices.length);
    return rank || a.key.localeCompare(b.key);
  });
}

function pathCoord(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Fritsch–Carlson monotone cubic so a line never crosses back through a peak or the baseline. */
function monotoneCurve(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${pathCoord(points[0].x)} ${pathCoord(points[0].y)}`;
  const slopes: number[] = [];
  const gaps: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    gaps[index] = points[index + 1].x - points[index].x;
    slopes[index] = (points[index + 1].y - points[index].y) / gaps[index];
  }
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];
    if (slopes[index - 1] * slopes[index] <= 0) return 0;
    return (slopes[index - 1] + slopes[index]) / 2;
  });
  for (let index = 0; index < slopes.length; index += 1) {
    if (slopes[index] === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = tangents[index] / slopes[index];
    const beta = tangents[index + 1] / slopes[index];
    const magnitude = Math.hypot(alpha, beta);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[index] = scale * alpha * slopes[index];
      tangents[index + 1] = scale * beta * slopes[index];
    }
  }
  let path = `M ${pathCoord(points[0].x)} ${pathCoord(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const gap = gaps[index];
    const controlStartX = points[index].x + gap / 3;
    const controlStartY = points[index].y + tangents[index] * gap / 3;
    const controlEndX = points[index + 1].x - gap / 3;
    const controlEndY = points[index + 1].y - tangents[index + 1] * gap / 3;
    path += ` C ${pathCoord(controlStartX)} ${pathCoord(controlStartY)} ${pathCoord(controlEndX)} ${pathCoord(controlEndY)} ${pathCoord(points[index + 1].x)} ${pathCoord(points[index + 1].y)}`;
  }
  return path;
}

export function DeviceLineChart({
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
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const series = orderedDeviceSeries(buildDeviceSeries(buckets), devices);
  const peak = Math.max(0, ...series.flatMap((line) => line.points.map((point) => point.seconds)));
  if (!series.some((line) => line.totalSeconds > 0)) {
    return <EmptyState title="No activity yet" body="Each device draws its own line once it records time." icon={LineChartIcon} />;
  }

  const axis = durationAxisTicks(peak);
  const plotHeight = 100;
  const pointFor = (seconds: number, index: number) => ({
    x: index + 0.5,
    y: plotHeight * (1 - seconds / axis.max),
  });
  const curves = series.map((line) => {
    const points = line.points.map((point, index) => pointFor(point.seconds, index));
    const curve = monotoneCurve(points);
    const area = `${curve} L ${pathCoord(points[points.length - 1].x)} ${plotHeight} L ${pathCoord(points[0].x)} ${plotHeight} Z`;
    return { line, curve, area };
  });
  const ariaLabel = `Activity by device, ${series
    .map((line) => `${deviceName(line.key, devices)} ${formatDuration(line.totalSeconds)}`)
    .join(", ")}`;
  const trackHover = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const index = Math.min(buckets.length - 1, Math.max(0, Math.floor(ratio * buckets.length)));
    setHover({ index, x: event.clientX, y: event.clientY });
  };
  const hoveredBucket = hover == null ? null : buckets[hover.index];
  return (
    <>
      <div className="line-chart-frame">
        <div className="bar-y-axis line-chart-y-axis" data-testid="activity-line-y-axis" aria-hidden="true">
          {axis.ticks.map((tick) => (
            <span key={tick.seconds} className="bar-y-tick" style={{ bottom: `${tick.fraction * 100}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
        <div
          className="line-chart-plot"
          onPointerEnter={trackHover}
          onPointerMove={trackHover}
          onPointerLeave={() => setHover(null)}
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
          <svg
            className="line-chart"
            viewBox={`0 0 ${buckets.length} ${plotHeight}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
          >
            <defs>
              {series.map((line) => {
                const token = chartToken(line.key);
                const color = deviceColor(line.key, devices);
                return (
                  <g key={line.key}>
                    <linearGradient id={`line-${token}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={color} stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id={`area-${token}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </g>
                );
              })}
            </defs>
            {curves.map(({ line, area }) => (
              <path key={`area-${line.key}`} className="line-chart-area" d={area} fill={`url(#area-${chartToken(line.key)})`} />
            ))}
            {curves.map(({ line, curve }) => (
              <path
                key={`line-${line.key}`}
                className="line-chart-line"
                d={curve}
                fill="none"
                stroke={`url(#line-${chartToken(line.key)})`}
              />
            ))}
          </svg>
          {hover && hoveredBucket ? (
            <>
              <span
                className="line-chart-guide"
                style={{ left: `${((hover.index + 0.5) / buckets.length) * 100}%` }}
              />
              {series.map((line) => (
                <span
                  key={line.key}
                  className="line-chart-dot"
                  style={{
                    left: `${((hover.index + 0.5) / buckets.length) * 100}%`,
                    bottom: `${((line.points[hover.index]?.seconds ?? 0) / axis.max) * 100}%`,
                    background: deviceColor(line.key, devices),
                  }}
                />
              ))}
            </>
          ) : null}
        </div>
        <div className={`line-chart-axis ${period === "day" ? "is-day" : ""} ${period === "month" ? "is-month" : ""}`}>
          {buckets.map((bucket) => (
            <div className="line-chart-tick" key={bucket.id}>
              <DayAxisLabel bucket={bucket} period={period} clockFormat={selectedFormat} />
            </div>
          ))}
        </div>
      </div>
      {series.length >= 2 ? (
        <div className="legend" data-testid="activity-line-legend">
          {series.map((line) => (
            <span className="legend-item" key={line.key}>
              <span className="legend-dot" style={{ ["--swatch" as string]: deviceColor(line.key, devices) }} />
              {deviceName(line.key, devices)}
            </span>
          ))}
        </div>
      ) : null}
      {hover && hoveredBucket ? (
        <ActivityBarHover bucket={hoveredBucket} devices={devices} clockFormat={selectedFormat} x={hover.x} y={hover.y} />
      ) : null}
    </>
  );
}

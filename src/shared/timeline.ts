import { websiteHostname } from "./browser";
import { deviceKey, resolvedDeviceName } from "./device";
import { persistenceKey } from "./payload";
import { endOfDay, startOfDay, toDateInput } from "./platform";
import type {
  InsightsPeriod,
  InsightsTab,
  ScreenTimeAppBreakdown,
  ScreenTimeCategoryBreakdown,
  ScreenTimeDeviceTimeline,
  ScreenTimeEntry,
  ScreenTimePeriodBucket,
  ScreenTimeSessionBlock,
  ScreenTimeSnapshot,
  ScreenTimeSyncSession,
  ScreenTimeTimelineSegment,
  TodayPeriod,
} from "./types";

export const fiveMinutes = 5 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export const categoryColors: Record<string, string> = {
  Development: "#6b78fa",
  Productivity: "#1fb894",
  Communication: "#478ff5",
  Entertainment: "#9e6bf0",
  Video: "#f05c94",
  Social: "#fa8047",
  Web: "#2eaddb",
  Application: "#52bd85",
  Utilities: "#858fa3",
  Email: "#4d8aea",
};

const spectrum = [
  "#6b78fa",
  "#1fb894",
  "#fa8047",
  "#9e6bf0",
  "#f05c94",
  "#2eaddb",
  "#db9433",
  "#5cad70",
  "#8a70e6",
  "#e66b5c",
];

function stableIndex(key: string) {
  let hash = 0;
  for (const char of key) hash = char.charCodeAt(0) + hash * 31;
  return Math.abs(hash);
}

export function colorForCategory(key: string) {
  return categoryColors[key] ?? spectrum[stableIndex(key) % spectrum.length];
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

export function monthGridDays(month: Date) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor < end || days.length % 7 !== 0) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    if (days.length >= 42) break;
  }
  return days;
}

export function periodBounds(period: InsightsPeriod, anchor: Date) {
  if (period === "day") {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  if (period === "week") {
    const start = startOfDay(anchor);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    return { start, end: new Date(start.getTime() + 7 * dayMs) };
  }
  if (period === "month") {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  return { start, end: new Date(anchor.getFullYear() + 1, 0, 1) };
}

export function todayPeriodBounds(period: TodayPeriod, anchor: Date) {
  if (period === "month") return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  return periodBounds(period, anchor);
}

export function shiftTodayAnchor(period: TodayPeriod, anchor: Date, direction: number) {
  const next = new Date(anchor);
  if (period === "week") next.setDate(next.getDate() + direction * 7);
  else if (period === "month") next.setMonth(next.getMonth() + direction);
  else next.setDate(next.getDate() + direction);
  return next;
}

export function formatTodayPeriod(period: TodayPeriod, anchor: Date) {
  if (period === "day") {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(anchor);
  }
  if (period === "week") return formatPeriod("week", anchor);
  return formatMonthLabel(anchor);
}

export function normalizeTodayTab(tab: string): "timeline" | "eventLog" {
  return tab === "eventLog" ? "eventLog" : "timeline";
}

export function normalizeInsightsTab(tab: string): InsightsTab {
  return tab === "sessions" ? "sessions" : "overview";
}

export const ALL_INSIGHTS_DEVICES = "all";
export const ALL_DEVICES = ALL_INSIGHTS_DEVICES;

export function normalizeInsightsDeviceKey(key: string, knownVisibleKeys: string[]): string {
  if (key !== ALL_INSIGHTS_DEVICES && knownVisibleKeys.includes(key)) return key;
  return ALL_INSIGHTS_DEVICES;
}

export function filterEntriesForInsights(
  entries: ScreenTimeEntry[],
  selectedKey: string,
  hiddenKeys: Iterable<string>,
): ScreenTimeEntry[] {
  const hidden = hiddenKeys instanceof Set ? hiddenKeys : new Set(hiddenKeys);
  const visible = entries.filter((entry) => !hidden.has(deviceKey(entry.platform, entry.deviceName)));
  if (selectedKey === ALL_INSIGHTS_DEVICES) return visible;
  return visible.filter((entry) => deviceKey(entry.platform, entry.deviceName) === selectedKey);
}

export function filterTimelinesForInsights(
  timelines: ScreenTimeDeviceTimeline[],
  selectedKey: string,
): ScreenTimeDeviceTimeline[] {
  if (selectedKey === ALL_INSIGHTS_DEVICES) return timelines;
  return timelines.filter(
    (timeline) => deviceKey(timeline.devicePlatform, timeline.deviceName) === selectedKey,
  );
}

export function timelineAxisTicks(start: Date, end: Date) {
  const span = Math.max(1, end.getTime() - start.getTime());
  const hours = span / (60 * 60 * 1000);
  if (hours <= 26) {
    return [3, 6, 9, 12, 15, 18, 21].map((hour) => ({
      fraction: hour / 24,
      label: `${hour}:00`,
    }));
  }
  if (hours <= 8 * 24) {
    const days = Math.max(1, Math.round(hours / 24));
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * dayMs);
      return {
        fraction: (index + 0.5) / days,
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
      };
    });
  }
  const days = Math.max(1, Math.round(hours / 24));
  const step = Math.max(1, Math.round(days / 7));
  const ticks: Array<{ fraction: number; label: string }> = [];
  for (let index = 0; index < days; index += step) {
    const date = new Date(start.getTime() + index * dayMs);
    ticks.push({
      fraction: (index + 0.5) / days,
      label: `${date.getDate()}`,
    });
  }
  return ticks;
}

export function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatClock(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatPeriod(period: InsightsPeriod, anchor: Date) {
  const bounds = periodBounds(period, anchor);
  if (period === "day") return formatDayLabel(anchor);
  if (period === "week") {
    return `${formatDayLabel(bounds.start)} – ${formatDayLabel(new Date(bounds.end.getTime() - dayMs))}`;
  }
  if (period === "month") return formatMonthLabel(anchor);
  return `${anchor.getFullYear()}`;
}

export function hourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return "12a";
  if (normalized === 12) return "12p";
  if (normalized < 12) return `${normalized}a`;
  return `${normalized - 12}p`;
}

export const VERTICAL_TIMELINE_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const VERTICAL_TIMELINE_HOUR_HEIGHT = 56;
const VERTICAL_INSET = 0.06;
const VERTICAL_MAX_ENTRY_WIDTH = 0.68;
const VERTICAL_COLUMN_GAP = 0.012;

export interface TimelineIntervalItem {
  id: string;
  start: Date;
  end: Date;
}

export interface TimelineColumnPlacement {
  column: number;
  columnCount: number;
}

export interface TimelineBlockPlacement {
  id: string;
  start: Date;
  end: Date;
  yFraction: number;
  heightFraction: number;
  xFraction: number;
  widthFraction: number;
}

export function clipDayFraction(start: Date, end: Date, dayStart: Date, dayEnd: Date) {
  const dayDuration = dayEnd.getTime() - dayStart.getTime();
  if (dayDuration <= 0) return { yFraction: 0, heightFraction: 0 };
  const clippedStart = Math.max(start.getTime(), dayStart.getTime());
  const clippedEnd = Math.min(end.getTime(), dayEnd.getTime());
  if (clippedEnd <= clippedStart) return { yFraction: 0, heightFraction: 0 };
  const yFraction = Math.min(1, Math.max(0, (clippedStart - dayStart.getTime()) / dayDuration));
  const heightFraction = Math.min(1, Math.max(0, (clippedEnd - clippedStart) / dayDuration));
  return { yFraction, heightFraction };
}

export function columnPlacements(items: TimelineIntervalItem[]): Map<string, TimelineColumnPlacement> {
  const placements = new Map<string, TimelineColumnPlacement>();
  if (!items.length) return placements;

  const sorted = [...items].sort((a, b) => {
    const startDelta = a.start.getTime() - b.start.getTime();
    if (startDelta !== 0) return startDelta;
    return b.end.getTime() - a.end.getTime();
  });

  let index = 0;
  while (index < sorted.length) {
    const cluster = [sorted[index]];
    let clusterEnd = sorted[index].end.getTime();
    let next = index + 1;
    while (next < sorted.length && sorted[next].start.getTime() < clusterEnd) {
      cluster.push(sorted[next]);
      clusterEnd = Math.max(clusterEnd, sorted[next].end.getTime());
      next += 1;
    }

    const columnEnds: number[] = [];
    const clusterPlacements: Array<{ id: string; column: number }> = [];
    for (const item of [...cluster].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const column = columnEnds.findIndex((end) => end <= item.start.getTime());
      if (column >= 0) {
        columnEnds[column] = item.end.getTime();
        clusterPlacements.push({ id: item.id, column });
      } else {
        clusterPlacements.push({ id: item.id, column: columnEnds.length });
        columnEnds.push(item.end.getTime());
      }
    }

    const columnCount = Math.max(1, columnEnds.length);
    for (const placement of clusterPlacements) {
      placements.set(placement.id, { column: placement.column, columnCount });
    }
    index = next;
  }

  return placements;
}

export function sessionBlockPlacements(
  blocks: ScreenTimeSessionBlock[],
  dayStart: Date,
  dayEnd: Date,
  now = Date.now(),
): TimelineBlockPlacement[] {
  const isCurrentDay = dayStart.getTime() <= now && now < dayEnd.getTime();
  const visible = blocks.filter((block) => {
    const start = new Date(block.start);
    const end = new Date(block.end);
    if (end.getTime() <= dayStart.getTime() || start.getTime() >= dayEnd.getTime()) return false;
    if (isCurrentDay && start.getTime() > now) return false;
    return true;
  });

  const items: TimelineIntervalItem[] = visible.map((block) => ({
    id: block.id,
    start: new Date(block.start),
    end: new Date(block.end),
  }));
  const columns = columnPlacements(items);
  const availableWidth = Math.max(0, 1 - VERTICAL_INSET * 2);

  return items.flatMap((item) => {
    const column = columns.get(item.id);
    const time = clipDayFraction(item.start, item.end, dayStart, dayEnd);
    if (!column || time.heightFraction <= 0) return [];
    let widthFraction: number;
    let xFraction: number;
    if (column.columnCount === 1) {
      widthFraction = Math.min(VERTICAL_MAX_ENTRY_WIDTH, availableWidth);
      xFraction = VERTICAL_INSET;
    } else {
      const slotWidth = availableWidth / column.columnCount;
      widthFraction = Math.max(0, slotWidth - VERTICAL_COLUMN_GAP);
      xFraction = VERTICAL_INSET + column.column * slotWidth;
    }
    return [
      {
        id: item.id,
        start: item.start,
        end: item.end,
        yFraction: time.yFraction,
        heightFraction: time.heightFraction,
        xFraction,
        widthFraction,
      },
    ];
  });
}

export function entryFromSession(
  session: ScreenTimeSyncSession,
  fallbackPlatform = "",
  fallbackDeviceName = "",
  fallbackTimeZone = "",
): ScreenTimeEntry {
  const title = session.title || session.process_name || session.app_name;
  const appName = session.process_name || session.app_name || title;
  const platform = session.device_platform || fallbackPlatform;
  const deviceName = session.device_name || fallbackDeviceName;
  const timeZone = session.time_zone || fallbackTimeZone;
  const entry: ScreenTimeEntry = {
    id: "",
    startTimeUTC: session.started_at,
    endTimeUTC: session.ended_at,
    title,
    url: session.url || "",
    bundleID: session.app_bundle_id || "",
    appName,
    category: session.app_category || "Application",
    platform,
    deviceName,
    timeZoneIdentifier: timeZone,
    source: "sync",
  };
  entry.id = persistenceKey(entry);
  return entry;
}

export function segmentFromEntry(entry: ScreenTimeEntry): ScreenTimeTimelineSegment {
  const label = entry.title || entry.appName || "Activity";
  return {
    id: entry.id || persistenceKey(entry),
    start: entry.startTimeUTC,
    end: entry.endTimeUTC,
    label,
    subtitle: entry.url || entry.appName,
    url: entry.url,
    bundleID: entry.bundleID,
    category: entry.category || "Application",
    appName: entry.appName || label,
    devicePlatform: entry.platform,
    deviceName: entry.deviceName,
    timeZoneIdentifier: entry.timeZoneIdentifier,
    isLive: entry.source === "live",
  };
}

export function blockSegments(segments: ScreenTimeTimelineSegment[]): ScreenTimeSessionBlock[] {
  const sorted = [...segments].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const blocks: ScreenTimeSessionBlock[] = [];
  let current: ScreenTimeTimelineSegment[] = [];

  for (const segment of sorted) {
    const previous = current[current.length - 1];
    if (!previous || new Date(segment.start).getTime() - new Date(previous.end).getTime() <= fiveMinutes) {
      current.push(segment);
    } else {
      blocks.push(createBlock(current));
      current = [segment];
    }
  }
  if (current.length) blocks.push(createBlock(current));
  return blocks;
}

function createBlock(segments: ScreenTimeTimelineSegment[]): ScreenTimeSessionBlock {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const durationSeconds = segments.reduce((total, segment) => {
    return total + Math.max(0, (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000);
  }, 0);

  return {
    id: `block-${first.id}-${last.id}`,
    start: first.start,
    end: last.end,
    title: first.label,
    subtitle: segments.length === 1 ? first.subtitle : `${segments.length} activities`,
    category: first.category,
    devicePlatform: first.devicePlatform,
    deviceName: first.deviceName,
    durationSeconds,
    items: segments.map((segment) => ({
      id: segment.id,
      title: segment.label,
      subtitle: segment.subtitle,
      url: segment.url,
      category: segment.category,
      appName: segment.appName,
      start: segment.start,
      end: segment.end,
      durationSeconds: Math.max(0, (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000),
    })),
  };
}

export function entriesToTimelines(
  entries: ScreenTimeEntry[],
  anchor: Date,
  extraDeviceKeys: Array<{ platform: string; name: string; timeZone?: string }> = [],
  bounds?: { start: Date; end: Date },
): ScreenTimeDeviceTimeline[] {
  const window = bounds ?? periodBounds("day", anchor);
  const byKey = new Map<string, ScreenTimeTimelineSegment[]>();
  for (const entry of entries) {
    if (new Date(entry.endTimeUTC).getTime() <= window.start.getTime()) continue;
    if (new Date(entry.startTimeUTC).getTime() >= window.end.getTime()) continue;
    const key = deviceKey(entry.platform, entry.deviceName);
    const list = byKey.get(key) ?? [];
    list.push(segmentFromEntry(entry));
    byKey.set(key, list);
  }
  for (const extra of extraDeviceKeys) {
    const key = deviceKey(extra.platform, extra.name);
    if (!byKey.has(key)) byKey.set(key, []);
  }
  return Array.from(byKey.entries()).map(([key, segments]) => {
    const [platform, name] = key.split("|");
    return {
      id: key,
      deviceName: name,
      devicePlatform: platform,
      timeZoneIdentifier: segments[0]?.timeZoneIdentifier ?? extraDeviceKeys.find((d) => deviceKey(d.platform, d.name) === key)?.timeZone ?? "",
      dayStart: window.start.toISOString(),
      dayEnd: window.end.toISOString(),
      segments,
      blocks: blockSegments(segments),
    };
  });
}

export function filterVisibleTimelines(timelines: ScreenTimeDeviceTimeline[], hiddenKeys: Set<string>) {
  return timelines.filter((timeline) => !hiddenKeys.has(deviceKey(timeline.devicePlatform, timeline.deviceName)));
}

export function segmentSeconds(segment: ScreenTimeTimelineSegment) {
  return Math.max(0, (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000);
}

export function appBreakdownKey(segment: Pick<ScreenTimeTimelineSegment, "url" | "appName" | "label">) {
  const host = websiteHostname(segment.url);
  if (host) return `web|${host}`;
  return `app|${segment.appName || segment.label}`;
}

export function percentLabel(ratio: number) {
  const value = ratio > 1 ? ratio : ratio * 100;
  const percent = Math.round(value);
  return percent < 1 ? "<1%" : `${percent}%`;
}

export function buildBreakdowns(segments: ScreenTimeTimelineSegment[]) {
  const total = segments.reduce((sum, segment) => sum + segmentSeconds(segment), 0);
  const byCategory = new Map<string, number>();
  const byApp = new Map<string, { seconds: number; segment: ScreenTimeTimelineSegment; host: string }>();

  for (const segment of segments) {
    const seconds = segmentSeconds(segment);
    byCategory.set(segment.category, (byCategory.get(segment.category) ?? 0) + seconds);
    const host = websiteHostname(segment.url);
    const key = appBreakdownKey(segment);
    const existing = byApp.get(key);
    byApp.set(key, { seconds: (existing?.seconds ?? 0) + seconds, segment, host });
  }

  const categories: ScreenTimeCategoryBreakdown[] = Array.from(byCategory.entries())
    .map(([category, seconds]) => ({ category, seconds, percentage: total ? seconds / total : 0 }))
    .sort((a, b) => b.seconds - a.seconds);

  const apps: ScreenTimeAppBreakdown[] = Array.from(byApp.entries())
    .map(([key, value]) => ({
      key,
      label: value.host || value.segment.appName || value.segment.label,
      subtitle: value.host ? (value.segment.appName || "Browser") : value.segment.category,
      category: value.segment.category,
      seconds: value.seconds,
      percentage: total ? value.seconds / total : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .map((app, colorIndex) => ({ ...app, colorIndex }));

  return { total, categories, apps };
}

export function buildPeriodBuckets(
  segments: ScreenTimeTimelineSegment[],
  period: InsightsPeriod,
  anchor: Date,
  trackedSecondsByDay?: Record<string, number>,
): ScreenTimePeriodBucket[] {
  const bounds = periodBounds(period, anchor);
  const count =
    period === "day"
      ? 24
      : period === "week"
        ? 7
        : period === "month"
          ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
          : 12;
  const bucketMs = (bounds.end.getTime() - bounds.start.getTime()) / count;
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(bounds.start.getTime() + index * bucketMs);
    const end = new Date(start.getTime() + bucketMs);
    if (period === "month") {
      start.setTime(bounds.start.getTime());
      start.setDate(start.getDate() + index);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
    }
    const segmentSeconds = segments.reduce((sum, segment) => {
      const overlapStart = Math.max(start.getTime(), new Date(segment.start).getTime());
      const overlapEnd = Math.min(end.getTime(), new Date(segment.end).getTime());
      return sum + Math.max(0, (overlapEnd - overlapStart) / 1000);
    }, 0);
    const seconds =
      period === "month"
        ? trackedSecondsByDay?.[toDateInput(start)] ?? segmentSeconds
        : segmentSeconds;
    return {
      id: `${period}-${index}`,
      label:
        period === "year"
          ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(start)
          : period === "day"
            ? hourLabel(index)
            : period === "month"
              ? `${start.getDate()}`
              : formatDayLabel(start),
      start: start.toISOString(),
      end: end.toISOString(),
      seconds,
    };
  });
}

export function trackedSecondsByDay(
  entries: ScreenTimeEntry[],
  range: Date | { start: Date; end: Date },
): Record<string, number> {
  const start = range instanceof Date ? startOfMonth(range).getTime() : range.start.getTime();
  const end = range instanceof Date ? endOfMonth(range).getTime() : range.end.getTime();
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    let slice = Math.max(new Date(entry.startTimeUTC).getTime(), start);
    const limit = Math.min(new Date(entry.endTimeUTC).getTime(), end);
    while (slice < limit) {
      const nextDay = startOfDay(new Date(slice)).getTime() + dayMs;
      const sliceEnd = Math.min(limit, nextDay);
      const key = toDateInput(new Date(slice));
      totals[key] = (totals[key] ?? 0) + (sliceEnd - slice) / 1000;
      slice = sliceEnd;
    }
  }
  return totals;
}

export function sumTrackedSecondsInBounds(
  totals: Record<string, number>,
  bounds: { start: Date; end: Date },
) {
  let sum = 0;
  const cursor = startOfDay(bounds.start);
  while (cursor.getTime() < bounds.end.getTime()) {
    sum += totals[toDateInput(cursor)] ?? 0;
    cursor.setDate(cursor.getDate() + 1);
  }
  return sum;
}

export function clipSegmentsToBounds(
  segments: ScreenTimeTimelineSegment[],
  bounds: { start: Date; end: Date },
): ScreenTimeTimelineSegment[] {
  return segments.flatMap((segment) => {
    const start = Math.max(new Date(segment.start).getTime(), bounds.start.getTime());
    const end = Math.min(new Date(segment.end).getTime(), bounds.end.getTime());
    if (end <= start) return [];
    return [{ ...segment, start: new Date(start).toISOString(), end: new Date(end).toISOString() }];
  });
}

export function snapshotFromRange(
  entries: ScreenTimeEntry[],
  bounds: { start: Date; end: Date },
  serverSummary?: {
    totalSeconds?: number;
    sessionCount?: number;
    categories?: ScreenTimeCategoryBreakdown[];
    apps?: ScreenTimeAppBreakdown[];
    trackedSecondsByDay?: Record<string, number>;
  },
  bucketSpec?: { period: InsightsPeriod; anchor: Date },
): ScreenTimeSnapshot {
  const inRange = entries.filter((entry) => {
    const start = new Date(entry.startTimeUTC).getTime();
    const end = new Date(entry.endTimeUTC).getTime();
    return end > bounds.start.getTime() && start < bounds.end.getTime();
  });
  const segments = clipSegmentsToBounds(inRange.map(segmentFromEntry), bounds);
  const breakdowns = buildBreakdowns(segments);
  const categories = serverSummary?.categories?.length
    ? serverSummary.categories.map((category) => ({
        ...category,
        percentage: category.percentage > 1 ? category.percentage / 100 : category.percentage,
      }))
    : breakdowns.categories;
  const dailyTotals = {
    ...trackedSecondsByDay(inRange, bounds),
    ...serverSummary?.trackedSecondsByDay,
  };
  const dailySum = sumTrackedSecondsInBounds(dailyTotals, bounds);
  const buckets = bucketSpec
    ? buildPeriodBuckets(segments, bucketSpec.period, bucketSpec.anchor, dailyTotals)
    : [];
  const bucketSum = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const totalSeconds = serverSummary?.trackedSecondsByDay
    ? dailySum
    : serverSummary?.totalSeconds ?? Math.max(breakdowns.total, bucketSum);
  const sourceApps = breakdowns.apps.length ? breakdowns.apps : serverSummary?.apps ?? [];
  const shareBase = sourceApps.reduce((sum, app) => sum + app.seconds, 0) || totalSeconds;
  const apps = sourceApps.map((app) => ({
    ...app,
    percentage: shareBase ? app.seconds / shareBase : 0,
  }));
  return {
    totalSeconds,
    sessionCount: serverSummary?.sessionCount ?? segments.length,
    timelineSegments: segments,
    listSegments: segments,
    categories,
    apps,
    buckets,
    trackedSecondsByDay: dailyTotals,
  };
}

export function snapshotFromEntries(
  entries: ScreenTimeEntry[],
  period: InsightsPeriod,
  anchor: Date,
  serverSummary?: {
    totalSeconds?: number;
    sessionCount?: number;
    categories?: ScreenTimeCategoryBreakdown[];
    apps?: ScreenTimeAppBreakdown[];
    trackedSecondsByDay?: Record<string, number>;
  },
): ScreenTimeSnapshot {
  return snapshotFromRange(entries, periodBounds(period, anchor), serverSummary, { period, anchor });
}

export { resolvedDeviceName };
export { localTimeZoneLabel, toDateInput } from "./platform";

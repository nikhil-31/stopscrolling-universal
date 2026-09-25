import { websiteHostname } from "./browser";
import { overlayCategory, type JevCategoryCache } from "./jev";
import { deviceKey, resolvedDeviceName } from "./device";
import { persistenceKey } from "./payload";
import {
  addCalendarDays,
  endOfDay,
  endOfMonth,
  localTimeZone,
  startOfDay,
  startOfMonth,
  toDateInput,
  weekdayIndex,
  zonedDateTime,
  zonedParts,
} from "./platform";
import type {
  ClockFormat,
  InsightsPeriod,
  InsightsTab,
  ScreenTimeAppBreakdown,
  ScreenTimeBucketDevice,
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

const CATEGORY_ORDER = [
  "Development",
  "Productivity",
  "Communication",
  "Entertainment",
  "Gaming",
  "Video",
  "Social",
  "Web",
  "Application",
  "Utilities",
  "Email",
] as const;

export const categoryColors: Record<string, string> = Object.fromEntries(
  CATEGORY_ORDER.map((name) => [name, `var(--category-${name.toLowerCase()})`]),
);

const spectrum = CATEGORY_ORDER.map((_, index) => `var(--category-spectrum-${index})`);

function stableIndex(key: string) {
  let hash = 0;
  for (const char of key) hash = char.charCodeAt(0) + hash * 31;
  return Math.abs(hash);
}

export function colorForCategory(key: string) {
  return categoryColors[key] ?? spectrum[stableIndex(key) % spectrum.length];
}

export { endOfMonth, startOfMonth };

export function formatMonthLabel(date: Date, timeZone = localTimeZone()) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone }).format(date);
}

export function monthGridDays(month: Date, timeZone = localTimeZone()) {
  const start = startOfMonth(month, timeZone);
  const end = endOfMonth(month, timeZone);
  const gridStart = addCalendarDays(start, -weekdayIndex(start, timeZone), timeZone);
  const days: Date[] = [];
  let cursor = gridStart;
  while (cursor < end || days.length % 7 !== 0) {
    days.push(cursor);
    cursor = addCalendarDays(cursor, 1, timeZone);
    if (days.length >= 42) break;
  }
  return days;
}

export function periodBounds(period: InsightsPeriod, anchor: Date, timeZone = localTimeZone()) {
  if (period === "day") {
    return { start: startOfDay(anchor, timeZone), end: endOfDay(anchor, timeZone) };
  }
  if (period === "week") {
    const startDay = startOfDay(anchor, timeZone);
    const start = addCalendarDays(startDay, -weekdayIndex(startDay, timeZone), timeZone);
    return { start, end: addCalendarDays(start, 7, timeZone) };
  }
  if (period === "month") {
    return { start: startOfMonth(anchor, timeZone), end: endOfMonth(anchor, timeZone) };
  }
  const { year } = zonedParts(anchor, timeZone);
  return {
    start: zonedDateTime(year, 1, 1, timeZone),
    end: zonedDateTime(year + 1, 1, 1, timeZone),
  };
}

export function todayPeriodBounds(period: TodayPeriod, anchor: Date, timeZone = localTimeZone()) {
  if (period === "month") return { start: startOfMonth(anchor, timeZone), end: endOfMonth(anchor, timeZone) };
  return periodBounds(period, anchor, timeZone);
}

export function shiftTodayAnchor(period: TodayPeriod, anchor: Date, direction: number, timeZone = localTimeZone()) {
  const parts = zonedParts(anchor, timeZone);
  if (period === "week") return addCalendarDays(anchor, direction * 7, timeZone);
  if (period === "month") {
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + direction, 1));
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return zonedDateTime(year, month, Math.min(parts.day, lastDay), timeZone, parts.hour, parts.minute, parts.second);
  }
  return addCalendarDays(anchor, direction, timeZone);
}

export function formatTodayPeriod(period: TodayPeriod, anchor: Date, timeZone = localTimeZone()) {
  if (period === "day") {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(anchor);
  }
  if (period === "week") return formatPeriod("week", anchor, timeZone);
  return formatMonthLabel(anchor, timeZone);
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

export function clockFormatOf(value: unknown): ClockFormat {
  return value === "12" ? "12" : "24";
}

export function timelineAxisTicks(start: Date, end: Date, format: ClockFormat = "24") {
  const span = Math.max(1, end.getTime() - start.getTime());
  const hours = span / (60 * 60 * 1000);
  if (hours <= 26) {
    return [3, 6, 9, 12, 15, 18, 21].map((hour) => ({
      fraction: hour / 24,
      label: format === "12" ? hourLabelWithPeriod(hour) : `${hour}:00`,
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

const DURATION_AXIS_CEILINGS = [
  15 * 60,
  30 * 60,
  45 * 60,
  60 * 60,
  90 * 60,
  2 * 3600,
  3 * 3600,
  4 * 3600,
  6 * 3600,
  8 * 3600,
  12 * 3600,
  18 * 3600,
  24 * 3600,
];

const DURATION_AXIS_STEPS = new Set([
  5 * 60,
  10 * 60,
  15 * 60,
  20 * 60,
  30 * 60,
  45 * 60,
  60 * 60,
  90 * 60,
  2 * 3600,
  3 * 3600,
  4 * 3600,
]);

export function durationAxisTicks(maxSeconds: number) {
  const raw = Math.max(0, maxSeconds);
  const scaleMax = DURATION_AXIS_CEILINGS.find((value) => value >= raw)
    ?? Math.max(3600, Math.ceil(raw / 3600) * 3600);
  const intervals = [4, 3, 2].find((count) => DURATION_AXIS_STEPS.has(scaleMax / count)) ?? 3;
  const step = scaleMax / intervals;
  return {
    max: scaleMax,
    ticks: Array.from({ length: intervals + 1 }, (_, index) => {
      const seconds = step * index;
      return {
        seconds,
        fraction: index / intervals,
        label: seconds === 0 ? "0" : formatDuration(seconds),
      };
    }),
  };
}

export function formatClock(value: string | Date, format: ClockFormat = "24") {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, {
    hour: format === "24" ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle: format === "12" ? "h12" : "h23",
  }).format(date);
}

export function formatDayLabel(date: Date, timeZone = localTimeZone()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

export function weekNumber(anchor: Date, timeZone = localTimeZone()) {
  const { start } = periodBounds("week", anchor, timeZone);
  const parts = zonedParts(start, timeZone);
  const thursday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 4));
  const dayNum = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / dayMs + 1) / 7);
}

export function formatPeriod(period: InsightsPeriod, anchor: Date, timeZone = localTimeZone()) {
  const bounds = periodBounds(period, anchor, timeZone);
  if (period === "day") return formatDayLabel(anchor, timeZone);
  if (period === "week") {
    const last = addCalendarDays(bounds.end, -1, timeZone);
    return `Week ${weekNumber(anchor, timeZone)} · ${formatDayLabel(bounds.start, timeZone)} – ${formatDayLabel(last, timeZone)}`;
  }
  if (period === "month") return formatMonthLabel(anchor, timeZone);
  return `${zonedParts(anchor, timeZone).year}`;
}

export function hourLabel(hour: number, format: ClockFormat = "24") {
  const normalized = ((hour % 24) + 24) % 24;
  if (format === "24") return String(normalized);
  if (normalized === 0) return "12a";
  if (normalized === 12) return "12p";
  if (normalized < 12) return `${normalized}a`;
  return `${normalized - 12}p`;
}

export function hourLabelWithPeriod(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 || 12;
  return `${display} ${suffix}`;
}

export function dayAxisHour(hour: number, format: ClockFormat = "24") {
  const normalized = ((hour % 24) + 24) % 24;
  if (format === "24") return { text: String(normalized), period: "" };
  const period = normalized === 0 ? "AM" : normalized === 12 ? "PM" : "";
  return { text: String(normalized % 12 || 12), period };
}

export function dayHourTitle(hour: number, format: ClockFormat = "24") {
  const normalized = ((hour % 24) + 24) % 24;
  if (format === "24") return `${String(normalized).padStart(2, "0")}:00`;
  return hourLabelWithPeriod(normalized);
}

export function dayTrackAxis(format: ClockFormat = "24") {
  return [0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => ({
    fraction: hour / 24,
    label: hour === 24
      ? (format === "24" ? "24:00" : "12 AM")
      : format === "24"
        ? `${hour}:00`
        : hourLabelWithPeriod(hour),
  }));
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
  const sorted = segments
    .map((segment) => ({ segment, startMs: Date.parse(segment.start), endMs: Date.parse(segment.end) }))
    .sort((a, b) => a.startMs - b.startMs);
  const blocks: ScreenTimeSessionBlock[] = [];
  let current: ScreenTimeTimelineSegment[] = [];
  let previousEnd = Number.NEGATIVE_INFINITY;

  for (const item of sorted) {
    if (!current.length || item.startMs - previousEnd <= fiveMinutes) {
      current.push(item.segment);
      previousEnd = item.endMs;
    } else {
      blocks.push(createBlock(current));
      current = [item.segment];
      previousEnd = item.endMs;
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
  const windowStart = window.start.getTime();
  const windowEnd = window.end.getTime();
  const byKey = new Map<string, ScreenTimeTimelineSegment[]>();
  for (const entry of entries) {
    const end = Date.parse(entry.endTimeUTC);
    if (end <= windowStart) continue;
    const start = Date.parse(entry.startTimeUTC);
    if (start >= windowEnd) continue;
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
  return Math.max(0, (Date.parse(segment.end) - Date.parse(segment.start)) / 1000);
}

export function appBreakdownKey(segment: Pick<ScreenTimeTimelineSegment, "url" | "appName" | "label">) {
  const host = websiteHostname(segment.url);
  if (host) return `web|${host}`;
  return `app|${segment.appName || segment.label}`;
}

export function itemBreakdownKey(item: Pick<ScreenTimeSessionBlock["items"][number], "url" | "appName" | "title">) {
  return appBreakdownKey({ url: item.url, appName: item.appName, label: item.title });
}

export interface TimelineHighlightRange {
  id: string;
  start: Date;
  end: Date;
  xFraction: number;
  widthFraction: number;
}

export function blockMatchesApp(block: ScreenTimeSessionBlock, appKey: string) {
  return block.items.some((item) => itemBreakdownKey(item) === appKey);
}

export function filterSegmentsForApp(segments: ScreenTimeTimelineSegment[], appKey: string) {
  if (!appKey) return segments;
  return segments.filter((segment) => appBreakdownKey(segment) === appKey);
}

export function filterTimelinesForApp(timelines: ScreenTimeDeviceTimeline[], appKey: string) {
  if (!appKey) return timelines;
  return timelines.map((timeline) => ({
    ...timeline,
    segments: filterSegmentsForApp(timeline.segments, appKey),
    blocks: timeline.blocks.flatMap((block) =>
      block.items
        .filter((item) => itemBreakdownKey(item) === appKey)
        .map((item) => ({
          ...block,
          id: `${block.id}:${item.id}`,
          start: item.start,
          end: item.end,
          title: item.title,
          subtitle: item.subtitle,
          category: item.category,
          durationSeconds: item.durationSeconds,
          items: [item],
        })),
    ),
  }));
}

export function highlightRangesForApp(
  blocks: ScreenTimeSessionBlock[],
  appKey: string,
  dayStart: Date,
  dayEnd: Date,
): TimelineHighlightRange[] {
  if (!appKey) return [];
  const span = dayEnd.getTime() - dayStart.getTime();
  if (span <= 0) return [];
  return blocks.flatMap((block) =>
    block.items.flatMap((item) => {
      if (itemBreakdownKey(item) !== appKey) return [];
      const clippedStart = Math.max(new Date(item.start).getTime(), dayStart.getTime());
      const clippedEnd = Math.min(new Date(item.end).getTime(), dayEnd.getTime());
      if (clippedEnd <= clippedStart) return [];
      const xFraction = Math.max(0, Math.min(1, (clippedStart - dayStart.getTime()) / span));
      const widthFraction = Math.max(0.004, Math.min(1 - xFraction, (clippedEnd - clippedStart) / span));
      return [{
        id: item.id,
        start: new Date(clippedStart),
        end: new Date(clippedEnd),
        xFraction,
        widthFraction,
      }];
    }),
  );
}

export function percentLabel(ratio: number) {
  const value = ratio > 1 ? ratio : ratio * 100;
  const percent = Math.round(value);
  return percent < 1 ? "<1%" : `${percent}%`;
}

export function appShareBarPercent(ratio: number) {
  return Math.min(100, Math.max(3, ratio > 1 ? ratio : ratio * 100));
}

export function buildBreakdowns(segments: ScreenTimeTimelineSegment[], categoryCache?: JevCategoryCache | null) {
  const total = segments.reduce((sum, segment) => sum + segmentSeconds(segment), 0);
  const byCategory = new Map<string, number>();
  const byApp = new Map<string, { seconds: number; segment: ScreenTimeTimelineSegment; host: string; category: string }>();

  for (const segment of segments) {
    const seconds = segmentSeconds(segment);
    const key = appBreakdownKey(segment);
    const category = overlayCategory(segment.category, key, categoryCache);
    byCategory.set(category, (byCategory.get(category) ?? 0) + seconds);
    const host = websiteHostname(segment.url);
    const existing = byApp.get(key);
    byApp.set(key, { seconds: (existing?.seconds ?? 0) + seconds, segment, host, category });
  }

  const categories: ScreenTimeCategoryBreakdown[] = Array.from(byCategory.entries())
    .map(([category, seconds]) => ({ category, seconds, percentage: total ? seconds / total : 0 }))
    .sort((a, b) => b.seconds - a.seconds);

  const apps: ScreenTimeAppBreakdown[] = Array.from(byApp.entries())
    .map(([key, value]) => ({
      key,
      label: value.host || value.segment.appName || value.segment.label,
      subtitle: value.host ? (value.segment.appName || "Browser") : value.category,
      category: value.category,
      seconds: value.seconds,
      percentage: total ? value.seconds / total : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .map((app, colorIndex) => ({ ...app, colorIndex }));

  return { total, categories, apps };
}

export function rankedAppsBySeconds(apps: ScreenTimeAppBreakdown[]) {
  return [...apps].sort((a, b) => b.seconds - a.seconds);
}

export function buildPeriodBuckets(
  segments: ScreenTimeTimelineSegment[],
  period: InsightsPeriod,
  anchor: Date,
  trackedSecondsByDay?: Record<string, number>,
  timeZone = localTimeZone(),
): ScreenTimePeriodBucket[] {
  const bounds = periodBounds(period, anchor, timeZone);
  const anchorParts = zonedParts(anchor, timeZone);
  const monthLength = new Date(Date.UTC(anchorParts.year, anchorParts.month, 0)).getUTCDate();
  const count =
    period === "day"
      ? 24
      : period === "week"
        ? 7
        : period === "month"
          ? monthLength
          : 12;
  const bucketMs = (bounds.end.getTime() - bounds.start.getTime()) / count;
  const intervals = segments.map((segment) => ({
    start: Date.parse(segment.start),
    end: Date.parse(segment.end),
    key: deviceKey(segment.devicePlatform, segment.deviceName),
    appKey: appBreakdownKey(segment),
    appLabel: websiteHostname(segment.url) || segment.appName || segment.label,
  }));
  return Array.from({ length: count }, (_, index) => {
    const start = period === "month"
      ? addCalendarDays(bounds.start, index, timeZone)
      : new Date(bounds.start.getTime() + index * bucketMs);
    const end = period === "month"
      ? addCalendarDays(start, 1, timeZone)
      : new Date(start.getTime() + bucketMs);
    const startMs = start.getTime();
    const endMs = end.getTime();
    let segmentSecondsTotal = 0;
    const byDevice = new Map<string, DeviceBucketAccum>();
    for (const interval of intervals) {
      const overlapStart = interval.start > startMs ? interval.start : startMs;
      const overlapEnd = interval.end < endMs ? interval.end : endMs;
      if (overlapEnd <= overlapStart) continue;
      const overlapSeconds = (overlapEnd - overlapStart) / 1000;
      segmentSecondsTotal += overlapSeconds;
      let share = byDevice.get(interval.key);
      if (!share) {
        share = { seconds: 0, apps: new Map() };
        byDevice.set(interval.key, share);
      }
      share.seconds += overlapSeconds;
      const app = share.apps.get(interval.appKey);
      if (app) app.seconds += overlapSeconds;
      else share.apps.set(interval.appKey, { label: interval.appLabel, seconds: overlapSeconds });
    }
    const dayKey = toDateInput(start, timeZone);
    const dailyTotal = period === "month" ? trackedSecondsByDay?.[dayKey] : undefined;
    const seconds = dailyTotal ?? segmentSecondsTotal;
    return {
      id: `${period}-${index}`,
      label:
        period === "year"
          ? new Intl.DateTimeFormat(undefined, { month: "short", timeZone }).format(start)
          : period === "day"
            ? hourLabelWithPeriod(index)
            : period === "month"
              ? `${zonedParts(start, timeZone).day}`
              : formatDayLabel(start, timeZone),
      start: start.toISOString(),
      end: end.toISOString(),
      seconds,
      devices: scaleDeviceShares(byDevice, seconds, dailyTotal !== undefined),
    };
  });
}

interface DeviceBucketAccum {
  seconds: number;
  apps: Map<string, { label: string; seconds: number }>;
}

const TOP_BUCKET_APPS = 3;

function topBucketApps(apps: Map<string, { label: string; seconds: number }>) {
  return [...apps.values()]
    .filter((app) => app.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
    .slice(0, TOP_BUCKET_APPS)
    .map(({ label, seconds }) => ({ label, seconds }));
}

function scaleDeviceShares(
  byDevice: Map<string, DeviceBucketAccum>,
  seconds: number,
  fromDailyTotal: boolean,
): ScreenTimeBucketDevice[] {
  const shares = [...byDevice.entries()]
    .filter(([, value]) => value.seconds > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      seconds: value.seconds,
      apps: topBucketApps(value.apps),
    }));
  if (!fromDailyTotal) return shares;
  const shareSum = shares.reduce((sum, share) => sum + share.seconds, 0);
  if (shareSum <= 0) return [];
  if (shareSum === seconds) return shares;
  const ratio = seconds / shareSum;
  return shares
    .map((share) => ({
      key: share.key,
      seconds: share.seconds * ratio,
      apps: share.apps.map((app) => ({ label: app.label, seconds: app.seconds * ratio })),
    }))
    .filter((share) => share.seconds > 0);
}

export function trackedSecondsByDay(
  entries: ScreenTimeEntry[],
  range: Date | { start: Date; end: Date },
  timeZone = localTimeZone(),
): Record<string, number> {
  const start = range instanceof Date ? startOfMonth(range, timeZone).getTime() : range.start.getTime();
  const end = range instanceof Date ? endOfMonth(range, timeZone).getTime() : range.end.getTime();
  const totals: Record<string, number> = {};
  if (end <= start) return totals;
  const days = dayBoundaries(start, end, timeZone);
  for (const entry of entries) {
    let slice = Math.max(Date.parse(entry.startTimeUTC), start);
    const limit = Math.min(Date.parse(entry.endTimeUTC), end);
    if (slice >= limit) continue;
    let index = dayIndexAt(days.starts, slice);
    while (slice < limit && index < days.keys.length) {
      const sliceEnd = Math.min(limit, days.starts[index + 1]);
      const key = days.keys[index];
      totals[key] = (totals[key] ?? 0) + (sliceEnd - slice) / 1000;
      slice = sliceEnd;
      index += 1;
    }
  }
  return totals;
}

/** Zoned day starts covering [start, end]; `starts` has one more item than `keys`. */
function dayBoundaries(start: number, end: number, timeZone: string) {
  const starts: number[] = [];
  const keys: string[] = [];
  let cursor = startOfDay(new Date(start), timeZone);
  while (cursor.getTime() < end) {
    starts.push(cursor.getTime());
    keys.push(toDateInput(cursor, timeZone));
    const next = addCalendarDays(cursor, 1, timeZone);
    cursor = next.getTime() > cursor.getTime() ? next : new Date(cursor.getTime() + dayMs);
  }
  starts.push(cursor.getTime());
  return { starts, keys };
}

function dayIndexAt(starts: number[], at: number) {
  let low = 0;
  let high = starts.length - 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= at) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function sumTrackedSecondsInBounds(
  totals: Record<string, number>,
  bounds: { start: Date; end: Date },
  timeZone = localTimeZone(),
) {
  let sum = 0;
  let cursor = startOfDay(bounds.start, timeZone);
  while (cursor.getTime() < bounds.end.getTime()) {
    sum += totals[toDateInput(cursor, timeZone)] ?? 0;
    const next = addCalendarDays(cursor, 1, timeZone);
    if (next.getTime() <= cursor.getTime()) break;
    cursor = next;
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
  categoryCache?: JevCategoryCache | null,
  timeZone = localTimeZone(),
): ScreenTimeSnapshot {
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  const inRange: ScreenTimeEntry[] = [];
  const segments: ScreenTimeTimelineSegment[] = [];
  for (const entry of entries) {
    const entryStart = Date.parse(entry.startTimeUTC);
    const entryEnd = Date.parse(entry.endTimeUTC);
    if (!(entryEnd > startMs && entryStart < endMs)) continue;
    const clipStart = entryStart < startMs ? startMs : entryStart;
    const clipEnd = entryEnd > endMs ? endMs : entryEnd;
    if (clipEnd <= clipStart) continue;
    inRange.push(entry);
    const segment = segmentFromEntry(entry);
    segments.push(
      clipStart === entryStart && clipEnd === entryEnd
        ? segment
        : { ...segment, start: new Date(clipStart).toISOString(), end: new Date(clipEnd).toISOString() },
    );
  }
  const breakdowns = buildBreakdowns(segments, categoryCache);
  const useOverlaidCategories = Boolean(categoryCache && Object.keys(categoryCache).length && breakdowns.categories.length);
  const categories = useOverlaidCategories
    ? breakdowns.categories
    : serverSummary?.categories?.length
    ? serverSummary.categories.map((category) => ({
        ...category,
        percentage: category.percentage > 1 ? category.percentage / 100 : category.percentage,
      }))
    : breakdowns.categories;
  const dailyTotals = {
    ...trackedSecondsByDay(inRange, bounds, timeZone),
    ...serverSummary?.trackedSecondsByDay,
  };
  const dailySum = sumTrackedSecondsInBounds(dailyTotals, bounds, timeZone);
  const buckets = bucketSpec
    ? buildPeriodBuckets(segments, bucketSpec.period, bucketSpec.anchor, dailyTotals, timeZone)
    : [];
  const bucketSum = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const totalSeconds = serverSummary?.trackedSecondsByDay
    ? dailySum
    : serverSummary?.totalSeconds ?? Math.max(breakdowns.total, bucketSum);
  const sourceApps = breakdowns.apps.length ? breakdowns.apps : serverSummary?.apps ?? [];
  const shareBase = sourceApps.reduce((sum, app) => sum + app.seconds, 0) || totalSeconds;
  const apps = rankedAppsBySeconds(sourceApps.map((app) => ({
    ...app,
    percentage: shareBase ? app.seconds / shareBase : 0,
  })));
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
  categoryCache?: JevCategoryCache | null,
  timeZone = localTimeZone(),
): ScreenTimeSnapshot {
  return snapshotFromRange(
    entries,
    periodBounds(period, anchor, timeZone),
    serverSummary,
    { period, anchor },
    categoryCache,
    timeZone,
  );
}

export { resolvedDeviceName };
export { localTimeZoneLabel, toDateInput } from "./platform";

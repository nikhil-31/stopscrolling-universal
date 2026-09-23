import { addCalendarDays, endOfDay, localTimeZone, startOfDay, weekdayIndex } from "./platform";
import type { ScreenTimeSessionBlock, ScreenTimeTimelineSegment } from "./types";

export type ProductivityBucket = "focus" | "meetings" | "breaks" | "other";
export type CalendarView = "day" | "week" | "month";
export type AssignmentSource = "manual" | "suggestion";

export const PRODUCTIVITY_BUCKETS: ProductivityBucket[] = ["focus", "meetings", "breaks", "other"];

export const PRODUCTIVITY_COLORS: Record<ProductivityBucket, string> = {
  focus: "#2de2e2",
  meetings: "#9e6bf0",
  breaks: "#478ff5",
  other: "#6b6b78",
};

export interface CalendarLabel {
  id: string;
  name: string;
  color: string;
  bucket: ProductivityBucket;
  countsTowardWork: boolean;
}

export interface CalendarTask {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface CalendarAssignment {
  id: string;
  start: string;
  end: string;
  labelId: string;
  source: AssignmentSource;
  reviewed: boolean;
}

export interface CalendarWorkspace {
  labels: CalendarLabel[];
  tasks: CalendarTask[];
  assignments: CalendarAssignment[];
  skippedBlockIds: string[];
}

export interface CalendarLabelTotal {
  labelId: string;
  name: string;
  color: string;
  seconds: number;
}

export interface CalendarDayStats {
  workSeconds: number;
  pendingSeconds: number;
  trackedSeconds: number;
  targetSeconds: number;
  percentOfTarget: number;
  labelTotals: CalendarLabelTotal[];
  productivity: Record<ProductivityBucket, number>;
  unlabeledBlocks: ScreenTimeSessionBlock[];
  reviewCount: number;
  dayTasks: CalendarTask[];
}

const dayMs = 24 * 60 * 60 * 1000;

export function newCalendarId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function defaultLabels(): CalendarLabel[] {
  return [
    { id: "label-research", name: "Research", color: "#1fb894", bucket: "focus", countsTowardWork: true },
    { id: "label-admin", name: "Admin", color: "#478ff5", bucket: "other", countsTowardWork: true },
    { id: "label-meetings", name: "Meetings", color: "#9e6bf0", bucket: "meetings", countsTowardWork: true },
    { id: "label-breaks", name: "Breaks", color: "#2eaddb", bucket: "breaks", countsTowardWork: false },
  ];
}

export function defaultWorkspace(): CalendarWorkspace {
  return {
    labels: defaultLabels(),
    tasks: [],
    assignments: [],
    skippedBlockIds: [],
  };
}

export function normalizeWorkspace(raw: Partial<CalendarWorkspace> | null | undefined): CalendarWorkspace {
  const fallback = defaultWorkspace();
  const labels = Array.isArray(raw?.labels) && raw.labels.length
    ? raw.labels.map(normalizeLabel).filter((label): label is CalendarLabel => Boolean(label))
    : fallback.labels;
  return {
    labels: labels.length ? labels : fallback.labels,
    tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(normalizeTask).filter((task): task is CalendarTask => Boolean(task)) : [],
    assignments: Array.isArray(raw?.assignments)
      ? raw.assignments.map(normalizeAssignment).filter((item): item is CalendarAssignment => Boolean(item))
      : [],
    skippedBlockIds: Array.isArray(raw?.skippedBlockIds) ? raw.skippedBlockIds.filter((id) => typeof id === "string") : [],
  };
}

function normalizeLabel(value: Partial<CalendarLabel>): CalendarLabel | null {
  if (!value?.id || !value.name) return null;
  return {
    id: value.id,
    name: value.name,
    color: value.color || "#1fb894",
    bucket: PRODUCTIVITY_BUCKETS.includes(value.bucket as ProductivityBucket) ? value.bucket as ProductivityBucket : "other",
    countsTowardWork: value.countsTowardWork !== false,
  };
}

function normalizeTask(value: Partial<CalendarTask>): CalendarTask | null {
  if (!value?.id || !value.title || !value.start || !value.end) return null;
  return { id: value.id, title: value.title, start: value.start, end: value.end };
}

function normalizeAssignment(value: Partial<CalendarAssignment>): CalendarAssignment | null {
  if (!value?.id || !value.start || !value.end || !value.labelId) return null;
  return {
    id: value.id,
    start: value.start,
    end: value.end,
    labelId: value.labelId,
    source: value.source === "suggestion" ? "suggestion" : "manual",
    reviewed: Boolean(value.reviewed),
  };
}

export function formatHourMinute(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function hourLabel24(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  return `${String(normalized).padStart(2, "0")}:00`;
}

export function formatClock24(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function mergeIntervals(intervals: Array<[number, number]>) {
  const sorted = [...intervals].filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) merged.push([...interval]);
    else last[1] = Math.max(last[1], interval[1]);
  }
  return merged;
}

export function intervalSeconds(intervals: Array<[number, number]>) {
  return mergeIntervals(intervals).reduce((sum, [start, end]) => sum + (end - start) / 1000, 0);
}

export function clipInterval(startIso: string, endIso: string, dayStart: Date, dayEnd: Date): [number, number] | null {
  const start = Math.max(new Date(startIso).getTime(), dayStart.getTime());
  const end = Math.min(new Date(endIso).getTime(), dayEnd.getTime());
  if (end <= start) return null;
  return [start, end];
}

export function collectDayBlocks(timelines: Array<{ blocks: ScreenTimeSessionBlock[] }>) {
  return timelines.flatMap((timeline) => timeline.blocks);
}

export function bucketForCategory(category: string): ProductivityBucket {
  const key = category.toLowerCase();
  if (key.includes("communication") || key.includes("email") || key.includes("meeting")) return "meetings";
  if (key.includes("development") || key.includes("productivity") || key.includes("research")) return "focus";
  if (key.includes("break")) return "breaks";
  return "other";
}

export function suggestLabel(block: Pick<ScreenTimeSessionBlock, "category">, labels: CalendarLabel[]) {
  const bucket = bucketForCategory(block.category);
  return labels.find((label) => label.bucket === bucket) ?? labels[0] ?? null;
}

export function isOngoingBlock(block: Pick<ScreenTimeSessionBlock, "start" | "end">, now: number, isTracking: boolean) {
  if (!isTracking) return false;
  const start = new Date(block.start).getTime();
  const end = new Date(block.end).getTime();
  return now >= start && now <= end + 2 * 60 * 1000;
}

export function assignmentOverlapsBlock(assignment: CalendarAssignment, block: Pick<ScreenTimeSessionBlock, "start" | "end">) {
  return overlapMs(
    new Date(assignment.start).getTime(),
    new Date(assignment.end).getTime(),
    new Date(block.start).getTime(),
    new Date(block.end).getTime(),
  ) > 0;
}

export function unlabeledBlocks(
  blocks: ScreenTimeSessionBlock[],
  workspace: CalendarWorkspace,
) {
  return blocks.filter((block) => {
    if (workspace.skippedBlockIds.includes(block.id)) return false;
    return !workspace.assignments.some((assignment) => assignmentOverlapsBlock(assignment, block));
  });
}

export function labelForId(workspace: CalendarWorkspace, labelId: string) {
  return workspace.labels.find((label) => label.id === labelId) ?? null;
}

export function tasksForDay(workspace: CalendarWorkspace, dayStart: Date, dayEnd: Date) {
  return workspace.tasks.filter((task) => clipInterval(task.start, task.end, dayStart, dayEnd));
}

export function assignmentsForDay(workspace: CalendarWorkspace, dayStart: Date, dayEnd: Date) {
  return workspace.assignments.filter((assignment) => clipInterval(assignment.start, assignment.end, dayStart, dayEnd));
}

export function buildCalendarDayStats(
  workspace: CalendarWorkspace,
  blocks: ScreenTimeSessionBlock[],
  anchor: Date,
  targetSeconds: number,
  timeZone = localTimeZone(),
): CalendarDayStats {
  return buildCalendarRangeStats(
    workspace,
    blocks,
    startOfDay(anchor, timeZone),
    endOfDay(anchor, timeZone),
    targetSeconds,
  );
}

export function buildCalendarRangeStats(
  workspace: CalendarWorkspace,
  blocks: ScreenTimeSessionBlock[],
  rangeStart: Date,
  rangeEnd: Date,
  targetSeconds: number,
): CalendarDayStats {
  const trackedIntervals = blocks
    .map((block) => clipInterval(block.start, block.end, rangeStart, rangeEnd))
    .filter((interval): interval is [number, number] => Boolean(interval));
  const trackedSeconds = intervalSeconds(trackedIntervals);

  const labeledIntervals = workspace.assignments
    .map((assignment) => clipInterval(assignment.start, assignment.end, rangeStart, rangeEnd))
    .filter((interval): interval is [number, number] => Boolean(interval));
  const labeledSeconds = intervalSeconds(
    trackedIntervals.flatMap((tracked) => labeledIntervals.map((labeled) => [
      Math.max(tracked[0], labeled[0]),
      Math.min(tracked[1], labeled[1]),
    ] as [number, number])),
  );
  const pendingSeconds = Math.max(0, trackedSeconds - labeledSeconds);

  const workIntervals = workspace.assignments.flatMap((assignment) => {
    const label = labelForId(workspace, assignment.labelId);
    if (!label?.countsTowardWork) return [];
    const clipped = clipInterval(assignment.start, assignment.end, rangeStart, rangeEnd);
    return clipped ? [clipped] : [];
  });
  const workSeconds = intervalSeconds(workIntervals);
  const target = Math.max(1, targetSeconds);
  const review = unlabeledBlocks(blocks, workspace);

  const labelTotals = workspace.labels.map((label) => {
    const seconds = intervalSeconds(
      workspace.assignments
        .filter((assignment) => assignment.labelId === label.id)
        .map((assignment) => clipInterval(assignment.start, assignment.end, rangeStart, rangeEnd))
        .filter((interval): interval is [number, number] => Boolean(interval)),
    );
    return { labelId: label.id, name: label.name, color: label.color, seconds };
  }).filter((item) => item.seconds > 0);

  const productivity = Object.fromEntries(PRODUCTIVITY_BUCKETS.map((bucket) => [bucket, 0])) as Record<ProductivityBucket, number>;
  for (const bucket of PRODUCTIVITY_BUCKETS) {
    productivity[bucket] = intervalSeconds(
      workspace.assignments.flatMap((assignment) => {
        const label = labelForId(workspace, assignment.labelId);
        if (label?.bucket !== bucket) return [];
        const clipped = clipInterval(assignment.start, assignment.end, rangeStart, rangeEnd);
        return clipped ? [clipped] : [];
      }),
    );
  }
  productivity.other += pendingSeconds;

  return {
    workSeconds,
    pendingSeconds,
    trackedSeconds,
    targetSeconds: target,
    percentOfTarget: Math.round((workSeconds / target) * 100),
    labelTotals,
    productivity,
    unlabeledBlocks: review,
    reviewCount: review.length,
    dayTasks: tasksForDay(workspace, rangeStart, rangeEnd),
  };
}

export function upsertLabel(workspace: CalendarWorkspace, patch: Partial<CalendarLabel> & Pick<CalendarLabel, "name">): CalendarWorkspace {
  const id = patch.id || newCalendarId("label");
  const next: CalendarLabel = {
    id,
    name: patch.name,
    color: patch.color || "#1fb894",
    bucket: patch.bucket || "other",
    countsTowardWork: patch.countsTowardWork !== false,
  };
  const exists = workspace.labels.some((label) => label.id === id);
  return {
    ...workspace,
    labels: exists ? workspace.labels.map((label) => (label.id === id ? next : label)) : [...workspace.labels, next],
  };
}

export function deleteLabel(workspace: CalendarWorkspace, id: string): CalendarWorkspace {
  return {
    ...workspace,
    labels: workspace.labels.filter((label) => label.id !== id),
    assignments: workspace.assignments.filter((assignment) => assignment.labelId !== id),
  };
}

export function upsertTask(workspace: CalendarWorkspace, patch: Partial<CalendarTask> & Pick<CalendarTask, "title" | "start" | "end">): CalendarWorkspace {
  const id = patch.id || newCalendarId("task");
  const next: CalendarTask = { id, title: patch.title, start: patch.start, end: patch.end };
  const exists = workspace.tasks.some((task) => task.id === id);
  return {
    ...workspace,
    tasks: exists ? workspace.tasks.map((task) => (task.id === id ? next : task)) : [...workspace.tasks, next],
  };
}

export function deleteTask(workspace: CalendarWorkspace, id: string): CalendarWorkspace {
  return { ...workspace, tasks: workspace.tasks.filter((task) => task.id !== id) };
}

export function assignLabel(
  workspace: CalendarWorkspace,
  patch: Partial<CalendarAssignment> & Pick<CalendarAssignment, "start" | "end" | "labelId">,
): CalendarWorkspace {
  const id = patch.id || newCalendarId("assignment");
  const next: CalendarAssignment = {
    id,
    start: patch.start,
    end: patch.end,
    labelId: patch.labelId,
    source: patch.source || "manual",
    reviewed: patch.reviewed ?? patch.source !== "suggestion",
  };
  const exists = workspace.assignments.some((assignment) => assignment.id === id);
  return {
    ...workspace,
    assignments: exists
      ? workspace.assignments.map((assignment) => (assignment.id === id ? next : assignment))
      : [...workspace.assignments, next],
  };
}

export function clearAssignment(workspace: CalendarWorkspace, id: string): CalendarWorkspace {
  return { ...workspace, assignments: workspace.assignments.filter((assignment) => assignment.id !== id) };
}

export function skipBlock(workspace: CalendarWorkspace, blockId: string): CalendarWorkspace {
  if (workspace.skippedBlockIds.includes(blockId)) return workspace;
  return { ...workspace, skippedBlockIds: [...workspace.skippedBlockIds, blockId] };
}

export function reviewBlock(
  workspace: CalendarWorkspace,
  block: Pick<ScreenTimeSessionBlock, "id" | "start" | "end">,
  labelId: string,
): CalendarWorkspace {
  const assigned = assignLabel(workspace, {
    start: block.start,
    end: block.end,
    labelId,
    source: "manual",
    reviewed: true,
  });
  return {
    ...assigned,
    skippedBlockIds: assigned.skippedBlockIds.filter((id) => id !== block.id),
  };
}

export function appKeyForSegment(segment: Pick<ScreenTimeTimelineSegment, "appName" | "subtitle" | "category">) {
  return `${segment.appName}|${segment.subtitle}|${segment.category}`;
}

export function segmentsForApp(segments: ScreenTimeTimelineSegment[], appKey: string) {
  return segments.filter((segment) => appKeyForSegment(segment) === appKey);
}

export function assignLabelToApp(
  workspace: CalendarWorkspace,
  segments: ScreenTimeTimelineSegment[],
  appKey: string,
  labelId: string,
): CalendarWorkspace {
  return segmentsForApp(segments, appKey).reduce(
    (next, segment) => assignLabel(next, {
      start: segment.start,
      end: segment.end,
      labelId,
      source: "manual",
      reviewed: true,
    }),
    workspace,
  );
}

export function weekDays(anchor: Date, timeZone = localTimeZone()) {
  const startDay = startOfDay(anchor, timeZone);
  const start = addCalendarDays(startDay, -weekdayIndex(startDay, timeZone), timeZone);
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index, timeZone));
}

export function snapToQuarterHour(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(Math.round(next.getMinutes() / 15) * 15);
  return next;
}

export function timeAtFraction(dayStart: Date, fraction: number) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return snapToQuarterHour(new Date(dayStart.getTime() + clamped * dayMs));
}

export function shouldShowReviewBar(unlabeledIds: string[], dismissedIds: string[]) {
  if (!unlabeledIds.length) return false;
  return unlabeledIds.some((id) => !dismissedIds.includes(id));
}

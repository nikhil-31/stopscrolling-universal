import { websiteHostname } from "./browser";
import {
  assignmentOverlapsBlock,
  labelForId,
  mondayWeekBounds,
  overlapMs,
  suggestLabel,
  type CalendarLabel,
  type CalendarView,
  type CalendarWorkspace,
} from "./calendar-workspace";
import { deviceKey } from "./device";
import { endOfDay, endOfMonth, localTimeZone, startOfDay, startOfMonth, toDateInput } from "./platform";
import { itemBreakdownKey } from "./timeline";
import type { ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "./types";

export type TimesheetStatus = "review" | "processing" | "approved";
export type TimesheetTab = TimesheetStatus | "all";
export type TimesheetGroupBy = "day" | "label" | "device" | "none";
export type TimesheetSummaryStatus = "pending" | "processing" | "ready" | "failed" | "disabled";

export interface TimesheetSummary {
  status: TimesheetSummaryStatus;
  summary: string;
}

export type TimesheetSummaries = Record<string, TimesheetSummary>;

export interface TimesheetRow {
  id: string;
  block: ScreenTimeSessionBlock;
  timeline: ScreenTimeDeviceTimeline;
  deviceKey: string;
  status: TimesheetStatus;
  live: boolean;
  seconds: number;
  description: string;
  aiDescription: boolean;
  label: CalendarLabel | null;
  suggestedLabel: CalendarLabel | null;
  assignmentId: string | null;
}

export interface TimesheetStats {
  pendingSeconds: number;
  pendingCount: number;
  approvedSeconds: number;
  approvedCount: number;
  totalSeconds: number;
  totalCount: number;
  processingCount: number;
  processingSeconds: number;
}

export interface TimesheetGroup {
  key: string;
  label: string;
  seconds: number;
  rows: TimesheetRow[];
}

export interface TimesheetEntryItemPayload {
  app_name: string;
  hostname: string;
  title: string;
  seconds: number;
}

export interface TimesheetEntryPayload {
  entry_id: string;
  started_at: string;
  ended_at: string;
  items: TimesheetEntryItemPayload[];
}

const MAX_PAYLOAD_ITEMS = 12;
const MAX_TITLE_LENGTH = 160;

function itemSeconds(item: ScreenTimeSessionBlock["items"][number]) {
  return Math.max(0, (Date.parse(item.end) - Date.parse(item.start)) / 1000);
}

/** Apps and websites in the block, most time first, merged by hostname or app. */
function rankedItemNames(block: ScreenTimeSessionBlock) {
  const totals = new Map<string, { name: string; seconds: number }>();
  for (const item of block.items) {
    const key = itemBreakdownKey(item);
    const name = websiteHostname(item.url) || item.appName || item.title;
    if (!name) continue;
    const existing = totals.get(key);
    totals.set(key, { name, seconds: (existing?.seconds ?? 0) + itemSeconds(item) });
  }
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

export function fallbackDescription(block: ScreenTimeSessionBlock) {
  const names = rankedItemNames(block).slice(0, 3).map((item) => item.name);
  if (!names.length) return block.title || "Untitled activity";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function timesheetEntryPayload(block: ScreenTimeSessionBlock): TimesheetEntryPayload {
  const items = [...block.items]
    .sort((a, b) => itemSeconds(b) - itemSeconds(a))
    .slice(0, MAX_PAYLOAD_ITEMS)
    .map((item) => ({
      app_name: item.appName,
      hostname: websiteHostname(item.url),
      title: item.title.slice(0, MAX_TITLE_LENGTH),
      seconds: Math.round(itemSeconds(item)),
    }));
  return { entry_id: block.id, started_at: block.start, ended_at: block.end, items };
}

function blockSeconds(block: ScreenTimeSessionBlock) {
  const itemTotal = block.items.reduce((sum, item) => sum + itemSeconds(item), 0);
  return itemTotal || block.durationSeconds;
}

function assignmentForBlock(workspace: CalendarWorkspace, block: ScreenTimeSessionBlock) {
  const start = Date.parse(block.start);
  const end = Date.parse(block.end);
  let best: { id: string; labelId: string; overlap: number } | null = null;
  for (const assignment of workspace.assignments) {
    if (!assignmentOverlapsBlock(assignment, block)) continue;
    const overlap = overlapMs(Date.parse(assignment.start), Date.parse(assignment.end), start, end);
    if (!best || overlap > best.overlap) best = { id: assignment.id, labelId: assignment.labelId, overlap };
  }
  return best;
}

export function buildTimesheetRows({
  timelines,
  workspace,
  summaries,
  isLive,
}: {
  timelines: ScreenTimeDeviceTimeline[];
  workspace: CalendarWorkspace;
  summaries: TimesheetSummaries;
  isLive: (block: ScreenTimeSessionBlock, timeline: ScreenTimeDeviceTimeline) => boolean;
}): TimesheetRow[] {
  const seen = new Set<string>();
  const rows: TimesheetRow[] = [];
  for (const timeline of timelines) {
    for (const block of timeline.blocks) {
      if (seen.has(block.id) || workspace.skippedBlockIds.includes(block.id)) continue;
      seen.add(block.id);
      const live = isLive(block, timeline);
      const summary = summaries[block.id];
      const summaryPending = summary?.status === "pending" || summary?.status === "processing";
      const approved = workspace.approvedBlockIds.includes(block.id);
      const status: TimesheetStatus = approved ? "approved" : live || summaryPending ? "processing" : "review";
      const assignment = assignmentForBlock(workspace, block);
      const label = assignment ? labelForId(workspace, assignment.labelId) : null;
      const aiDescription = summary?.status === "ready" && Boolean(summary.summary);
      rows.push({
        id: block.id,
        block,
        timeline,
        deviceKey: deviceKey(block.devicePlatform || timeline.devicePlatform, block.deviceName || timeline.deviceName),
        status,
        live,
        seconds: blockSeconds(block),
        description: aiDescription ? summary.summary : fallbackDescription(block),
        aiDescription,
        label,
        suggestedLabel: label ? null : suggestLabel(block, workspace.labels),
        assignmentId: assignment?.id ?? null,
      });
    }
  }
  return rows.sort((a, b) => Date.parse(a.block.start) - Date.parse(b.block.start));
}

/** The span the Timesheet header describes: the anchor day, its Monday week, or the calendar month. */
export function timesheetPeriodBounds(
  view: CalendarView,
  anchor: Date,
  month: Date,
  timeZone = localTimeZone(),
): { start: Date; end: Date } {
  if (view === "week") return mondayWeekBounds(anchor, timeZone);
  if (view === "month") return { start: startOfMonth(month, timeZone), end: endOfMonth(month, timeZone) };
  return { start: startOfDay(anchor, timeZone), end: endOfDay(anchor, timeZone) };
}

export function rowsInPeriod(rows: TimesheetRow[], bounds: { start: Date; end: Date }) {
  const start = bounds.start.getTime();
  const end = bounds.end.getTime();
  return rows.filter((row) => {
    const at = Date.parse(row.block.start);
    return at >= start && at < end;
  });
}

export function rowsForTab(rows: TimesheetRow[], tab: TimesheetTab) {
  return tab === "all" ? rows : rows.filter((row) => row.status === tab);
}

export function timesheetStats(rows: TimesheetRow[]): TimesheetStats {
  const stats: TimesheetStats = {
    pendingSeconds: 0,
    pendingCount: 0,
    approvedSeconds: 0,
    approvedCount: 0,
    totalSeconds: 0,
    totalCount: rows.length,
    processingCount: 0,
    processingSeconds: 0,
  };
  for (const row of rows) {
    stats.totalSeconds += row.seconds;
    if (row.status === "approved") {
      stats.approvedSeconds += row.seconds;
      stats.approvedCount += 1;
    } else {
      stats.pendingSeconds += row.seconds;
      stats.pendingCount += 1;
      if (row.status === "processing") {
        stats.processingCount += 1;
        stats.processingSeconds += row.seconds;
      }
    }
  }
  return stats;
}

export function groupTimesheetRows(
  rows: TimesheetRow[],
  groupBy: TimesheetGroupBy,
  {
    deviceName = (key: string) => key,
    dayLabel = (day: string) => day,
    timeZone = localTimeZone(),
  }: {
    deviceName?: (key: string) => string;
    dayLabel?: (day: string) => string;
    timeZone?: string;
  } = {},
): TimesheetGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "All entries", seconds: rows.reduce((sum, row) => sum + row.seconds, 0), rows }];
  }
  const groups = new Map<string, TimesheetGroup>();
  for (const row of rows) {
    let key: string;
    let label: string;
    if (groupBy === "day") {
      key = toDateInput(new Date(row.block.start), timeZone);
      label = dayLabel(key);
    } else if (groupBy === "device") {
      key = row.deviceKey;
      label = deviceName(key);
    } else {
      const chosen = row.label ?? null;
      key = chosen?.id ?? "unlabeled";
      label = chosen?.name ?? "No Label";
    }
    const group = groups.get(key) ?? { key, label, seconds: 0, rows: [] };
    group.seconds += row.seconds;
    group.rows.push(row);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  if (groupBy === "day") return list.sort((a, b) => a.key.localeCompare(b.key));
  return list.sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

/** Finished entries that still need an AI description, oldest first. */
export function blocksNeedingSummaries(rows: TimesheetRow[], summaries: TimesheetSummaries) {
  return rows
    .filter((row) => !row.live)
    .filter((row) => {
      const status = summaries[row.id]?.status;
      return status !== "ready" && status !== "failed" && status !== "disabled";
    })
    .map((row) => row.block);
}

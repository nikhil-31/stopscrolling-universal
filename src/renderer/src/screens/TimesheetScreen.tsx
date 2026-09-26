import { deviceColor, displayNameForDevice } from "@shared/device";
import { effectiveTimeZone, zonedDateTime } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { formatDayLabel } from "@shared/timeline";
import {
  buildTimesheetRows,
  groupTimesheetRows,
  rowsForTab,
  rowsInPeriod,
  timesheetPeriodBounds,
  timesheetStats,
  type TimesheetGroupBy,
  type TimesheetRow,
  type TimesheetTab,
} from "@shared/timesheet";
import { ClipboardCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CalendarChrome } from "../components/calendar/CalendarChrome";
import { CalendarDialogs } from "../components/calendar/CalendarDialogs";
import { isLocalLiveBlock } from "../components/calendar/DayBoard";
import type { CalendarPrompt } from "../components/calendar/types";
import { TimesheetStats } from "../components/timesheet/TimesheetStats";
import { TimesheetTable, type TimesheetRowActions } from "../components/timesheet/TimesheetTable";
import {
  ALL_FILTER,
  NO_LABEL_FILTER,
  TimesheetToolbar,
  type TimesheetColumns,
  type TimesheetFilters,
} from "../components/timesheet/TimesheetToolbar";
import { EmptyState } from "../components/ui";

const emptyCopy: Record<TimesheetTab, { title: string; body: string }> = {
  review: { title: "Nothing to review", body: "Every finished time entry in this period has been approved." },
  processing: { title: "Nothing processing", body: "Entries still being tracked or summarized show up here." },
  approved: { title: "No approved entries yet", body: "Accept entries from To Review to approve them." },
  all: { title: "No time entries", body: "Tracked sessions for this period will appear here." },
};

function matchesFilters(row: TimesheetRow, filters: TimesheetFilters) {
  if (filters.device !== ALL_FILTER && row.deviceKey !== filters.device) return false;
  if (filters.label === ALL_FILTER) return true;
  if (filters.label === NO_LABEL_FILTER) return !row.label;
  return row.label?.id === filters.label;
}

export function TimesheetScreen({ state }: { state: AppSnapshot }) {
  const [prompt, setPrompt] = useState<CalendarPrompt>(null);
  const [tab, setTab] = useState<TimesheetTab>("review");
  const [groupChoice, setGroupChoice] = useState<TimesheetGroupBy | null>(null);
  const [columns, setColumns] = useState<TimesheetColumns>({ device: true, duration: true, label: true });
  const [filters, setFilters] = useState<TimesheetFilters>({ device: ALL_FILTER, label: ALL_FILTER });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const multiDay = state.calendarView !== "day";
  const groupBy = groupChoice ?? (multiDay ? "day" : "none");
  const now = Date.now();

  const periodRows = rowsInPeriod(
    buildTimesheetRows({
      timelines: state.timelines,
      workspace: state.calendarWorkspace,
      summaries: state.timesheetSummaries,
      isLive: (block, timeline) => isLocalLiveBlock(block, timeline, state, now),
    }),
    timesheetPeriodBounds(state.calendarView, new Date(state.calendarAnchor), new Date(state.calendarMonth), timeZone),
  );
  const filteredRows = periodRows.filter((row) => matchesFilters(row, filters));
  const stats = timesheetStats(filteredRows);
  const counts: Record<TimesheetTab, number> = {
    review: rowsForTab(filteredRows, "review").length,
    processing: rowsForTab(filteredRows, "processing").length,
    approved: rowsForTab(filteredRows, "approved").length,
    all: filteredRows.length,
  };
  const visibleRows = rowsForTab(filteredRows, tab);
  const groups = groupTimesheetRows(visibleRows, groupBy, {
    timeZone,
    deviceName: (key) => deviceNameForKey(periodRows, key, state),
    dayLabel: (day) => {
      const [year, month, date] = day.split("-").map(Number);
      return formatDayLabel(zonedDateTime(year, month, date, timeZone), timeZone);
    },
  });

  const approvable = visibleRows.filter((row) => !row.live && row.status !== "approved");
  const chosen = approvable.filter((row) => selected.has(row.id));
  const approveTargets = chosen.length ? chosen : approvable;
  const reviewIds = periodRows.filter((row) => !row.label && !row.live && row.status !== "approved").map((row) => row.id);

  const deviceOptions = uniqueDevices(periodRows, state);
  const labelOptions = [
    ...state.calendarWorkspace.labels.map((label) => ({ value: label.id, label: label.name, color: label.color })),
    { value: NO_LABEL_FILTER, label: "No label" },
  ];

  const approve = (rows: TimesheetRow[]) => {
    if (!rows.length) return;
    window.stopscrolling.approveTimesheetEntries(
      rows.map(({ block }) => ({ id: block.id, start: block.start, end: block.end, category: block.category })),
    );
    setSelected((current) => {
      const next = new Set(current);
      for (const row of rows) next.delete(row.id);
      return next;
    });
  };

  const approveRef = useRef(() => approve(approveTargets));
  approveRef.current = () => approve(approveTargets);
  const promptOpen = prompt !== null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (promptOpen || !(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
      event.preventDefault();
      approveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promptOpen]);

  const actions: TimesheetRowActions = {
    onAccept: (row) => approve([row]),
    onUndo: (row) => window.stopscrolling.unapproveTimesheetEntry(row.id),
    onLabel: (row) => setPrompt({
      kind: "label",
      start: row.block.start,
      end: row.block.end,
      blockId: row.id,
      assignmentId: row.assignmentId ?? undefined,
      suggestedLabelId: row.label?.id ?? row.suggestedLabel?.id,
    }),
    onSkip: (row) => window.stopscrolling.skipCalendarBlock(row.id),
    onDetails: (row) => window.stopscrolling.selectInspector({ kind: "block", block: row.block }),
  };

  return (
    <div className="calendar-page timesheet-page" data-testid="timesheet-page">
      <CalendarChrome state={state} title="Timesheet" />
      <TimesheetStats stats={stats} />
      <TimesheetToolbar
        tab={tab}
        counts={counts}
        onTab={(next) => {
          setTab(next);
          setSelected(new Set());
        }}
        groupBy={groupBy}
        onGroupBy={setGroupChoice}
        columns={columns}
        onColumns={setColumns}
        filters={filters}
        onFilters={setFilters}
        deviceOptions={deviceOptions}
        labelOptions={labelOptions}
        reviewCount={reviewIds.length}
        onReview={() => setPrompt({ kind: "review", blockIds: reviewIds })}
        approveCount={approveTargets.length}
        approveSelected={chosen.length > 0}
        onApprove={() => approve(approveTargets)}
      />
      {visibleRows.length ? (
        <TimesheetTable
          state={state}
          groups={groups}
          columns={columns}
          showGroups={groupBy !== "none"}
          showDate={multiDay && groupBy !== "day"}
          timeZone={timeZone}
          selected={selected}
          onToggle={(id) => setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          onToggleMany={(ids, checked) => setSelected((current) => {
            const next = new Set(current);
            for (const id of ids) {
              if (checked) next.add(id);
              else next.delete(id);
            }
            return next;
          })}
          actions={actions}
        />
      ) : (
        <div className="timesheet-empty">
          <EmptyState icon={ClipboardCheck} title={emptyCopy[tab].title} body={emptyCopy[tab].body} />
        </div>
      )}
      <CalendarDialogs state={state} prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

function deviceNameForKey(rows: TimesheetRow[], key: string, state: AppSnapshot) {
  const row = rows.find((item) => item.deviceKey === key);
  if (!row) return key;
  return displayNameForDevice(
    row.block.devicePlatform || row.timeline.devicePlatform,
    row.block.deviceName || row.timeline.deviceName,
    state.devices,
  );
}

function uniqueDevices(rows: TimesheetRow[], state: AppSnapshot) {
  const seen = new Map<string, { value: string; label: string; color: string }>();
  for (const row of rows) {
    if (seen.has(row.deviceKey)) continue;
    seen.set(row.deviceKey, {
      value: row.deviceKey,
      label: deviceNameForKey(rows, row.deviceKey, state),
      color: deviceColor(row.deviceKey, state.devices),
    });
  }
  return [...seen.values()];
}

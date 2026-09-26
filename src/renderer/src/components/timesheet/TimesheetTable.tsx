import { deviceColor, displayNameForDevice } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import { formatClock, formatDayLabel, formatDuration } from "@shared/timeline";
import type { TimesheetGroup, TimesheetRow } from "@shared/timesheet";
import type { ScreenTimeSessionBlock } from "@shared/types";
import { Check, Ellipsis, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useClockFormat } from "../../clock-format";
import { SessionHoverCard } from "../timeline/SessionHoverCard";
import { Button, IconButton } from "../ui";
import { MenuItem, useDismiss, type TimesheetColumns } from "./TimesheetToolbar";

export interface TimesheetRowActions {
  onAccept: (row: TimesheetRow) => void;
  onUndo: (row: TimesheetRow) => void;
  onLabel: (row: TimesheetRow) => void;
  onSkip: (row: TimesheetRow) => void;
  onDetails: (row: TimesheetRow) => void;
}

function gridTemplate(columns: TimesheetColumns) {
  return [
    "32px",
    "minmax(110px, 0.7fr)",
    "minmax(220px, 2.4fr)",
    columns.device ? "minmax(120px, 0.9fr)" : null,
    columns.duration ? "84px" : null,
    columns.label ? "minmax(120px, 0.9fr)" : null,
    "132px",
  ].filter(Boolean).join(" ");
}

function selectable(row: TimesheetRow) {
  return !row.live && row.status !== "approved";
}

function CheckboxCell({
  label,
  checked,
  indeterminate = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <span className="timesheet-cell timesheet-check">
      <input ref={ref} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </span>
  );
}

export function TimesheetTable({
  state,
  groups,
  columns,
  showGroups,
  showDate,
  timeZone,
  selected,
  onToggle,
  onToggleMany,
  actions,
}: {
  state: AppSnapshot;
  groups: TimesheetGroup[];
  columns: TimesheetColumns;
  showGroups: boolean;
  showDate: boolean;
  timeZone: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  actions: TimesheetRowActions;
}) {
  const [hover, setHover] = useState<{ block: ScreenTimeSessionBlock; x: number; y: number } | null>(null);
  const style = { gridTemplateColumns: gridTemplate(columns) };
  const allSelectable = groups.flatMap((group) => group.rows.filter(selectable).map((row) => row.id));
  const selectedCount = allSelectable.filter((id) => selected.has(id)).length;

  return (
    <div className="timesheet-table" role="table" aria-label="Time entries" data-testid="timesheet-table">
      <div className="timesheet-row timesheet-head" role="row" style={style}>
        <CheckboxCell
          label="Select all entries"
          checked={allSelectable.length > 0 && selectedCount === allSelectable.length}
          indeterminate={selectedCount > 0 && selectedCount < allSelectable.length}
          disabled={!allSelectable.length}
          onChange={() => onToggleMany(allSelectable, selectedCount < allSelectable.length)}
        />
        <span className="timesheet-cell" role="columnheader">Time</span>
        <span className="timesheet-cell" role="columnheader">Description</span>
        {columns.device ? <span className="timesheet-cell" role="columnheader">Device</span> : null}
        {columns.duration ? <span className="timesheet-cell timesheet-num" role="columnheader">Duration</span> : null}
        {columns.label ? <span className="timesheet-cell" role="columnheader">Label</span> : null}
        <span className="timesheet-cell timesheet-actions-head" role="columnheader">Actions</span>
      </div>
      {groups.map((group) => {
        const ids = group.rows.filter(selectable).map((row) => row.id);
        const chosen = ids.filter((id) => selected.has(id)).length;
        return (
          <div key={group.key} className="timesheet-group" role="rowgroup" data-testid={`timesheet-group-${group.key}`}>
            {showGroups ? (
              <div className="timesheet-row timesheet-group-head" role="row" style={style}>
                <CheckboxCell
                  label={`Select ${group.label}`}
                  checked={ids.length > 0 && chosen === ids.length}
                  indeterminate={chosen > 0 && chosen < ids.length}
                  disabled={!ids.length}
                  onChange={() => onToggleMany(ids, chosen < ids.length)}
                />
                <span className="timesheet-group-title">
                  <strong>{group.label}</strong>
                  <span>{group.rows.length} {group.rows.length === 1 ? "entry" : "entries"}</span>
                </span>
                <span className="timesheet-group-total">{formatDuration(group.seconds)}</span>
              </div>
            ) : null}
            {group.rows.map((row) => (
              <TimesheetTableRow
                key={row.id}
                state={state}
                row={row}
                style={style}
                columns={columns}
                showDate={showDate}
                timeZone={timeZone}
                checked={selected.has(row.id)}
                onToggle={() => onToggle(row.id)}
                onHover={(event) => setHover(event ? { block: row.block, x: event.clientX, y: event.clientY } : null)}
                actions={actions}
              />
            ))}
          </div>
        );
      })}
      {hover ? <SessionHoverCard block={hover.block} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

function TimesheetTableRow({
  state,
  row,
  style,
  columns,
  showDate,
  timeZone,
  checked,
  onToggle,
  onHover,
  actions,
}: {
  state: AppSnapshot;
  row: TimesheetRow;
  style: { gridTemplateColumns: string };
  columns: TimesheetColumns;
  showDate: boolean;
  timeZone: string;
  checked: boolean;
  onToggle: () => void;
  onHover: (event: ReactMouseEvent | null) => void;
  actions: TimesheetRowActions;
}) {
  const clockFormat = useClockFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const platform = row.block.devicePlatform || row.timeline.devicePlatform;
  const name = row.block.deviceName || row.timeline.deviceName;
  const summarizing = row.status === "processing" && !row.live;

  return (
    <div
      className={`timesheet-row timesheet-entry is-${row.status} ${row.live ? "is-live" : ""}`}
      role="row"
      style={style}
      data-testid={`timesheet-row-${row.id}`}
    >
      <CheckboxCell
        label={`Select entry ${row.description}`}
        checked={checked}
        disabled={!selectable(row)}
        onChange={onToggle}
      />
      <span className="timesheet-cell timesheet-time" role="cell">
        {showDate ? <small>{formatDayLabel(new Date(row.block.start), timeZone)}</small> : null}
        <span>{formatClock(row.block.start, clockFormat)} – {row.live ? "now" : formatClock(row.block.end, clockFormat)}</span>
      </span>
      <span
        className="timesheet-cell timesheet-desc"
        role="cell"
        onMouseEnter={onHover}
        onMouseMove={onHover}
        onMouseLeave={() => onHover(null)}
      >
        <span className="timesheet-desc-text">
          {row.aiDescription ? <Sparkles size={11} className="timesheet-ai" aria-label="AI summary" /> : null}
          {row.description}
        </span>
        {row.live ? <span className="timesheet-desc-meta is-live">Tracking…</span> : null}
        {summarizing ? <span className="timesheet-desc-meta">Writing summary…</span> : null}
      </span>
      {columns.device ? (
        <span className="timesheet-cell timesheet-device" role="cell">
          <span className="timesheet-dot" style={{ background: deviceColor(row.deviceKey, state.devices) }} />
          <span>{displayNameForDevice(platform, name, state.devices)}</span>
        </span>
      ) : null}
      {columns.duration ? (
        <span className="timesheet-cell timesheet-num" role="cell">{formatDuration(row.seconds)}</span>
      ) : null}
      {columns.label ? (
        <span className="timesheet-cell" role="cell">
          <button
            type="button"
            className={`timesheet-label ${row.label ? "" : "is-suggested"}`}
            title={row.label ? "Change label" : row.suggestedLabel ? "Suggested label, click to change" : "Add label"}
            onClick={() => actions.onLabel(row)}
          >
            <span
              className="timesheet-dot"
              style={{ background: (row.label ?? row.suggestedLabel)?.color ?? "var(--text-tertiary)" }}
            />
            <span>{row.label?.name ?? row.suggestedLabel?.name ?? "Add label"}</span>
          </button>
        </span>
      ) : null}
      <span className="timesheet-cell timesheet-row-actions" role="cell">
        {row.status === "approved" ? (
          <Button size="sm" variant="ghost" icon={Undo2} onClick={() => actions.onUndo(row)}>Undo</Button>
        ) : (
          <Button size="sm" icon={Check} disabled={row.live} onClick={() => actions.onAccept(row)}>Accept</Button>
        )}
        <div className="timesheet-popover" ref={menuRef}>
          <IconButton label="More actions" icon={Ellipsis} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} />
          {menuOpen ? (
            <div className="timesheet-menu is-right" role="menu">
              <MenuItem onClick={() => { setMenuOpen(false); actions.onLabel(row); }}>Change label</MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); actions.onSkip(row); }}>Skip</MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); actions.onDetails(row); }}>Open details</MenuItem>
            </div>
          ) : null}
        </div>
      </span>
    </div>
  );
}

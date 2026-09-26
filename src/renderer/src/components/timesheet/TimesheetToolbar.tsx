import type { TimesheetGroupBy, TimesheetTab } from "@shared/timesheet";
import { Check, ChevronDown, Columns3, Filter, Layers, ListChecks } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button, Tabs } from "../ui";

export interface TimesheetColumns {
  device: boolean;
  duration: boolean;
  label: boolean;
}

export interface TimesheetFilters {
  device: string;
  label: string;
}

export const ALL_FILTER = "all";
export const NO_LABEL_FILTER = "none";

const groupOptions: Array<{ value: TimesheetGroupBy; label: string }> = [
  { value: "day", label: "Day" },
  { value: "label", label: "Label" },
  { value: "device", label: "Device" },
  { value: "none", label: "None" },
];

const columnOptions: Array<{ key: keyof TimesheetColumns; label: string }> = [
  { key: "device", label: "Device" },
  { key: "duration", label: "Duration" },
  { key: "label", label: "Label" },
];

export function TimesheetToolbar({
  tab,
  counts,
  onTab,
  groupBy,
  onGroupBy,
  columns,
  onColumns,
  filters,
  onFilters,
  deviceOptions,
  labelOptions,
  reviewCount,
  onReview,
  approveCount,
  approveSelected,
  onApprove,
}: {
  tab: TimesheetTab;
  counts: Record<TimesheetTab, number>;
  onTab: (tab: TimesheetTab) => void;
  groupBy: TimesheetGroupBy;
  onGroupBy: (groupBy: TimesheetGroupBy) => void;
  columns: TimesheetColumns;
  onColumns: (columns: TimesheetColumns) => void;
  filters: TimesheetFilters;
  onFilters: (filters: TimesheetFilters) => void;
  deviceOptions: Array<{ value: string; label: string; color: string }>;
  labelOptions: Array<{ value: string; label: string; color?: string }>;
  reviewCount: number;
  onReview: () => void;
  approveCount: number;
  approveSelected: boolean;
  onApprove: () => void;
}) {
  const activeFilters = Number(filters.device !== ALL_FILTER) + Number(filters.label !== ALL_FILTER);
  return (
    <div className="timesheet-toolbar">
      <Tabs
        ariaLabel="Timesheet status"
        value={tab}
        onChange={onTab}
        items={[
          { value: "review", label: `To Review ${counts.review}` },
          { value: "processing", label: `Processing ${counts.processing}` },
          { value: "approved", label: `Approved ${counts.approved}` },
          { value: "all", label: `All Entries ${counts.all}` },
        ]}
      />
      <div className="timesheet-toolbar-actions">
        <Popover icon={Layers} label={`Group By: ${groupOptions.find((option) => option.value === groupBy)?.label}`}>
          {(close) => groupOptions.map((option) => (
            <MenuItem
              key={option.value}
              checked={groupBy === option.value}
              onClick={() => {
                onGroupBy(option.value);
                close();
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </Popover>
        <Popover icon={Columns3} label="Columns">
          {() => columnOptions.map((option) => (
            <MenuItem
              key={option.key}
              checked={columns[option.key]}
              onClick={() => onColumns({ ...columns, [option.key]: !columns[option.key] })}
            >
              {option.label}
            </MenuItem>
          ))}
        </Popover>
        <Popover icon={Filter} label={activeFilters ? `Filters (${activeFilters})` : "Filters"}>
          {() => (
            <>
              <div className="timesheet-menu-heading">Device</div>
              <MenuItem checked={filters.device === ALL_FILTER} onClick={() => onFilters({ ...filters, device: ALL_FILTER })}>
                All devices
              </MenuItem>
              {deviceOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  checked={filters.device === option.value}
                  dot={option.color}
                  onClick={() => onFilters({ ...filters, device: option.value })}
                >
                  {option.label}
                </MenuItem>
              ))}
              <div className="timesheet-menu-heading">Label</div>
              <MenuItem checked={filters.label === ALL_FILTER} onClick={() => onFilters({ ...filters, label: ALL_FILTER })}>
                All labels
              </MenuItem>
              {labelOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  checked={filters.label === option.value}
                  dot={option.color}
                  onClick={() => onFilters({ ...filters, label: option.value })}
                >
                  {option.label}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
        <Button size="sm" icon={ListChecks} disabled={!reviewCount} onClick={onReview}>
          Review Time Entries ({reviewCount})
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          disabled={!approveCount}
          onClick={onApprove}
          title="Approve (⌘↵)"
        >
          {approveSelected ? `Approve Selected (${approveCount})` : "Approve All"}
          <kbd className="timesheet-kbd">⌘↵</kbd>
        </Button>
      </div>
    </div>
  );
}

function Popover({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className="timesheet-popover" ref={ref}>
      <Button size="sm" variant="ghost" icon={Icon} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </Button>
      {open ? (
        <div className="timesheet-menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

/** Closes a floating menu on outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return ref;
}

export function MenuItem({
  checked,
  dot,
  onClick,
  children,
}: {
  checked?: boolean;
  dot?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      className="timesheet-menu-item"
      onClick={onClick}
    >
      <span className="timesheet-menu-check">{checked ? <Check size={12} aria-hidden="true" /> : null}</span>
      {dot ? <span className="timesheet-dot" style={{ background: dot }} /> : null}
      <span>{children}</span>
    </button>
  );
}

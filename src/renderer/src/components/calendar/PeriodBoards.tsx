import { formatDuration, formatMonthLabel, monthGridDays, startOfMonth, toDateInput } from "@shared/timeline";
import { weekDays } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "../ui";

export function WeekStrip({ state }: { state: AppSnapshot }) {
  const anchor = new Date(state.calendarAnchor);
  const selected = toDateInput(anchor);
  const days = weekDays(anchor);
  const totals = state.snapshot.trackedSecondsByDay;
  const max = Math.max(1, ...days.map((day) => totals[toDateInput(day)] ?? 0));

  return (
    <div className="calendar-week-strip" data-testid="calendar-week-strip">
      {days.map((day) => {
        const key = toDateInput(day);
        const seconds = totals[key] ?? 0;
        const heat = Math.round((seconds / max) * 100);
        return (
          <button
            key={key}
            className={`calendar-week-day ${key === selected ? "is-selected" : ""}`}
            onClick={() => {
              window.stopscrolling.setCalendarAnchor(day.toISOString());
              window.stopscrolling.setCalendarView("day");
            }}
          >
            <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <strong>{day.getDate()}</strong>
            <span className="calendar-week-heat" style={{ ["--heat" as string]: heat }} />
            <small>{formatDuration(seconds)}</small>
          </button>
        );
      })}
    </div>
  );
}

export function MonthHeatmap({ state }: { state: AppSnapshot }) {
  const month = new Date(state.calendarMonth);
  const selected = toDateInput(new Date(state.calendarAnchor));
  const days = monthGridDays(month);
  const totals = state.snapshot.trackedSecondsByDay;
  const max = Math.max(1, ...Object.values(totals));

  return (
    <div className="calendar-month-board" data-testid="calendar-month-board">
      <div className="month-heading">
        <IconButton label="Previous month" icon={ChevronLeft} onClick={() => shiftMonth(month, -1)} />
        <strong>{formatMonthLabel(month)}</strong>
        <IconButton label="Next month" icon={ChevronRight} onClick={() => shiftMonth(month, 1)} />
      </div>
      <div className="month-grid" aria-label={formatMonthLabel(month)}>
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <div key={`${label}-${index}`} className="month-weekday">{label}</div>
        ))}
        {days.map((day) => {
          const key = toDateInput(day);
          const heat = Math.round(((totals[key] ?? 0) / max) * 100);
          const outside = day.getMonth() !== month.getMonth();
          return (
            <button
              key={key + day.toISOString()}
              className={`month-day ${outside ? "outside" : ""} ${key === selected ? "selected" : ""}`}
              style={{ ["--heat" as string]: heat }}
              aria-label={`${day.toLocaleDateString()}, ${formatDuration(totals[key] ?? 0)} tracked`}
              aria-pressed={key === selected}
              onClick={() => {
                window.stopscrolling.setCalendarAnchor(day.toISOString());
                window.stopscrolling.setCalendarMonth(day.toISOString());
                window.stopscrolling.setCalendarView("day");
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shiftMonth(month: Date, delta: number) {
  const next = startOfMonth(month);
  next.setMonth(next.getMonth() + delta);
  window.stopscrolling.setCalendarMonth(next.toISOString());
}

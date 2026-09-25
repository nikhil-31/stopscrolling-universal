import { effectiveTimeZone, toDateInput, zonedDateTime, zonedParts } from "@shared/platform";
import { formatDuration, formatMonthLabel, monthGridDays, startOfMonth } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "../ui";

function zoneOf(state: AppSnapshot) {
  return effectiveTimeZone(state.auth?.user?.time_zone);
}

function dayNumber(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone }).format(date);
}

function weekdayShort(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone }).format(date);
}

export function MonthHeatmap({ state }: { state: AppSnapshot }) {
  const timeZone = zoneOf(state);
  const month = new Date(state.calendarMonth);
  const selected = toDateInput(new Date(state.calendarAnchor), timeZone);
  const days = monthGridDays(month, timeZone);
  const totals = state.snapshot.trackedSecondsByDay;
  const max = Math.max(1, ...Object.values(totals));
  const monthKey = toDateInput(startOfMonth(month, timeZone), timeZone).slice(0, 7);

  return (
    <div className="calendar-month-board" data-testid="calendar-month-board">
      <div className="month-heading">
        <IconButton label="Previous month" icon={ChevronLeft} onClick={() => shiftMonth(month, -1, timeZone)} />
        <strong>{formatMonthLabel(month, timeZone)}</strong>
        <IconButton label="Next month" icon={ChevronRight} onClick={() => shiftMonth(month, 1, timeZone)} />
      </div>
      <div className="month-grid" aria-label={formatMonthLabel(month, timeZone)}>
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <div key={`${label}-${index}`} className="month-weekday">{label}</div>
        ))}
        {days.map((day) => {
          const key = toDateInput(day, timeZone);
          const heat = Math.round(((totals[key] ?? 0) / max) * 100);
          const outside = !key.startsWith(monthKey);
          return (
            <button
              key={key + day.toISOString()}
              className={`month-day ${outside ? "outside" : ""} ${key === selected ? "selected" : ""}`}
              style={{ ["--heat" as string]: heat }}
              aria-label={`${weekdayShort(day, timeZone)} ${dayNumber(day, timeZone)}, ${formatDuration(totals[key] ?? 0)} tracked`}
              aria-pressed={key === selected}
              onClick={() => {
                window.stopscrolling.setCalendarAnchor(day.toISOString());
                window.stopscrolling.setCalendarMonth(day.toISOString());
                window.stopscrolling.setCalendarView("day");
              }}
            >
              {dayNumber(day, timeZone)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shiftMonth(month: Date, delta: number, timeZone: string) {
  const parts = zonedParts(month, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + delta, 1));
  const next = zonedDateTime(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, timeZone);
  window.stopscrolling.setCalendarMonth(next.toISOString());
}

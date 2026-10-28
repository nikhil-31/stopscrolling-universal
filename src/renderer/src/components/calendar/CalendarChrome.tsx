import type { CalendarView } from "@shared/calendar-workspace";
import { formatFullDate, formatWeekRange, mondayWeekDays } from "@shared/calendar-workspace";
import { effectiveTimeZone, toDateInput, zonedDateTime, zonedParts } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { formatMonthLabel } from "@shared/timeline";
import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton, Tooltip } from "../ui";
import { allDayEventsOn } from "./events";

const views: CalendarView[] = ["day", "week", "month"];

export function CalendarChrome({
  state,
  title: pageTitle,
  shortcuts = false,
}: {
  state: AppSnapshot;
  title?: string;
  shortcuts?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const anchor = new Date(state.calendarAnchor);
  const week = state.calendarView === "week";
  const month = state.calendarView === "month";
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const weekDays = week ? mondayWeekDays(anchor, timeZone) : null;
  const title = weekDays
    ? formatWeekRange(weekDays[0], weekDays[6], timeZone)
    : month
      ? formatMonthLabel(new Date(state.calendarMonth), timeZone)
      : formatFullDate(anchor);
  const stepLabel = week ? "week" : month ? "month" : "day";
  const allDay = allDayEventsOn(state.calendarEvents, anchor, timeZone);
  const calendarsLinked = state.calendarIntegration.google.accounts.length > 0
    || state.calendarIntegration.apple.access === "fullAccess";
  const awayFromToday = !viewIncludesToday(state.calendarView, anchor, new Date(state.calendarMonth), timeZone);
  const step = (delta: -1 | 1) => (
    month ? shiftMonth(new Date(state.calendarMonth), delta, timeZone) : shiftAnchor(anchor, (week ? 7 : 1) * delta)
  );
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "arrowleft") stepRef.current(-1);
      else if (key === "arrowright") stepRef.current(1);
      else if (key === "t") jumpToToday();
      else if (key === "d") window.stopscrolling.setCalendarView("day");
      else if (key === "w") window.stopscrolling.setCalendarView("week");
      else if (key === "m") window.stopscrolling.setCalendarView("month");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);

  return (
    <header className="calendar-chrome">
      <h2 className="calendar-chrome-date">
        {pageTitle ? (
          <>
            <span className="calendar-chrome-title">{pageTitle}</span>
            <span className="calendar-chrome-sep" aria-hidden="true">/</span>
          </>
        ) : null}
        {title}
      </h2>
      <div className="calendar-chrome-controls">
        <div className="calendar-chrome-nav">
          <Tooltip label={shortcuts ? `Previous ${stepLabel} (←)` : `Previous ${stepLabel}`}>
            <IconButton label={`Previous ${stepLabel}`} icon={ChevronLeft} onClick={() => step(-1)} />
          </Tooltip>
          <Tooltip label={shortcuts ? "Jump to today (T)" : "Jump to today"}>
            <button
              type="button"
              className="calendar-today-button"
              aria-label="Jump to today"
              disabled={!awayFromToday}
              onClick={jumpToToday}
            >
              Today
              {awayFromToday ? <span className="icon-button-dot" aria-hidden="true" /> : null}
            </button>
          </Tooltip>
          <Tooltip label={shortcuts ? `Next ${stepLabel} (→)` : `Next ${stepLabel}`}>
            <IconButton label={`Next ${stepLabel}`} icon={ChevronRight} onClick={() => step(1)} />
          </Tooltip>
        </div>
        <div className="seg calendar-view-switch" aria-label="Calendar view">
          {views.map((view) => (
            <button
              key={view}
              className={state.calendarView === view ? "active" : ""}
              aria-pressed={state.calendarView === view}
              title={shortcuts ? `${view[0].toUpperCase() + view.slice(1)} (${view[0].toUpperCase()})` : undefined}
              onClick={() => window.stopscrolling.setCalendarView(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
          <div className="calendar-more" ref={moreRef}>
            <IconButton
              label="More calendar options"
              icon={Ellipsis}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            />
            {menuOpen ? (
              <div className="calendar-more-menu" role="menu">
                {allDay.length ? (
                  allDay.map((event) => (
                    <div key={event.id} className="calendar-more-item">
                      <strong>{event.title}</strong>
                      <span>All day · {event.calendarName}</span>
                    </div>
                  ))
                ) : (
                  <div className="calendar-more-item muted">No all-day events</div>
                )}
                {state.calendarIntegration.errors.map((error) => (
                  <div key={error} className="calendar-more-item muted" role="status">{error}</div>
                ))}
                {!state.settings.showCalendarEvents || !calendarsLinked ? (
                  <button
                    type="button"
                    className="calendar-more-action"
                    onClick={() => {
                      setMenuOpen(false);
                      window.stopscrolling.openSettings();
                    }}
                  >
                    {calendarsLinked ? "Show calendar events" : "Connect a calendar"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function jumpToToday() {
  const now = new Date().toISOString();
  window.stopscrolling.setCalendarAnchor(now);
  window.stopscrolling.setCalendarMonth(now);
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function viewIncludesToday(view: CalendarView, anchor: Date, month: Date, timeZone: string) {
  const todayKey = toDateInput(new Date(), timeZone);
  if (view === "week") return mondayWeekDays(anchor, timeZone).some((day) => toDateInput(day, timeZone) === todayKey);
  if (view === "month") {
    const viewed = zonedParts(month, timeZone);
    const today = zonedParts(new Date(), timeZone);
    return viewed.year === today.year && viewed.month === today.month;
  }
  return toDateInput(anchor, timeZone) === todayKey;
}

function shiftAnchor(anchor: Date, days: number) {
  const next = new Date(anchor);
  next.setDate(next.getDate() + days);
  window.stopscrolling.setCalendarAnchor(next.toISOString());
  window.stopscrolling.setCalendarMonth(next.toISOString());
}

function shiftMonth(month: Date, delta: number, timeZone: string) {
  const parts = zonedParts(month, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + delta, 1));
  const next = zonedDateTime(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, timeZone);
  window.stopscrolling.setCalendarAnchor(next.toISOString());
  window.stopscrolling.setCalendarMonth(next.toISOString());
}

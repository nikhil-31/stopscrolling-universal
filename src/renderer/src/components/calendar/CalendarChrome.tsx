import type { CalendarView } from "@shared/calendar-workspace";
import { formatFullDate, formatWeekRange, mondayWeekDays } from "@shared/calendar-workspace";
import { effectiveTimeZone } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarClock, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { IconButton, Tooltip } from "../ui";

const views: CalendarView[] = ["day", "week", "month"];

export function CalendarChrome({
  state,
}: {
  state: AppSnapshot;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = new Date(state.calendarAnchor);
  const week = state.calendarView === "week";
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const weekDays = week ? mondayWeekDays(anchor, timeZone) : null;
  const title = weekDays ? formatWeekRange(weekDays[0], weekDays[6], timeZone) : formatFullDate(anchor);
  const allDay = state.calendarEvents.filter((event) => event.isAllDay);

  return (
    <header className="calendar-chrome">
      <h2 className="calendar-chrome-date">{title}</h2>
      <div className="calendar-chrome-controls">
        <div className="calendar-chrome-nav">
          <IconButton label={week ? "Previous week" : "Previous day"} icon={ChevronLeft} onClick={() => shiftAnchor(anchor, week ? -7 : -1)} />
          <Tooltip label="Jump to today">
            <IconButton
              label="Jump to today"
              icon={CalendarClock}
              onClick={() => window.stopscrolling.setCalendarAnchor(new Date().toISOString())}
            />
          </Tooltip>
          <IconButton label={week ? "Next week" : "Next day"} icon={ChevronRight} onClick={() => shiftAnchor(anchor, week ? 7 : 1)} />
        </div>
        <div className="seg calendar-view-switch" aria-label="Calendar view">
          {views.map((view) => (
            <button
              key={view}
              className={state.calendarView === view ? "active" : ""}
              aria-pressed={state.calendarView === view}
              onClick={() => window.stopscrolling.setCalendarView(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
          <div className="calendar-more">
            <IconButton
              label="More calendar options"
              icon={Ellipsis}
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
                {!state.settings.showGoogleCalendarEvents ? (
                  <button
                    type="button"
                    className="calendar-more-action"
                    onClick={() => {
                      setMenuOpen(false);
                      window.stopscrolling.openSettings();
                    }}
                  >
                    Connect Google Calendar
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

function shiftAnchor(anchor: Date, days: number) {
  const next = new Date(anchor);
  next.setDate(next.getDate() + days);
  window.stopscrolling.setCalendarAnchor(next.toISOString());
  window.stopscrolling.setCalendarMonth(next.toISOString());
}

import { formatDuration, formatMonthLabel, monthGridDays, startOfMonth, toDateInput } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
} from "lucide-react";
import { TimelineGroup, VerticalDay } from "../components/timeline";
import { Badge, Card, Grouped, IconButton, MetricCard } from "../components/ui";

export function CalendarScreen({ state }: { state: AppSnapshot }) {
  const month = new Date(state.calendarMonth);
  const selected = toDateInput(new Date(state.calendarAnchor));
  const days = monthGridDays(month);
  const totals = state.snapshot.trackedSecondsByDay;
  const max = Math.max(1, ...Object.values(totals));
  const timed = state.calendarEvents.filter((event) => !event.isAllDay);
  const allDay = state.calendarEvents.filter((event) => event.isAllDay);

  return (
    <div>
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Time map</div>
          <h2>See your day in context</h2>
          <p>Bring activity and calendar commitments together on one clear timeline.</p>
        </div>
        {state.googleCalendarConnected ? <Badge tone="success" dot>Calendar connected</Badge> : null}
      </header>
      <div className="calendar-layout">
        <aside className="calendar-side">
          <Card className="month-card">
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
                    }}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </Card>
          <Grouped title="Selected day" description={new Date(state.calendarAnchor).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}>
            <div className="data-row">
              <span className="row-main"><Clock3 size={14} aria-hidden="true" /><span className="row-title">Tracked</span></span>
              <strong className="row-value">{formatDuration(state.snapshot.totalSeconds)}</strong>
            </div>
            <div className="data-row">
              <span className="row-main"><Layers3 size={14} aria-hidden="true" /><span className="row-title">Sessions</span></span>
              <strong className="row-value">{state.snapshot.sessionCount}</strong>
            </div>
            <div className="data-row">
              <span className="row-main"><CalendarDays size={14} aria-hidden="true" /><span className="row-title">Events</span></span>
              <strong className="row-value">{state.calendarEvents.length}</strong>
            </div>
          </Grouped>
          {allDay.length ? (
            <Grouped title="All-day events">
              <div className="calendar-event-list">
                {allDay.map((event) => (
                  <div className="calendar-event-row" key={event.id}>
                    <span className="event-accent" />
                    <span className="row-copy">
                      <span className="row-title">{event.title}</span>
                      <span className="row-subtitle">{event.calendarName}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Grouped>
          ) : null}
          {!state.settings.showGoogleCalendarEvents ? (
            <p className="small muted">
              Connect Google Calendar in Settings to place events beside your activity.
            </p>
          ) : null}
        </aside>
        <div className="stack">
          <Card className="data-card">
            <div className="data-card-header">
              <div>
                <h3 className="data-card-title">Day timeline</h3>
                <div className="data-card-subtitle">Activity blocks and calendar events</div>
              </div>
              <Badge>{timed.length} timed events</Badge>
            </div>
            <VerticalDay timelines={state.timelines} events={timed} />
          </Card>
          <Card className="data-card">
            <div className="data-card-header">
              <div>
                <h3 className="data-card-title">Device activity</h3>
                <div className="data-card-subtitle">A compact view across each device</div>
              </div>
            </div>
            <TimelineGroup timelines={state.timelines} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function shiftMonth(month: Date, delta: number) {
  const next = startOfMonth(month);
  next.setMonth(next.getMonth() + delta);
  window.stopscrolling.setCalendarMonth(next.toISOString());
}

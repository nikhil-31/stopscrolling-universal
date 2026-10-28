import { toDateInput } from "@shared/platform";
import { formatClock } from "@shared/timeline";
import type { ClockFormat, CalendarOverlayEvent } from "@shared/types";

const PROVIDER_NAMES = { google: "Google", apple: "Apple" } as const;

/** Timed events that overlap [start, end). */
export function timedEventsBetween(events: CalendarOverlayEvent[], start: Date, end: Date) {
  return events.filter((event) => (
    !event.isAllDay
    && new Date(event.start).getTime() < end.getTime()
    && new Date(event.end).getTime() > start.getTime()
  ));
}

/** All-day events covering `day`. Their YYYY-MM-DD dates (end exclusive) are compared as dates, not instants. */
export function allDayEventsOn(events: CalendarOverlayEvent[], day: Date, timeZone: string) {
  const date = toDateInput(day, timeZone);
  return events.filter((event) => event.isAllDay && event.start.slice(0, 10) <= date && date < event.end.slice(0, 10));
}

/** Every event touching `day`: all-day ones first, then timed ones by start. */
export function eventsOnDay(events: CalendarOverlayEvent[], dayStart: Date, dayEnd: Date, timeZone: string) {
  const timed = timedEventsBetween(events, dayStart, dayEnd)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return [...allDayEventsOn(events, dayStart, timeZone), ...timed];
}

export function eventTooltip(event: CalendarOverlayEvent, clockFormat: ClockFormat) {
  const when = event.isAllDay ? "All day" : `${formatClock(event.start, clockFormat)} – ${formatClock(event.end, clockFormat)}`;
  return `${event.title}\n${when} · ${event.calendarName} (${PROVIDER_NAMES[event.provider]})`;
}

export function eventColor(event: CalendarOverlayEvent) {
  return event.colorHex || "#1fb894";
}

/** Columns for overlapping timed events, so they sit side by side instead of on top of each other. */
export function layoutOverlaps(events: CalendarOverlayEvent[]) {
  const sorted = [...events].sort((a, b) => (
    new Date(a.start).getTime() - new Date(b.start).getTime() || new Date(b.end).getTime() - new Date(a.end).getTime()
  ));
  const placed: Array<{ event: CalendarOverlayEvent; column: number; columns: number }> = [];
  let cluster: typeof placed = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
  };
  for (const event of sorted) {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    if (start >= clusterEnd) flush();
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) column = columnEnds.push(end) - 1;
    else columnEnds[column] = end;
    cluster.push({ event, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return placed;
}

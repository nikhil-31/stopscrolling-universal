import { hourLabel24, isOngoingBlock } from "@shared/calendar-workspace";
import { deviceColor, deviceKey, displayNameForDevice } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import { effectiveTimeZone, endOfDay, startOfDay } from "@shared/platform";
import { combineSessionBlocks, formatClock, hourLabelWithPeriod } from "@shared/timeline";
import { useClockFormat } from "../../clock-format";
import { useSessionTitle } from "../../session-title";
import type { CalendarOverlayEvent, ForegroundContext, ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "@shared/types";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { SessionHoverCard } from "../timeline/SessionHoverCard";

export const DAY_HOUR_HEIGHT = 48;
export const DAY_BOARD_HEIGHT = DAY_HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_COL = 52;
const ENTRY_MIN = 110;
const CALENDAR_MIN = 160;

export function DayBoard({ state }: { state: AppSnapshot }) {
  const clockFormat = useClockFormat();
  const titleFor = useSessionTitle();
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const dayStart = startOfDay(new Date(state.calendarAnchor), timeZone);
  const dayEnd = endOfDay(new Date(state.calendarAnchor), timeZone);
  const timelines = state.timelines.length ? state.timelines : [emptyTimeline(dayStart, dayEnd)];
  const manyDevices = timelines.length > 1;
  const blocks = timelines.flatMap((timeline) => timeline.blocks);
  const events = layoutOverlaps(state.calendarEvents.filter((event) => !event.isAllDay));
  const allDay = state.calendarEvents.filter((event) => event.isAllDay);
  const now = Date.now();
  const isToday = now >= dayStart.getTime() && now < dayEnd.getTime();
  const nowY = ((now - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * DAY_BOARD_HEIGHT;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    block: ScreenTimeSessionBlock;
    x: number;
    y: number;
  } | null>(null);
  const firstEntryTop = earliestEntryTop(blocks, dayStart, dayEnd);
  const gridTemplateColumns = `52px repeat(${timelines.length}, minmax(${ENTRY_MIN}px, 1fr)) minmax(${CALENDAR_MIN}px, 1.1fr)`;
  const gridMinWidth = HOUR_COL + timelines.length * ENTRY_MIN + CALENDAR_MIN;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const header = scroller.querySelector(".day-board-head");
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    const current = Date.now();
    const start = startOfDay(new Date(state.calendarAnchor), timeZone).getTime();
    const end = endOfDay(new Date(state.calendarAnchor), timeZone).getTime();
    const viewingToday = current >= start && current < end;
    if (viewingToday) {
      const y = ((current - start) / (end - start)) * DAY_BOARD_HEIGHT;
      scroller.scrollTop = dayBoardScrollTop({
        isToday: true,
        nowY: y,
        firstEntryTop: null,
        viewportHeight: scroller.clientHeight,
        headerHeight,
      });
      return;
    }
    if (firstEntryTop == null) return;
    scroller.scrollTop = dayBoardScrollTop({
      isToday: false,
      nowY: 0,
      firstEntryTop,
      viewportHeight: scroller.clientHeight,
      headerHeight,
    });
  }, [state.calendarAnchor, timeZone, isToday ? "now" : firstEntryTop]);

  return (
    <div className="day-board" data-testid="calendar-day-board" ref={scrollerRef}>
      <div className="day-board-head" style={{ gridTemplateColumns, minWidth: gridMinWidth }}>
        <span />
        {timelines.map((timeline) => (
          <span key={timeline.id}>{manyDevices ? deviceLabel(timeline, state.devices) : "Time Entries"}</span>
        ))}
        <span>Calendar</span>
        {allDay.length ? (
          <>
            <span className="day-board-allday-label">All day</span>
            <div className="day-board-allday" style={{ gridColumn: "2 / -1" }}>
              {allDay.map((event) => (
                <span
                  key={event.id}
                  className="calendar-allday-chip"
                  style={{ ["--block-color" as string]: event.colorHex || "#1fb894" }}
                  title={`${event.title} · ${event.calendarName}`}
                >
                  {event.title}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="day-board-body" style={{ height: DAY_BOARD_HEIGHT, gridTemplateColumns, minWidth: gridMinWidth }}>
        <div className="day-board-hours" aria-hidden="true">
          {HOURS.map((hour) => (
            <div key={hour} style={{ height: DAY_HOUR_HEIGHT }}>{clockFormat === "24" ? hourLabel24(hour) : hourLabelWithPeriod(hour)}</div>
          ))}
        </div>
        {timelines.map((timeline) => {
          const blockColor = deviceColor(deviceKey(timeline.devicePlatform, timeline.deviceName), state.devices);
          return (
          <div
            key={timeline.id}
            className="day-board-col day-board-entries"
            data-testid={`calendar-device-column-${timeline.id}`}
            aria-label={manyDevices ? `Time entries · ${deviceLabel(timeline, state.devices)}` : "Time Entries"}
          >
            {!timeline.blocks.length ? (
              <div className="day-board-empty" style={{ top: emptyTop(isToday, nowY, firstEntryTop) }}>
                {isToday ? "Nothing tracked yet today" : "No activity recorded"}
              </div>
            ) : null}
            {combineSessionBlocks(timeline.blocks).map((block) => {
              const live = isLocalLiveBlock(block, timeline, state, now);
              const style = placeDayBlock(block.start, block.end, dayStart, dayEnd);
              const sentence = titleFor(block);
              const range = `${formatClock(block.start, clockFormat)} – ${formatClock(block.end, clockFormat)}`;
              const showHover = (event: ReactMouseEvent) => {
                setHover({ block, x: event.clientX, y: event.clientY });
              };
              return (
                <button
                  key={block.id}
                  type="button"
                  className={`day-block day-block-entry is-solid ${live ? "is-live" : ""}`}
                  style={{ ...style, ["--block-color" as string]: blockColor }}
                  title={sentence}
                  aria-label={live ? `Tracking, ${sentence}, ${range}` : `${sentence}, ${range}`}
                  onMouseEnter={showHover}
                  onMouseMove={showHover}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => window.stopscrolling.selectInspector({ kind: "block", block })}
                >
                  {live ? (
                    <strong>Tracking...</strong>
                  ) : (
                    <>
                      <strong>{sentence}</strong>
                      {style.height > 36 ? <span>{formatClock(block.start, clockFormat)}</span> : null}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          );
        })}
        <div className="day-board-col day-board-calendar">
          {events.map(({ event, column, columns }, index) => {
            const style = {
              ...placeDayBlock(event.start, event.end, dayStart, dayEnd),
              left: `calc(${(column / columns) * 100}% + 6px)`,
              width: `calc(${100 / columns}% - ${columns > 1 ? 8 : 12}px)`,
              right: "auto",
            };
            const color = event.colorHex || (index % 2 === 0 ? "#1fb894" : "#2de2e2");
            return (
              <div
                key={event.id}
                className="day-block day-block-event is-solid"
                style={{ ...style, ["--block-color" as string]: color }}
                title={`${event.title}\n${formatClock(event.start, clockFormat)} – ${formatClock(event.end, clockFormat)}`}
              >
                <strong>{event.title}</strong>
                {style.height > 34 ? (
                  <span>{formatClock(event.start, clockFormat)} – {formatClock(event.end, clockFormat)}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {isToday ? <div className="day-board-now" style={{ top: nowY }} data-time={formatClock(new Date(now), clockFormat)} /> : null}
      </div>
      {hover ? <SessionHoverCard block={hover.block} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

function emptyTop(isToday: boolean, nowY: number, firstEntryTop: number | null) {
  return isToday ? Math.max(8, nowY - 40) : firstEntryTop ?? DAY_HOUR_HEIGHT * 9;
}

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

function deviceLabel(timeline: ScreenTimeDeviceTimeline, devices: AppSnapshot["devices"]) {
  return displayNameForDevice(timeline.devicePlatform, timeline.deviceName, devices);
}

export function isLocalLiveBlock(
  block: ScreenTimeSessionBlock,
  timeline: ScreenTimeDeviceTimeline,
  state: AppSnapshot,
  now: number,
) {
  if (!isOngoingBlock(block, now, state.isTracking)) return false;
  const platform = state.capabilities?.platform;
  if (platform && timeline.devicePlatform && timeline.devicePlatform !== platform) return false;
  const context = state.currentContext;
  if (!context) return true;
  return blockMatchesContext(block, context);
}

function blockMatchesContext(block: ScreenTimeSessionBlock, context: ForegroundContext) {
  return block.items.some((item) => item.appName === context.appName)
    || block.title === context.appName
    || block.title === context.title;
}

function emptyTimeline(dayStart: Date, dayEnd: Date): ScreenTimeDeviceTimeline {
  return {
    id: "empty-timeline",
    deviceName: "",
    devicePlatform: "",
    timeZoneIdentifier: "",
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
    segments: [],
    blocks: [],
  };
}

export function dayBoardScrollTop({
  isToday,
  nowY,
  firstEntryTop,
  viewportHeight,
  headerHeight,
}: {
  isToday: boolean;
  nowY: number;
  firstEntryTop: number | null;
  viewportHeight: number;
  headerHeight: number;
}) {
  if (isToday) {
    const visible = Math.max(0, viewportHeight - headerHeight);
    return Math.max(0, nowY - visible / 2);
  }
  if (firstEntryTop == null) return 0;
  return Math.max(0, firstEntryTop - headerHeight - 8);
}

function earliestEntryTop(
  blocks: Array<{ start: string; end: string }>,
  dayStart: Date,
  dayEnd: Date,
) {
  if (!blocks.length) return null;
  const first = blocks.reduce((earliest, block) => (
    new Date(block.start).getTime() < new Date(earliest.start).getTime() ? block : earliest
  ));
  return placeDayBlock(first.start, first.end, dayStart, dayEnd).top;
}

export function placeDayBlock(startIso: string, endIso: string, dayStart: Date, dayEnd: Date) {
  const span = dayEnd.getTime() - dayStart.getTime();
  const start = Math.max(new Date(startIso).getTime(), dayStart.getTime());
  const end = Math.min(new Date(endIso).getTime(), dayEnd.getTime());
  const top = ((start - dayStart.getTime()) / span) * DAY_BOARD_HEIGHT;
  const height = Math.max(16, ((end - start) / span) * DAY_BOARD_HEIGHT);
  return { top, height };
}

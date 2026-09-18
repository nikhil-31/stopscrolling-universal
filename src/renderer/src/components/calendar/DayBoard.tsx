import { formatClock24, hourLabel24, isOngoingBlock } from "@shared/calendar-workspace";
import { displayNameForDevice } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import { endOfDay, startOfDay } from "@shared/platform";
import { formatClock } from "@shared/timeline";
import type { ForegroundContext, ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "@shared/types";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { SessionHoverCard } from "../timeline/SessionHoverCard";

const HOUR_HEIGHT = 48;
const HEIGHT = HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_COL = 52;
const ENTRY_MIN = 110;
const CALENDAR_MIN = 160;

export function DayBoard({ state }: { state: AppSnapshot }) {
  const dayStart = startOfDay(new Date(state.calendarAnchor));
  const dayEnd = endOfDay(new Date(state.calendarAnchor));
  const timelines = state.timelines.length ? state.timelines : [emptyTimeline(dayStart, dayEnd)];
  const manyDevices = timelines.length > 1;
  const blocks = timelines.flatMap((timeline) => timeline.blocks);
  const events = state.calendarEvents.filter((event) => !event.isAllDay);
  const now = Date.now();
  const isToday = now >= dayStart.getTime() && now < dayEnd.getTime();
  const nowY = ((now - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * HEIGHT;
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
    const start = startOfDay(new Date(state.calendarAnchor)).getTime();
    const end = endOfDay(new Date(state.calendarAnchor)).getTime();
    const viewingToday = current >= start && current < end;
    if (viewingToday) {
      const y = ((current - start) / (end - start)) * HEIGHT;
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
  }, [state.calendarAnchor, isToday ? "now" : firstEntryTop]);

  return (
    <div className="day-board" data-testid="calendar-day-board" ref={scrollerRef}>
      <div className="day-board-head" style={{ gridTemplateColumns, minWidth: gridMinWidth }}>
        <span />
        {timelines.map((timeline) => (
          <span key={timeline.id}>{manyDevices ? deviceLabel(timeline, state.devices) : "Time Entries"}</span>
        ))}
        <span>Calendar</span>
      </div>
      <div className="day-board-body" style={{ height: HEIGHT, gridTemplateColumns, minWidth: gridMinWidth }}>
        <div className="day-board-hours" aria-hidden="true">
          {HOURS.map((hour) => (
            <div key={hour} style={{ height: HOUR_HEIGHT }}>{hourLabel24(hour)}</div>
          ))}
        </div>
        {timelines.map((timeline) => (
          <div
            key={timeline.id}
            className="day-board-col day-board-entries"
            data-testid={`calendar-device-column-${timeline.id}`}
            aria-label={manyDevices ? `Time entries · ${deviceLabel(timeline, state.devices)}` : "Time Entries"}
          >
            {timeline.blocks.map((block) => {
              const live = isLocalLiveBlock(block, timeline, state, now);
              const style = place(block.start, block.end, dayStart, dayEnd);
              const showHover = (event: ReactMouseEvent) => {
                setHover({ block, x: event.clientX, y: event.clientY });
              };
              return (
                <button
                  key={block.id}
                  className={`day-block day-block-entry is-solid ${live ? "is-live" : ""}`}
                  style={style}
                  onMouseEnter={showHover}
                  onMouseMove={showHover}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => window.stopscrolling.selectInspector({ kind: "block", block })}
                >
                  {live ? (
                    <strong>Tracking...</strong>
                  ) : (
                    <>
                      <strong>{block.title}</strong>
                      {style.height > 36 ? <span>{formatClock(block.start)}</span> : null}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="day-board-col day-board-calendar">
          {events.map((event, index) => {
            const style = place(event.start, event.end, dayStart, dayEnd);
            const color = event.colorHex || (index % 2 === 0 ? "#1fb894" : "#2de2e2");
            return (
              <div
                key={event.id}
                className="day-block day-block-event is-solid"
                style={{ ...style, ["--block-color" as string]: color }}
                title={`${event.title}\n${formatClock24(event.start)} – ${formatClock24(event.end)}`}
              >
                <strong>{event.title}</strong>
                {style.height > 34 ? (
                  <span>{formatClock24(event.start)} – {formatClock24(event.end)}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {isToday ? <div className="day-board-now" style={{ top: nowY }} /> : null}
      </div>
      {hover ? <SessionHoverCard block={hover.block} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

function deviceLabel(timeline: ScreenTimeDeviceTimeline, devices: AppSnapshot["devices"]) {
  return displayNameForDevice(timeline.devicePlatform, timeline.deviceName, devices);
}

function isLocalLiveBlock(
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
  return place(first.start, first.end, dayStart, dayEnd).top;
}

function place(startIso: string, endIso: string, dayStart: Date, dayEnd: Date) {
  const span = dayEnd.getTime() - dayStart.getTime();
  const start = Math.max(new Date(startIso).getTime(), dayStart.getTime());
  const end = Math.min(new Date(endIso).getTime(), dayEnd.getTime());
  const top = ((start - dayStart.getTime()) / span) * HEIGHT;
  const height = Math.max(16, ((end - start) / span) * HEIGHT);
  return { top, height };
}

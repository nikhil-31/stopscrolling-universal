import { clipInterval, hourLabel24, mondayWeekDays } from "@shared/calendar-workspace";
import { deviceColor, deviceKey, displayNameForDevice } from "@shared/device";
import { effectiveTimeZone, endOfDay, startOfDay, toDateInput } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { formatClock, hourLabelWithPeriod } from "@shared/timeline";
import type { ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "@shared/types";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useClockFormat } from "../../clock-format";
import { SessionHoverCard } from "../timeline/SessionHoverCard";
import {
  DAY_BOARD_HEIGHT,
  DAY_HOUR_HEIGHT,
  dayBoardScrollTop,
  isLocalLiveBlock,
  placeDayBlock,
} from "./DayBoard";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_COL = 52;
const DAY_MIN = 96;
const RANGE_HEIGHT = 36;

type DayItem = {
  block: ScreenTimeSessionBlock;
  timeline: ScreenTimeDeviceTimeline;
  start: number;
  end: number;
};

export function WeekBoard({
  state,
  onSuggest,
}: {
  state: AppSnapshot;
  onSuggest: (block: ScreenTimeSessionBlock) => void;
}) {
  const clockFormat = useClockFormat();
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const anchor = new Date(state.calendarAnchor);
  const days = mondayWeekDays(anchor, timeZone);
  const now = Date.now();
  const todayKey = toDateInput(new Date(now), timeZone);
  const weekHasToday = days.some((day) => toDateInput(day, timeZone) === todayKey);
  const todayStart = startOfDay(new Date(now), timeZone).getTime();
  const todayEnd = endOfDay(new Date(now), timeZone).getTime();
  const nowY = weekHasToday ? ((now - todayStart) / (todayEnd - todayStart)) * DAY_BOARD_HEIGHT : 0;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    block: ScreenTimeSessionBlock;
    x: number;
    y: number;
  } | null>(null);
  const timelines = state.timelines.length ? state.timelines : [emptyWeekTimeline()];
  const manyDevices = timelines.length > 1;
  const columns = days.flatMap((day) => timelines.map((timeline, index) => (
    dayDeviceColumn(day, timeline, timeZone, state, now, index === 0)
  )));
  const firstEntryTop = earliestTop(columns);
  const columnCount = days.length * timelines.length;
  const gridTemplateColumns = `${HOUR_COL}px repeat(${columnCount}, minmax(${DAY_MIN}px, 1fr))`;
  const gridMinWidth = HOUR_COL + columnCount * DAY_MIN;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const header = scroller.querySelector(".day-board-head");
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    const current = Date.now();
    const containsToday = mondayWeekDays(new Date(state.calendarAnchor), timeZone)
      .some((day) => {
        const start = startOfDay(day, timeZone).getTime();
        const end = endOfDay(day, timeZone).getTime();
        return current >= start && current < end;
      });
    if (containsToday) {
      const start = startOfDay(new Date(current), timeZone).getTime();
      const end = endOfDay(new Date(current), timeZone).getTime();
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
  }, [state.calendarAnchor, timeZone, weekHasToday ? "now" : firstEntryTop]);

  return (
    <div className="day-board week-board" data-testid="calendar-week-board" ref={scrollerRef}>
      <div className="day-board-head week-board-head" style={{ gridTemplateColumns, minWidth: gridMinWidth }}>
        <span />
        {days.map((day) => {
          const key = toDateInput(day, timeZone);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={`week-day-head ${isToday ? "is-today" : ""}`}
              style={{ gridColumn: `span ${timelines.length}` }}
            >
              <span className="week-day-name">{weekdayName(day, timeZone)}</span>
              <span className="week-day-number">{dayNumber(day, timeZone)}</span>
            </div>
          );
        })}
        {manyDevices ? <span className="week-device-gutter" /> : null}
        {manyDevices ? days.flatMap((day) => {
          const key = toDateInput(day, timeZone);
          return timelines.map((timeline, index) => (
            <span
              key={`${key}-${timeline.id}`}
              className={`week-device-name ${index === 0 ? "is-day-start" : ""}`}
            >
              {displayNameForDevice(timeline.devicePlatform, timeline.deviceName, state.devices)}
            </span>
          ));
        }) : null}
      </div>
      <div className="day-board-body" style={{ height: DAY_BOARD_HEIGHT, gridTemplateColumns, minWidth: gridMinWidth }}>
        <div className="day-board-hours" aria-hidden="true">
          {HOURS.map((hour) => (
            <div key={hour} style={{ height: DAY_HOUR_HEIGHT }}>
              {clockFormat === "24" ? hourLabel24(hour) : hourLabelWithPeriod(hour)}
            </div>
          ))}
        </div>
        {columns.map((column) => (
          <div
            key={column.key}
            className={`day-board-col ${column.dayStartColumn ? "is-day-start" : ""}`}
            data-testid={`calendar-week-day-${column.key}`}
          >
            {column.items.map((item) => {
              const live = isLocalLiveBlock(item.block, item.timeline, state, now);
              const placed = placeDayBlock(new Date(item.start).toISOString(), new Date(item.end).toISOString(), column.dayStart, column.dayEnd);
              const color = deviceColor(deviceKey(item.timeline.devicePlatform, item.timeline.deviceName), state.devices);
              const showHover = (event: ReactMouseEvent) => {
                setHover({ block: item.block, x: event.clientX, y: event.clientY });
              };
              return (
                <button
                  key={`${item.timeline.id}-${item.block.id}`}
                  type="button"
                  className={`day-block day-block-entry ${live ? "is-hatched" : "is-solid"}`}
                  style={{
                    top: placed.top,
                    height: placed.height,
                    ["--block-color" as string]: color,
                  }}
                  onMouseEnter={showHover}
                  onMouseMove={showHover}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    if (live) {
                      onSuggest(item.block);
                      return;
                    }
                    window.stopscrolling.selectInspector({ kind: "block", block: item.block });
                  }}
                >
                  {live ? (
                    <>
                      <strong>Tracking</strong>
                      <span className="week-block-suggestion">Click to create suggestion</span>
                    </>
                  ) : (
                    <>
                      <strong>{item.block.title}</strong>
                      <span>
                        {placed.height > RANGE_HEIGHT
                          ? `${formatClock(new Date(item.start), clockFormat)} – ${formatClock(new Date(item.end), clockFormat)}`
                          : compactDuration(item.start, item.end)}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {weekHasToday ? <div className="day-board-now" style={{ top: nowY }} /> : null}
      </div>
      {hover ? <SessionHoverCard block={hover.block} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

function dayDeviceColumn(
  day: Date,
  timeline: ScreenTimeDeviceTimeline,
  timeZone: string,
  state: AppSnapshot,
  now: number,
  dayStartColumn: boolean,
) {
  const dayStart = startOfDay(day, timeZone);
  const dayEnd = endOfDay(day, timeZone);
  const items: DayItem[] = [];
  for (const block of timeline.blocks) {
    const clipped = clipInterval(block.start, block.end, dayStart, dayEnd);
    if (!clipped) continue;
    const end = isLocalLiveBlock(block, timeline, state, now) ? Math.max(clipped[1], now) : clipped[1];
    items.push({ block, timeline, start: clipped[0], end: Math.min(end, dayEnd.getTime()) });
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    key: `${toDateInput(day, timeZone)}-${timeline.id}`,
    dayStart,
    dayEnd,
    dayStartColumn,
    items,
  };
}

function emptyWeekTimeline(): ScreenTimeDeviceTimeline {
  return {
    id: "empty-timeline",
    deviceName: "",
    devicePlatform: "",
    timeZoneIdentifier: "",
    dayStart: "",
    dayEnd: "",
    segments: [],
    blocks: [],
  };
}

function earliestTop(columns: Array<{ dayStart: Date; dayEnd: Date; items: DayItem[] }>) {
  let top: number | null = null;
  for (const column of columns) {
    for (const item of column.items) {
      const placed = placeDayBlock(new Date(item.start).toISOString(), new Date(item.end).toISOString(), column.dayStart, column.dayEnd);
      top = top == null ? placed.top : Math.min(top, placed.top);
    }
  }
  return top;
}

function compactDuration(start: number, end: number) {
  const safe = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function weekdayName(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone }).format(date);
}

function dayNumber(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone }).format(date);
}

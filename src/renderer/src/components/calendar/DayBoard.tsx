import {
  assignmentsForDay,
  formatClock24,
  hourLabel24,
  isOngoingBlock,
  labelForId,
  suggestLabel,
  tasksForDay,
  timeAtFraction,
  unlabeledBlocks,
} from "@shared/calendar-workspace";
import type { CalendarPrompt } from "./types";
import type { AppSnapshot } from "@shared/snapshot";
import { endOfDay, startOfDay } from "@shared/platform";
import { formatClock } from "@shared/timeline";
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

const HOUR_HEIGHT = 48;
const HEIGHT = HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function DayBoard({
  state,
  onPrompt,
}: {
  state: AppSnapshot;
  onPrompt: (prompt: CalendarPrompt) => void;
}) {
  const dayStart = startOfDay(new Date(state.calendarAnchor));
  const dayEnd = endOfDay(new Date(state.calendarAnchor));
  const blocks = state.timelines.flatMap((timeline) => timeline.blocks);
  const unlabeled = new Set(unlabeledBlocks(blocks, state.calendarWorkspace).map((block) => block.id));
  const labels = assignmentsForDay(state.calendarWorkspace, dayStart, dayEnd);
  const tasks = tasksForDay(state.calendarWorkspace, dayStart, dayEnd);
  const events = state.calendarEvents.filter((event) => !event.isAllDay);
  const now = Date.now();
  const isToday = now >= dayStart.getTime() && now < dayEnd.getTime();
  const nowY = ((now - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * HEIGHT;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const firstEntryTop = earliestEntryTop(blocks, dayStart, dayEnd);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || firstEntryTop == null) return;
    const header = scroller.querySelector(".day-board-head");
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    scroller.scrollTop = Math.max(0, firstEntryTop - headerHeight - 8);
  }, [state.calendarAnchor, firstEntryTop]);

  const onCanvasClick = (column: "labels" | "tasks", event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - bounds.top) / HEIGHT;
    const start = timeAtFraction(dayStart, fraction);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    if (column === "labels") {
      onPrompt({ kind: "label", start: start.toISOString(), end: end.toISOString() });
    } else {
      onPrompt({ kind: "task", start: start.toISOString(), end: end.toISOString() });
    }
  };

  return (
    <div className="day-board" data-testid="calendar-day-board" ref={scrollerRef}>
      <div className="day-board-head">
        <span />
        <span>Time Entries</span>
        <span>Labels</span>
        <span>Tasks</span>
        <span>Calendar</span>
      </div>
      <div className="day-board-body" style={{ height: HEIGHT }}>
        <div className="day-board-hours" aria-hidden="true">
          {HOURS.map((hour) => (
            <div key={hour} style={{ height: HOUR_HEIGHT }}>{hourLabel24(hour)}</div>
          ))}
        </div>
        <div className="day-board-col day-board-entries">
          {blocks.map((block) => {
            const live = isOngoingBlock(block, now, state.isTracking);
            const unlabeledBlock = unlabeled.has(block.id);
            const style = place(block.start, block.end, dayStart, dayEnd);
            return (
              <button
                key={block.id}
                className={`day-block day-block-entry is-solid ${live ? "is-live" : ""}`}
                style={style}
                onClick={() => {
                  window.stopscrolling.selectInspector({ kind: "block", block });
                  if (unlabeledBlock || live) {
                    const suggested = suggestLabel(block, state.calendarWorkspace.labels);
                    onPrompt({
                      kind: "label",
                      start: block.start,
                      end: block.end,
                      blockId: block.id,
                      suggestedLabelId: suggested?.id,
                    });
                  }
                }}
              >
                {live ? (
                  <>
                    <strong>Tracking...</strong>
                    <span>Click to create suggestion</span>
                  </>
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
        <div className="day-board-col day-board-labels" onClick={(event) => onCanvasClick("labels", event)}>
          {labels.map((assignment) => {
            const label = labelForId(state.calendarWorkspace, assignment.labelId);
            const style = place(assignment.start, assignment.end, dayStart, dayEnd);
            return (
              <button
                key={assignment.id}
                className={`day-block day-block-label ${assignment.source === "suggestion" ? "is-hatched" : "is-solid"}`}
                style={{ ...style, ["--block-color" as string]: label?.color || "#1fb894" }}
                onClick={(event) => {
                  event.stopPropagation();
                  onPrompt({
                    kind: "label",
                    start: assignment.start,
                    end: assignment.end,
                    assignmentId: assignment.id,
                    suggestedLabelId: assignment.labelId,
                  });
                }}
              />
            );
          })}
        </div>
        <div className="day-board-col day-board-tasks" onClick={(event) => onCanvasClick("tasks", event)}>
          {tasks.map((task) => {
            const style = place(task.start, task.end, dayStart, dayEnd);
            return (
              <button
                key={task.id}
                className="day-block day-block-task is-solid"
                style={{ ...style, ["--block-color" as string]: "#478ff5" }}
                onClick={(event) => {
                  event.stopPropagation();
                  onPrompt({ kind: "task", start: task.start, end: task.end, taskId: task.id, title: task.title });
                }}
              >
                {style.height > 22 ? <strong>{task.title}</strong> : null}
              </button>
            );
          })}
        </div>
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
    </div>
  );
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

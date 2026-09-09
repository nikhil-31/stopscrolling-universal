import { useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  colorForCategory,
  formatClock,
  formatDuration,
  hourLabel,
  sessionBlockPlacements,
  timelineAxisTicks,
  VERTICAL_TIMELINE_HOUR_HEIGHT,
  VERTICAL_TIMELINE_HOURS,
} from "@shared/timeline";
import type {
  CalendarOverlayEvent,
  ScreenTimeDeviceTimeline,
  ScreenTimeSessionBlock,
} from "@shared/types";
import { AppWindow, Clock3, Globe2, Laptop2, Layers3 } from "lucide-react";
import { Badge, Card, EmptyState } from "../ui";

export function TimelineGroup({
  timelines,
  compact = false,
}: {
  timelines: ScreenTimeDeviceTimeline[];
  compact?: boolean;
}) {
  return (
    <div className={`native-timeline-stack ${compact ? "is-compact" : ""}`}>
      {(timelines.length ? timelines : [emptyTimeline()]).map((timeline) => (
        <NativeMacTimeline
          key={timeline.id}
          timeline={timeline}
          showDeviceHeader={!compact && timelines.length > 1}
          compact={compact}
        />
      ))}
    </div>
  );
}

function NativeMacTimeline({
  timeline,
  showDeviceHeader,
  compact = false,
}: {
  timeline: ScreenTimeDeviceTimeline;
  showDeviceHeader: boolean;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<{ x: number; time: Date; block: ScreenTimeSessionBlock | null } | null>(null);
  const dayStart = new Date(timeline.dayStart).getTime();
  const dayEnd = new Date(timeline.dayEnd).getTime();
  const span = dayEnd - dayStart || 1;
  const now = Date.now();
  const nowFraction = now >= dayStart && now < dayEnd ? (now - dayStart) / span : null;
  const ticks = timelineAxisTicks(new Date(timeline.dayStart), new Date(timeline.dayEnd));
  const total = timeline.blocks.reduce((sum, block) => sum + block.durationSeconds, 0);

  const onMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const fraction = bounds.width ? x / bounds.width : 0;
    const timestamp = dayStart + fraction * span;
    const block = timeline.blocks.find((candidate) => {
      const start = new Date(candidate.start).getTime();
      const end = new Date(candidate.end).getTime();
      return timestamp >= start && timestamp <= end;
    }) ?? null;
    setHover({ x, time: new Date(timestamp), block });
  };

  return (
    <section className="native-timeline">
      {showDeviceHeader ? (
        <div className="native-device-row">
          <span className="native-device-icon"><Laptop2 size={14} aria-hidden="true" /></span>
          <strong>{timeline.deviceName || "This device"}</strong>
          <span>{timeline.devicePlatform || "desktop"}</span>
          <span className="native-device-spacer" />
          <Globe2 size={12} aria-hidden="true" />
          <span>{timeline.timeZoneIdentifier || "Local"}</span>
          <strong className="native-device-total">{formatDuration(total)}</strong>
        </div>
      ) : null}
      <div
        className={`native-timeline-track ${compact ? "is-compact" : ""}`}
        role="img"
        aria-label={`${timeline.deviceName || "Device"} day timeline, ${timeline.blocks.length} blocks, ${formatDuration(total)} tracked`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <div className="native-grid" aria-hidden="true">
          {(compact ? ticks : Array.from({ length: 9 }, (_, index) => ({ fraction: index * 0.125, label: String(index) }))).map((tick, index) => (
            <span key={`${tick.label}-${index}`} style={{ left: `${tick.fraction * 100}%` }} />
          ))}
        </div>
        {timeline.blocks.map((block) => {
          const start = new Date(block.start).getTime();
          const end = new Date(block.end).getTime();
          const x = Math.max(0, Math.min(1, (start - dayStart) / span));
          const width = Math.max(0.004, Math.min(1 - x, (end - start) / span));
          const isHovered = hover?.block?.id === block.id;
          return (
            <button
              key={block.id}
              className={`native-timeline-block ${isHovered ? "is-hovered" : ""} ${compact ? "is-compact" : ""}`}
              style={{
                left: `${x * 100}%`,
                width: `${width * 100}%`,
                ["--block-color" as string]: compact ? "var(--brand)" : colorForCategory(block.items[0]?.id || block.category),
              }}
              aria-label={`${block.title}, ${formatClock(block.start)} to ${formatClock(block.end)}, ${formatDuration(block.durationSeconds)}`}
              onClick={() => window.stopscrolling.selectInspector({ kind: "block", block })}
            />
          );
        })}
        {nowFraction !== null ? (
          <div className={`native-now-line ${compact ? "is-compact" : ""}`} style={{ left: `${nowFraction * 100}%` }} />
        ) : null}
        {hover ? (
          <>
            <div className="native-hover-line" style={{ left: hover.x }} />
            <span
              className="native-hover-time"
              style={{ left: `clamp(26px, ${hover.x}px, calc(100% - 26px))` }}
            >
              {formatClock(hover.time)}
            </span>
            {hover.block ? (
              <NativeHoverCard block={hover.block} x={hover.x} />
            ) : null}
          </>
        ) : null}
      </div>
      <div className={`native-hour-axis ${compact ? "is-compact" : ""}`} aria-hidden="true">
        {(compact ? ticks : [
          { fraction: 0, label: "12 AM" },
          { fraction: 0.125, label: "3 AM" },
          { fraction: 0.25, label: "6 AM" },
          { fraction: 0.375, label: "9 AM" },
          { fraction: 0.5, label: "12 PM" },
          { fraction: 0.625, label: "3 PM" },
          { fraction: 0.75, label: "6 PM" },
          { fraction: 0.875, label: "9 PM" },
          { fraction: 1, label: "12 AM" },
        ]).map((tick, index) => (
          <span key={`${tick.label}-${index}`} style={{ left: `${tick.fraction * 100}%` }}>{tick.label}</span>
        ))}
      </div>
      {!timeline.blocks.length ? (
        <div className="native-timeline-empty">No activity recorded for this {compact ? "period" : "day"}.</div>
      ) : null}
    </section>
  );
}

function NativeHoverCard({ block, x }: { block: ScreenTimeSessionBlock; x: number }) {
  return (
    <div
      className="native-hover-card"
      style={{ left: `clamp(8px, calc(${x}px - 120px), calc(100% - 248px))` }}
    >
      <div className="native-hover-heading">
        <strong>{formatClock(block.start)} – {formatClock(block.end)}</strong>
        <Badge tone="accent">{block.category}</Badge>
      </div>
      <div className="native-hover-meta">
        <span><Clock3 size={11} />{formatDuration(block.durationSeconds)}</span>
        <span><Layers3 size={11} />{block.items.length} {block.items.length === 1 ? "item" : "items"}</span>
      </div>
      {block.title ? <div className="native-hover-title">{block.title}</div> : null}
      <div className="native-hover-items">
        {block.items.slice(0, 4).map((item) => (
          <div key={item.id}>
            {item.url ? <Globe2 size={11} /> : <AppWindow size={11} />}
            <span>{item.appName}</span>
            <span>{formatDuration(item.durationSeconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function emptyTimeline(): ScreenTimeDeviceTimeline {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return {
    id: "empty-timeline",
    deviceName: "This device",
    devicePlatform: "",
    timeZoneIdentifier: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayStart: start.toISOString(),
    dayEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    segments: [],
    blocks: [],
  };
}

export function VerticalDay({
  timelines,
  events = [],
}: {
  timelines: ScreenTimeDeviceTimeline[];
  events?: CalendarOverlayEvent[];
}) {
  const blocks = timelines.flatMap((timeline) => timeline.blocks);
  const fallbackStart = new Date();
  fallbackStart.setHours(0, 0, 0, 0);
  const dayStart = timelines[0] ? new Date(timelines[0].dayStart) : fallbackStart;
  const dayEnd = timelines[0]
    ? new Date(timelines[0].dayEnd)
    : new Date(fallbackStart.getTime() + 24 * 60 * 60 * 1000);
  const placements = sessionBlockPlacements(blocks, dayStart, dayEnd);
  const height = VERTICAL_TIMELINE_HOUR_HEIGHT * 24;
  const now = Date.now();
  const isToday = now >= dayStart.getTime() && now < dayEnd.getTime();
  const nowY = ((now - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * height;

  return (
    <div className="vertical-day-shell">
      <div
        className="vertical-day"
        role="img"
        aria-label={`Day timeline with ${blocks.length} activity blocks and ${events.length} calendar events`}
      >
        <div className="hour-col" aria-hidden="true">
          {VERTICAL_TIMELINE_HOURS.map((hour) => <div key={hour}>{hourLabel(hour)}</div>)}
        </div>
        <div className="day-canvas" style={{ height }}>
          {isToday ? (
            <div className="calendar-now-line" style={{ top: nowY }}>
              <span>{formatClock(new Date())}</span>
            </div>
          ) : null}
          {placements.map((placement) => {
            const block = blocks.find((item) => item.id === placement.id);
            if (!block) return null;
            const blockHeight = Math.max(22, placement.heightFraction * height);
            return (
              <button
                key={placement.id}
                className="block"
                style={{
                  top: placement.yFraction * height,
                  height: blockHeight,
                  left: `${placement.xFraction * 100}%`,
                  width: `${placement.widthFraction * 100}%`,
                  background: colorForCategory(block.category),
                }}
                title={`${block.title}\n${formatDuration(block.durationSeconds)}\n${block.deviceName}`}
                onClick={() => window.stopscrolling.selectInspector({ kind: "block", block })}
              >
                <strong>{block.title}</strong>
                {blockHeight > 34 ? <span className="block-time">{formatClock(block.start)}</span> : null}
              </button>
            );
          })}
          {events.filter((event) => !event.isAllDay).map((event) => {
            const start = new Date(event.start).getTime();
            const end = new Date(event.end).getTime();
            const span = dayEnd.getTime() - dayStart.getTime();
            const y = (start - dayStart.getTime()) / span;
            const h = (end - start) / span;
            return (
              <div
                key={event.id}
                className="block cal-event"
                style={{
                  top: y * height,
                  height: Math.max(20, h * height),
                  right: 8,
                  width: 132,
                  left: "auto",
                }}
                title={`${event.title}\n${formatClock(event.start)} – ${formatClock(event.end)}`}
              >
                <strong>{event.title}</strong>
                <span className="block-time">{formatClock(event.start)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TimelineCard({ timelines }: { timelines: ScreenTimeDeviceTimeline[] }) {
  return (
    <Card className="data-card">
      <div className="data-card-header">
        <div>
          <h3 className="data-card-title">Daily rhythm</h3>
          <div className="data-card-subtitle">Activity across your visible devices</div>
        </div>
      </div>
      <TimelineGroup timelines={timelines} />
    </Card>
  );
}

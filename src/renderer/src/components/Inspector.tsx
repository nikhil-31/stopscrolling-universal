import {
  clockLabel,
  formatRemaining,
  formatWeekdays,
  remainingUntilEnd,
  scheduleDeviceLabel,
  scheduleRowKind,
  scheduleStatusLabel,
  scheduleWhen,
  WEEKDAYS,
} from "@shared/blocking";
import { formatClock, formatDuration } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { BlockingSchedule } from "@shared/types";
import { Clock3, Globe2, Laptop2, Layers3, Shield, X } from "lucide-react";
import { Badge, Button, IconButton } from "./ui";

function closeInspector() {
  window.stopscrolling.selectInspector({ kind: "none" });
}

function WeekStrip({ days }: { days: number[] }) {
  return (
    <div className="blocking-week-strip" aria-label={`Repeats ${formatWeekdays(days) || "no days"}`}>
      {WEEKDAYS.map((day) => (
        <span
          className={`blocking-week-chip ${days.includes(day.value) ? "is-on" : ""}`}
          key={day.value}
        >
          {day.label[0]}
        </span>
      ))}
    </div>
  );
}

function ScheduleInspector({
  schedule,
  onEdit,
}: {
  schedule: BlockingSchedule;
  onEdit?: (schedule: BlockingSchedule) => void;
}) {
  const now = new Date();
  const kind = scheduleRowKind(schedule, now);
  const status = scheduleStatusLabel(kind);
  const remaining = kind === "current" ? formatRemaining(remainingUntilEnd(schedule, now)) : null;

  return (
    <aside className="inspector" aria-label="Session inspector">
      <IconButton
        className="inspector-close"
        label="Close inspector"
        icon={X}
        onClick={closeInspector}
      />
      <div className="inspector-header">
        <span className="row-copy">
          <div className="inspector-kicker">Session details</div>
          <h2>{kind === "current" ? "Current Session" : schedule.name}</h2>
          <p className="muted">{kind === "current" ? schedule.name : scheduleWhen(schedule)}</p>
        </span>
        <Button type="button" size="sm" variant="primary" onClick={() => onEdit?.(schedule)}>
          Edit session
        </Button>
      </div>
      <div className="inspector-meta">
        <Badge tone={kind === "current" ? "success" : kind === "schedule" ? "accent" : "neutral"} dot={kind === "current"}>
          {status}
        </Badge>
        <Badge><Clock3 size={11} aria-hidden="true" />{clockLabel(schedule.start_time)} – {clockLabel(schedule.end_time)}</Badge>
      </div>
      <WeekStrip days={schedule.days_of_week} />
      <div className="inspector-duration">
        <span className="small muted">{kind === "current" ? "Time remaining" : "Window"}</span>
        <strong>{remaining ?? `${clockLabel(schedule.start_time)} – ${clockLabel(schedule.end_time)}`}</strong>
        <span className="small muted">{schedule.time_zone}</span>
      </div>
      <div className="inspector-kicker"><Shield size={11} aria-hidden="true" /> Blocklists</div>
      {schedule.blocklists.length ? schedule.blocklists.map((list) => (
        <div className="data-row" key={list.blocklist_id}>
          <span className="row-copy">
            <span className="row-title">{list.name}</span>
            <span className="row-subtitle">Blocklist</span>
          </span>
        </div>
      )) : <p className="muted">No blocklists</p>}
      <div className="inspector-kicker"><Laptop2 size={11} aria-hidden="true" /> Devices</div>
      {schedule.devices.length ? schedule.devices.map((device) => (
        <div className="data-row" key={device.device_id}>
          <span className="row-copy">
            <span className="row-title">{scheduleDeviceLabel(device)}</span>
            <span className="row-subtitle">{device.device_platform || "Device"}</span>
          </span>
        </div>
      )) : <p className="muted">No devices</p>}
      <p className="muted">This desktop app does not enforce blocks yet.</p>
    </aside>
  );
}

export function Inspector({
  state,
  onEditSchedule,
}: {
  state: AppSnapshot;
  onEditSchedule?: (schedule: BlockingSchedule) => void;
}) {
  if (state.inspector.kind === "none") return null;
  if (state.inspector.kind === "schedule" && state.inspector.schedule) {
    return <ScheduleInspector schedule={state.inspector.schedule} onEdit={onEditSchedule} />;
  }
  if (state.inspector.kind === "segment" && state.inspector.segment) {
    const segment = state.inspector.segment;
    const duration = (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000;
    return (
      <aside className="inspector" aria-label="Session inspector">
        <IconButton
          className="inspector-close"
          label="Close inspector"
          icon={X}
          onClick={closeInspector}
        />
        <div className="inspector-kicker">Session details</div>
        <h2>{segment.label}</h2>
        <p className="muted">{segment.appName}</p>
        <div className="inspector-meta">
          <Badge tone="accent">{segment.category}</Badge>
          <Badge><Laptop2 size={11} aria-hidden="true" />{segment.deviceName}</Badge>
          {segment.isLive ? <Badge tone="danger" dot>Live</Badge> : null}
        </div>
        <div className="inspector-duration">
          <span className="small muted">Time tracked</span>
          <strong>{formatDuration(duration)}</strong>
          <span className="small muted">
            <Clock3 size={11} aria-hidden="true" />{" "}
            {formatClock(segment.start)} – {formatClock(segment.end)}
          </span>
        </div>
        {segment.url ? (
          <div>
            <div className="inspector-kicker"><Globe2 size={11} aria-hidden="true" /> URL</div>
            <p className="inspector-url" title={segment.url}>{segment.url}</p>
          </div>
        ) : null}
      </aside>
    );
  }
  if (state.inspector.block) {
    const block = state.inspector.block;
    return (
      <aside className="inspector" aria-label="Activity block inspector">
        <IconButton
          className="inspector-close"
          label="Close inspector"
          icon={X}
          onClick={closeInspector}
        />
        <div className="inspector-kicker">Activity block</div>
        <h2>{block.title}</h2>
        <p className="muted">{block.subtitle}</p>
        <div className="inspector-meta">
          <Badge tone="accent">{block.category}</Badge>
          <Badge><Laptop2 size={11} aria-hidden="true" />{block.deviceName}</Badge>
          <Badge><Layers3 size={11} aria-hidden="true" />{block.items.length} sessions</Badge>
        </div>
        <div className="inspector-duration">
          <span className="small muted">Focused block</span>
          <strong>{formatDuration(block.durationSeconds)}</strong>
          <span className="small muted">{formatClock(block.start)} – {formatClock(block.end)}</span>
        </div>
        <div className="inspector-kicker">Activity</div>
        {block.items.map((item) => (
          <div className="data-row" key={item.id}>
            <span className="row-copy">
              <span className="row-title">{item.title}</span>
              <span className="row-subtitle">{item.appName}</span>
            </span>
            <span className="row-value">{formatDuration(item.durationSeconds)}</span>
          </div>
        ))}
      </aside>
    );
  }
  return null;
}

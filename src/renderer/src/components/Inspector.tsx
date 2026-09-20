import { useState } from "react";
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
import { displayNameForDevice } from "@shared/device";
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
  state,
  onEdit,
}: {
  schedule: BlockingSchedule;
  state: AppSnapshot;
  onEdit?: (schedule: BlockingSchedule) => void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const now = new Date();
  const kind = scheduleRowKind(schedule, now);
  const status = scheduleStatusLabel(kind);
  const remaining = kind === "current" ? formatRemaining(remainingUntilEnd(schedule, now)) : null;
  const occurrence = state.blocking?.activeOccurrence?.schedule_id === schedule.schedule_id
    ? state.blocking.activeOccurrence
    : null;
  const strictActive = Boolean(
    occurrence
    && state.blocking?.enforcement?.strictOccurrenceIDs?.includes(occurrence.occurrence_id),
  );

  async function endSession() {
    if (!occurrence || strictActive) return;
    setEnding(true);
    setActionError(null);
    try {
      await window.stopscrolling.cancelNormalSession({
        scheduleID: schedule.schedule_id,
        occurrenceID: occurrence.occurrence_id,
      });
      closeInspector();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not end this session.");
    } finally {
      setEnding(false);
    }
  }

  function deleteSession() {
    if (strictActive) return;
    window.stopscrolling.deleteBlockingSchedule(schedule.schedule_id);
    closeInspector();
  }

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
        <div className="inspector-actions">
          {occurrence ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={strictActive || ending}
              title={strictActive ? "Active Strict Mode sessions cannot be ended." : undefined}
              onClick={() => void endSession()}
            >
              {ending ? "Ending…" : "End session"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={strictActive}
            title={strictActive ? "Active Strict Mode sessions cannot be edited." : undefined}
            onClick={() => onEdit?.(schedule)}
          >
            Edit session
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={strictActive}
            title={strictActive ? "Active Strict Mode sessions cannot be deleted." : undefined}
            onClick={deleteSession}
          >
            Delete session
          </Button>
        </div>
      </div>
      <div className="inspector-meta">
        <Badge tone={kind === "current" ? "success" : kind === "schedule" ? "accent" : "neutral"} dot={kind === "current"}>
          {status}
        </Badge>
        {strictActive ? <Badge tone="danger">Strict Mode locked</Badge> : null}
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
      {strictActive ? (
        <p className="muted">This active Strict Mode session cannot be ended, edited, or deleted until it finishes.</p>
      ) : null}
      {actionError ? <p className="muted" role="alert">{actionError}</p> : null}
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
    return <ScheduleInspector schedule={state.inspector.schedule} state={state} onEdit={onEditSchedule} />;
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
          <Badge><Laptop2 size={11} aria-hidden="true" />{displayNameForDevice(segment.devicePlatform, segment.deviceName, state.devices)}</Badge>
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
          <Badge><Laptop2 size={11} aria-hidden="true" />{displayNameForDevice(block.devicePlatform, block.deviceName, state.devices)}</Badge>
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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  clockLabel,
  formatRemaining,
  formatWeekdays,
  remainingUntilEnd,
  scheduleDeviceLabel,
  scheduleRowKind,
  scheduleStatusLabel,
  WEEKDAYS,
} from "@shared/blocking";
import { formatFullDate } from "@shared/calendar-workspace";
import { appShareBarPercent, blockItemShareLabel, continuousActivityEvents, cumulativeActivityTotals, formatClock, formatDuration, formatTrackedDuration, percentLabel } from "@shared/timeline";
import { displayNameForDevice } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import type { BlockingSchedule, ScreenTimeSessionBlock } from "@shared/types";
import { Clock3, Globe2, Laptop2, Shield, X } from "lucide-react";
import { useClockFormat } from "../clock-format";
import { useSessionTitle } from "../session-title";
import { SessionModal, SessionModalBody } from "./blocking/SessionModal";
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

function sessionScreenOverride(
  screen: { imageFile: string; header: string; detail: string; imageUrl: string } | undefined,
) {
  if (!screen) return null;
  if (!screen.imageFile && !screen.header.trim() && !screen.detail.trim()) return null;
  return screen;
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
  const [blockScreen, setBlockScreen] = useState<
    { imageFile: string; header: string; detail: string; imageUrl: string } | "builtin" | null
  >(null);
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
  const windowLabel = `${clockLabel(schedule.start_time)} – ${clockLabel(schedule.end_time)}`;
  const statusLine = kind === "current" ? `${status} · ${schedule.name}` : status;

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.getElementById("session-edit-title")) return;
      event.preventDefault();
      closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const load = window.stopscrolling.getBlockScreens;
    if (!load) {
      setBlockScreen("builtin");
      return;
    }
    let cancelled = false;
    setBlockScreen(null);
    void load().then((screens) => {
      if (cancelled) return;
      setBlockScreen(sessionScreenOverride(screens.sessions[schedule.schedule_id]) ?? "builtin");
    }).catch(() => {
      if (!cancelled) setBlockScreen("builtin");
    });
    return () => {
      cancelled = true;
    };
  }, [schedule.schedule_id]);

  return (
    <SessionModal
      title={schedule.name}
      titleId="session-details-title"
      subtitle={statusLine}
      closeLabel="Close session details"
      onClose={closeInspector}
      footer={(
        <>
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
          <div className="blocking-modal-footer-end">
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
          </div>
        </>
      )}
    >
      <SessionModalBody>
        {strictActive ? (
          <p className="blocking-modal-notice" role="status">
            This active Strict Mode session cannot be ended, edited, or deleted until it finishes.
          </p>
        ) : null}
        {actionError ? <p className="blocking-modal-notice" role="alert">{actionError}</p> : null}
        <div className="blocking-session-summary">
          <span className="small muted">{kind === "current" ? "Time remaining" : "Window"}</span>
          <strong>{remaining ?? windowLabel}</strong>
          <span className="small muted">{schedule.time_zone}</span>
          <WeekStrip days={schedule.days_of_week} />
        </div>
        <section className="blocking-modal-section" aria-label="Block screen">
          <h3>Block screen</h3>
          {blockScreen && blockScreen !== "builtin" ? (
            <div className="block-screen-preview">
              {blockScreen.imageUrl ? <img src={blockScreen.imageUrl} alt="" /> : <span className="block-screen-preview-mark" />}
              <strong>{blockScreen.header.trim() || "You are free."}</strong>
              <span>{blockScreen.detail.trim() || "Do what matters."}</span>
              <em>Stop Scrolling</em>
            </div>
          ) : blockScreen === "builtin" ? (
            <p className="muted">Using the built-in screen.</p>
          ) : null}
        </section>
        <section className="blocking-modal-section" aria-label="Blocklists">
          <h3>Blocklists</h3>
          {schedule.blocklists.length ? (
            <div>
              {schedule.blocklists.map((list) => {
                const known = state.blocking?.blocklists.find((item) => item.blocklist_id === list.blocklist_id);
                const count = known?.entry_count;
                return (
                  <div className="data-row" key={list.blocklist_id}>
                    <span className="blocking-list-icon"><Shield size={14} aria-hidden="true" /></span>
                    <span className="row-copy">
                      <span className="row-title">{list.name}</span>
                      {count == null ? null : (
                        <span className="row-subtitle">{count} {count === 1 ? "entry" : "entries"}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">No blocklists</p>}
        </section>
        <section className="blocking-modal-section" aria-label="Devices">
          <h3>Devices</h3>
          {schedule.devices.length ? (
            <div>
              {schedule.devices.map((device) => (
                <div className="data-row" key={device.device_id}>
                  <span className="blocking-list-icon"><Laptop2 size={14} aria-hidden="true" /></span>
                  <span className="row-copy">
                    <span className="row-title">{scheduleDeviceLabel(device)}</span>
                    <span className="row-subtitle">{device.device_platform || "Device"}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="muted">No devices</p>}
        </section>
      </SessionModalBody>
    </SessionModal>
  );
}

function SessionDetailsModal({
  block,
  devices,
}: {
  block: ScreenTimeSessionBlock;
  devices: AppSnapshot["devices"];
}) {
  const clockFormat = useClockFormat();
  const title = useSessionTitle()(block);
  const events = continuousActivityEvents(block);
  const totals = cumulativeActivityTotals(block);
  const totalSeconds = totals.reduce((sum, item) => sum + item.seconds, 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="calendar-dialog-scrim" onClick={closeInspector}>
      <div
        className="calendar-dialog session-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <IconButton
          className="calendar-dialog-close"
          label="Close session details"
          icon={X}
          onClick={closeInspector}
        />
        <div className="inspector-kicker">Session details</div>
        <h2 id="session-details-title">{title}</h2>
        <div className="inspector-meta">
          <Badge tone="accent">{block.category}</Badge>
          <Badge><Laptop2 size={11} aria-hidden="true" />{displayNameForDevice(block.devicePlatform, block.deviceName, devices)}</Badge>
        </div>
        <div className="inspector-duration session-details-summary">
          <span className="small muted">Tracked</span>
          <strong>{formatDuration(totalSeconds)}</strong>
          <span className="small muted">
            {formatFullDate(new Date(block.start))} · {formatClock(block.start, clockFormat)} – {formatClock(block.end, clockFormat)}
          </span>
        </div>
        {totals.length ? (
          <section aria-label="Apps and websites">
            <div className="inspector-kicker">Apps & websites</div>
            <div className="activity-app-list session-details-totals">
              {totals.map((item) => {
                const share = totalSeconds > 0 ? item.seconds / totalSeconds : 0;
                return (
                  <div className="activity-app-row" key={item.key}>
                    <div className="activity-app-main">
                      <span className="activity-app-pct">{percentLabel(share)}</span>
                      <span className="activity-app-bar" aria-hidden="true">
                        <span style={{ width: `${appShareBarPercent(share)}%` }} />
                      </span>
                      <span className="activity-app-name">{item.name}</span>
                      <span className="activity-app-time">{formatTrackedDuration(item.seconds)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        <section aria-label="Activity">
          <div className="inspector-kicker">Activity · {events.length}</div>
          {events.map((item) => (
            <div className="data-row" key={item.id}>
              <span className="row-copy">
                <span className="row-title">{item.title}</span>
                <span className="row-subtitle">
                  {formatClock(item.start, clockFormat)} – {formatClock(item.end, clockFormat)}
                  {item.appName ? ` · ${item.appName}` : ""}
                </span>
              </span>
              <span className="row-value">
                {formatTrackedDuration(item.durationSeconds)} · {blockItemShareLabel(item.durationSeconds, block.durationSeconds)}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export function Inspector({
  state,
  onEditSchedule,
}: {
  state: AppSnapshot;
  onEditSchedule?: (schedule: BlockingSchedule) => void;
}) {
  const clockFormat = useClockFormat();
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
            {formatClock(segment.start, clockFormat)} – {formatClock(segment.end, clockFormat)}
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
  if (state.inspector.kind === "block" && state.inspector.block) {
    return <SessionDetailsModal block={state.inspector.block} devices={state.devices} />;
  }
  return null;
}

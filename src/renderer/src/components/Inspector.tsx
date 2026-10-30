import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  clockLabel,
  formatRemaining,
  remainingUntilEnd,
  scheduleDeviceLabel,
  scheduleRowKind,
  scheduleStatusLabel,
} from "@shared/blocking";
import { formatFullDate } from "@shared/calendar-workspace";
import {
  appShareBarPercent,
  blockItemShareLabel,
  colorForCategory,
  continuousActivityEvents,
  cumulativeActivityTotals,
  formatClock,
  formatDuration,
  formatTrackedDuration,
  itemBreakdownKey,
  percentLabel,
} from "@shared/timeline";
import { displayNameForDevice } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import type { BlockingSchedule, ScreenTimeSessionBlock, ScreenTimeTimelineSegment } from "@shared/types";
import { Check, Clock3, Copy, ExternalLink, Globe2, Laptop2, Shield, X } from "lucide-react";
import { useClockFormat } from "../clock-format";
import { useSessionTitle } from "../session-title";
import { SessionModal, SessionModalBody } from "./blocking/SessionModal";
import { WeekStrip } from "./blocking/WeekStrip";
import { Badge, Button, IconButton } from "./ui";

function closeInspector() {
  window.stopscrolling.selectInspector({ kind: "none" });
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

function useEscapeToClose() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Shared frame for a tracked session: fixed header with the close button, scrolling body. */
function SessionDialog({
  title,
  subtitle,
  meta,
  children,
}: {
  title: string;
  subtitle?: string;
  meta: ReactNode;
  children: ReactNode;
}) {
  useEscapeToClose();
  return (
    <div className="calendar-dialog-scrim" onClick={closeInspector}>
      <div
        className="calendar-dialog session-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="session-details-head">
          <div className="inspector-kicker">Session details</div>
          <h2 id="session-details-title">{title}</h2>
          {subtitle ? <p className="session-details-subtitle">{subtitle}</p> : null}
          <div className="inspector-meta">{meta}</div>
          <IconButton
            className="calendar-dialog-close"
            label="Close session details"
            icon={X}
            onClick={closeInspector}
          />
        </header>
        <div className="session-details-body">{children}</div>
      </div>
    </div>
  );
}

function SessionSummary({ seconds, start, end }: { seconds: number; start: string; end: string }) {
  const clockFormat = useClockFormat();
  return (
    <div className="session-details-summary">
      <div className="session-details-stat">
        <span className="small muted">Tracked</span>
        <strong>{formatDuration(seconds)}</strong>
      </div>
      <span className="session-details-when">
        <Clock3 size={12} aria-hidden="true" />
        <span>{formatFullDate(new Date(start))} · {formatClock(start, clockFormat)} – {formatClock(end, clockFormat)}</span>
      </span>
    </div>
  );
}

const VERDICT_TONES = { Productive: "success", Neutral: "neutral", Distracting: "warning" } as const;

function VerdictBadge({ verdict }: { verdict: ScreenTimeTimelineSegment["verdict"] }) {
  if (!verdict || verdict === "Unrated") return null;
  return <Badge tone={VERDICT_TONES[verdict]} dot>{verdict}</Badge>;
}

/** Each slice of the session laid out on its own clock, colored by category. */
function SessionStrip({ block }: { block: ScreenTimeSessionBlock }) {
  const clockFormat = useClockFormat();
  const start = Date.parse(block.start);
  const span = Math.max(1, Date.parse(block.end) - start);
  return (
    <div className="session-strip-wrap">
      <div className="session-strip" aria-hidden="true">
        {block.items.map((item) => {
          const left = ((Date.parse(item.start) - start) / span) * 100;
          const width = ((Date.parse(item.end) - Date.parse(item.start)) / span) * 100;
          return (
            <span
              key={item.id}
              className="session-strip-slice"
              title={`${item.title} · ${formatTrackedDuration(item.durationSeconds)}`}
              style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0.6, width)}%`, background: colorForCategory(item.category) }}
            />
          );
        })}
      </div>
      <div className="session-strip-axis" aria-hidden="true">
        <span>{formatClock(block.start, clockFormat)}</span>
        <span>{formatClock(block.end, clockFormat)}</span>
      </div>
    </div>
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
  const categoryByKey = new Map(block.items.map((item) => [itemBreakdownKey(item), item.category]));
  const categoryById = new Map(block.items.map((item) => [item.id, item.category]));

  return (
    <SessionDialog
      title={title}
      meta={(
        <>
          <Badge tone="accent">{block.category}</Badge>
          <Badge><Laptop2 size={11} aria-hidden="true" />{displayNameForDevice(block.devicePlatform, block.deviceName, devices)}</Badge>
        </>
      )}
    >
      <SessionSummary seconds={totalSeconds} start={block.start} end={block.end} />
      {block.items.length ? <SessionStrip block={block} /> : null}
      {totals.length ? (
        <section className="session-details-section" aria-label="Apps and websites">
          <div className="inspector-kicker">Apps & websites</div>
          <div className="activity-app-list session-details-totals">
            {totals.map((item) => {
              const share = totalSeconds > 0 ? item.seconds / totalSeconds : 0;
              return (
                <div className="activity-app-row" key={item.key}>
                  <div
                    className="activity-app-main"
                    style={{ "--bar-color": colorForCategory(categoryByKey.get(item.key) ?? "") } as CSSProperties}
                  >
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
      <section className="session-details-section" aria-label="Activity">
        <div className="inspector-kicker">Activity · {events.length}</div>
        <ol className="session-activity">
          {events.map((item) => (
            <li className="session-activity-row" key={item.id}>
              <span
                className="session-activity-dot"
                aria-hidden="true"
                style={{ background: colorForCategory(categoryById.get(item.id.split(":")[0]) ?? "") }}
              />
              <span className="row-copy">
                <span className="row-title">{item.title}</span>
                <span className="row-subtitle">
                  {formatClock(item.start, clockFormat)} – {formatClock(item.end, clockFormat)}
                  {item.appName && item.appName !== item.title ? ` · ${item.appName}` : ""}
                </span>
              </span>
              <span className="row-value">
                {formatTrackedDuration(item.durationSeconds)} · {blockItemShareLabel(item.durationSeconds, block.durationSeconds)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </SessionDialog>
  );
}

function SegmentDetailsModal({
  segment,
  devices,
}: {
  segment: ScreenTimeTimelineSegment;
  devices: AppSnapshot["devices"];
}) {
  const [copied, setCopied] = useState(false);
  const seconds = (Date.parse(segment.end) - Date.parse(segment.start)) / 1000;
  const pageTitle = segment.subtitle && segment.subtitle !== segment.label ? segment.subtitle : "";

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(segment.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the URL stays selectable.
    }
  }

  return (
    <SessionDialog
      title={segment.label}
      subtitle={pageTitle || undefined}
      meta={(
        <>
          <Badge tone="accent">{segment.category}</Badge>
          <VerdictBadge verdict={segment.verdict} />
          <Badge><Laptop2 size={11} aria-hidden="true" />{displayNameForDevice(segment.devicePlatform, segment.deviceName, devices)}</Badge>
          {segment.isLive ? <Badge tone="danger" dot>Live</Badge> : null}
        </>
      )}
    >
      <SessionSummary seconds={seconds} start={segment.start} end={segment.end} />
      <dl className="session-details-facts">
        {segment.appName ? (
          <div>
            <dt>App</dt>
            <dd>{segment.appName}</dd>
          </div>
        ) : null}
        {segment.url ? (
          <div>
            <dt><Globe2 size={11} aria-hidden="true" /> URL</dt>
            <dd className="session-details-url">
              <span className="inspector-url" title={segment.url}>{segment.url}</span>
              <span className="session-details-url-actions">
                <IconButton label={copied ? "Copied" : "Copy URL"} icon={copied ? Check : Copy} onClick={() => void copyUrl()} />
                <IconButton label="Open in browser" icon={ExternalLink} onClick={() => window.stopscrolling.openUrl(segment.url)} />
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </SessionDialog>
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
    return <SegmentDetailsModal segment={state.inspector.segment} devices={state.devices} />;
  }
  if (state.inspector.kind === "block" && state.inspector.block) {
    return <SessionDetailsModal block={state.inspector.block} devices={state.devices} />;
  }
  return null;
}

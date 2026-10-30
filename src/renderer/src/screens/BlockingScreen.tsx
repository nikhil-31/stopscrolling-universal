import { useEffect, useState } from "react";
import { applicationIconForIdentifier } from "@shared/application-icons";
import {
  emptySessionDraft,
  isAlwaysActive,
  nextScheduleStart,
  parseMinutes,
  remainingUntilEnd,
  scheduleDeviceLabel,
  scheduleRowKind,
} from "@shared/blocking";
import type { AppSnapshot } from "@shared/snapshot";
import type {
  Blocklist,
  BlockingSchedule,
  ClockFormat,
  DeviceListEntry,
  InstalledApplication,
} from "@shared/types";
import { BlocklistComposer } from "../components/blocking/BlocklistComposer";
import { BlocklistDetailDialog } from "../components/blocking/BlocklistDetailDialog";
import { SessionComposer } from "../components/blocking/SessionComposer";
import { SessionEditDialog } from "../components/blocking/SessionEditDialog";
import { SessionModal } from "../components/blocking/SessionModal";
import { WeekStrip } from "../components/blocking/WeekStrip";
import { AppIcon } from "../components/AppIcon";
import { formatClock } from "@shared/timeline";
import { useClockFormat } from "../clock-format";
import { useNow } from "../hooks/useNow";
import {
  AppWindow,
  Globe2,
  Lock,
  Plus,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Grouped,
  IconButton,
  LoadingState,
} from "../components/ui";

const PREVIEW_ICONS = 4;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function compactRemaining(totalMinutes: number) {
  const minutes = Math.max(0, Math.ceil(totalMinutes));
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function minutesBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 60_000;
}

function scheduleRange(schedule: BlockingSchedule, format: ClockFormat) {
  if (isAlwaysActive(schedule)) return "All day";
  const time = (value: string) => formatClock(new Date(2000, 0, 1, 0, parseMinutes(value)), format);
  return `${time(schedule.start_time)} – ${time(schedule.end_time)}`;
}

function startLabel(at: Date, now: Date, format: ClockFormat) {
  const time = formatClock(at, format);
  const days = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
      - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000,
  );
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(at)} at ${time}`;
}

function BlocklistPreview({
  blocklist,
  applications,
}: {
  blocklist: Blocklist;
  applications: InstalledApplication[];
}) {
  const shown = blocklist.entries.slice(0, PREVIEW_ICONS);
  const more = blocklist.entry_count - shown.length;
  return (
    <span className="blocking-list-preview" aria-hidden="true">
      {shown.map((entry) => {
        const Icon = entry.entry_type === "website" ? Globe2 : AppWindow;
        const iconUrl = entry.entry_type === "app"
          ? applicationIconForIdentifier(entry.identifier, applications)
          : null;
        return (
          <span className="blocking-list-preview-icon" key={entry.entry_id} title={entry.label || entry.identifier}>
            <AppIcon iconUrl={iconUrl} fallback={<Icon size={12} />} />
          </span>
        );
      })}
      {more > 0 ? <span className="blocking-list-preview-more">+{more}</span> : null}
    </span>
  );
}

export function BlockingScreen({
  state,
  editingSchedule = null,
  onCloseEdit,
}: {
  state: AppSnapshot;
  editingSchedule?: BlockingSchedule | null;
  onCloseEdit?: () => void;
}) {
  const clockFormat = useClockFormat();
  const now = useNow();
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateBlocklist, setShowCreateBlocklist] = useState(false);
  const [selectedBlocklist, setSelectedBlocklist] = useState<Blocklist | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const blocking = state.blocking ?? { schedules: [], blocklists: [], statusMessage: "", loading: false };
  const registeredDevices = (state.devices ?? []).filter(
    (device): device is DeviceListEntry & { deviceID: string } => Boolean(device.deviceID),
  );
  const occurrence = blocking.activeOccurrence ?? null;
  const strictActive = Boolean(
    occurrence
    && blocking.enforcement?.strictOccurrenceIDs?.includes(occurrence.occurrence_id),
  );
  const activeSchedule = occurrence
    ? blocking.schedules.find((schedule) => schedule.schedule_id === occurrence.schedule_id) ?? null
    : null;
  const strictBlocklistIds = new Set(
    strictActive ? activeSchedule?.blocklists.map((list) => list.blocklist_id) ?? [] : [],
  );
  const enforcement = blocking.enforcement;
  const capabilities = blocking.capabilities;
  const helperReady = Boolean(blocking.hostSetup?.helperRegistered);
  const enforcementHealthy = Boolean(enforcement?.available && enforcement.connected && !enforcement.lastError);
  const enforcementTone = !enforcement?.available ? "danger" : "warning";
  const enforcementLabel = !enforcement?.available
    ? "Blocking helper unavailable"
    : "Blocking enforcement degraded";
  const helperPill = occurrence ? "Enforced" : helperReady ? "Helper ready" : "Ready";
  const inventoryUnavailableReason = capabilities?.applicationInventory === false
    ? capabilities.reason || "The blocking helper does not provide application inventory."
    : null;
  const installedApplications = blocking.installedApplications ?? [];
  const loadError = blocking.loadError || null;
  const failedLists = new Set(loadError ? blocking.failedLists ?? [] : []);
  const sessionsUnavailable = failedLists.has("schedules") && !blocking.schedules.length;

  function isRunning(schedule: BlockingSchedule) {
    if (occurrence) return schedule.schedule_id === occurrence.schedule_id;
    return scheduleRowKind(schedule, now) === "current";
  }

  function minutesLeft(schedule: BlockingSchedule) {
    if (occurrence?.schedule_id === schedule.schedule_id) return minutesBetween(now, new Date(occurrence.end_at));
    return remainingUntilEnd(schedule, now);
  }

  const rank = (schedule: BlockingSchedule) => (isRunning(schedule) ? 0 : schedule.is_active ? 1 : 2);
  const schedules = [...blocking.schedules].sort((a, b) => rank(a) - rank(b));
  const next = occurrence ? null : nextScheduleStart(blocking.schedules, now);

  async function deleteSession(schedule: BlockingSchedule) {
    if (strictActive && schedule.schedule_id === occurrence?.schedule_id) return;
    window.stopscrolling.deleteBlockingSchedule(schedule.schedule_id);
    if (editingSchedule?.schedule_id === schedule.schedule_id) onCloseEdit?.();
  }

  async function refreshInventory() {
    setInventoryLoading(true);
    try {
      await window.stopscrolling.refreshBlockingInventory();
    } finally {
      setInventoryLoading(false);
    }
  }

  useEffect(() => {
    if (!showCreateSession && !showCreateBlocklist) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setShowCreateSession(false);
      setShowCreateBlocklist(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreateSession, showCreateBlocklist]);

  useEffect(() => {
    setSelectedBlocklist((current) => {
      if (!current) return null;
      return blocking.blocklists.find((list) => list.blocklist_id === current.blocklist_id) ?? null;
    });
  }, [blocking.blocklists]);

  if (!state.isAuthenticated) {
    return (
      <EmptyState
        title="Sessions need an account"
        body="Sign in to create blocklists and blocking sessions that sync across your devices."
        icon={ShieldOff}
        action={<Button variant="primary" onClick={() => window.stopscrolling.navigate("account")}>Go to account</Button>}
      />
    );
  }

  const occurrenceStart = occurrence ? new Date(occurrence.start_at) : null;
  const occurrenceEnd = occurrence ? new Date(occurrence.end_at) : null;
  const progress = occurrenceStart && occurrenceEnd
    ? Math.min(100, Math.max(0, (minutesBetween(occurrenceStart, now) / Math.max(1, minutesBetween(occurrenceStart, occurrenceEnd))) * 100))
    : 0;

  return (
    <div className="blocking-page" data-testid="blocking-page">
      {loadError ? (
        <Banner
          tone="danger"
          action={<Button size="sm" onClick={() => void window.stopscrolling.refreshBlocking()}>Retry</Button>}
        >
          <strong>Couldn’t load your sessions.</strong> {loadError}
        </Banner>
      ) : null}
      {!enforcementHealthy ? (
        <Banner tone={enforcementTone}>
          <strong>{enforcementLabel}.</strong>{" "}
          {enforcement?.lastError || capabilities?.reason || "Sessions can’t block sites and apps on this device until the helper is running."}
        </Banner>
      ) : null}

      <section
        className={`blocking-hero ${occurrence ? "is-running" : ""}`}
        aria-label="Blocking status"
        data-testid="blocking-hero"
      >
        <div className="blocking-hero-main">
          <div className="blocking-hero-kicker">
            <span className="blocking-hero-icon">
              {occurrence ? <ShieldCheck size={15} aria-hidden="true" /> : <Shield size={15} aria-hidden="true" />}
            </span>
            {occurrence ? "Blocking now" : "Not blocking"}
            {enforcementHealthy ? <Badge tone={occurrence ? "success" : "neutral"} dot>{helperPill}</Badge> : null}
          </div>
          <h2 className="blocking-hero-title">
            {occurrence
              ? occurrence.schedule_name
              : sessionsUnavailable ? "Session status unavailable" : "Nothing is blocked right now"}
          </h2>
          <p className="blocking-hero-detail">
            {occurrence && occurrenceEnd ? (
              <>
                <span>Until {formatClock(occurrenceEnd, clockFormat)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {occurrence.entries.length === 1
                    ? "1 site or app blocked"
                    : `${occurrence.entries.length} sites and apps blocked`}
                </span>
                {strictActive ? (
                  <Badge tone="warning"><Lock size={11} aria-hidden="true" />Strict Mode</Badge>
                ) : null}
              </>
            ) : sessionsUnavailable ? (
              <span>Your sessions couldn’t be loaded from your account.</span>
            ) : next ? (
              <span>Next: {next.schedule.name} starts {startLabel(next.at, now, clockFormat)}</span>
            ) : (
              <span>
                {blocking.schedules.length
                  ? "No sessions are scheduled this week."
                  : "Schedule a session to block distracting sites and apps."}
              </span>
            )}
          </p>
        </div>
        {occurrence && occurrenceEnd ? (
          <div className="blocking-hero-countdown">
            <strong>{compactRemaining(minutesBetween(now, occurrenceEnd))}</strong>
            <span>left</span>
          </div>
        ) : next ? (
          <div className="blocking-hero-countdown">
            <strong>{compactRemaining(minutesBetween(now, next.at))}</strong>
            <span>until next</span>
          </div>
        ) : null}
        {occurrence ? (
          <div
            className="blocking-progress"
            role="progressbar"
            aria-label="Session progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </section>

      {blocking.statusMessage ? <p className="muted">{blocking.statusMessage}</p> : null}
      <div className="blocking-layout">
        <Grouped
          title="Sessions"
          description="When to block, synced from your account"
          action={(
            <Button
              size="sm"
              icon={Plus}
              onClick={() => {
                setCreateError(null);
                setShowCreateSession(true);
              }}
            >
              Add Session
            </Button>
          )}
        >
          <div className="blocking-session-list">
            {blocking.loading && !schedules.length ? <LoadingState label="Loading sessions…" /> : null}
            {!blocking.loading && !schedules.length && !failedLists.has("schedules") ? (
              <EmptyState
                title="No sessions yet"
                icon={Shield}
                body={blocking.blocklists.length
                  ? "Add a session to block your lists on a schedule."
                  : "Create a blocklist first, then schedule a session to block it."}
              />
            ) : null}
            {schedules.map((schedule) => {
              const running = isRunning(schedule);
              const selected = state.inspector.kind === "schedule"
                && state.inspector.schedule?.schedule_id === schedule.schedule_id;
              const locked = strictActive && schedule.schedule_id === occurrence?.schedule_id;
              const paused = !schedule.is_active;
              const deviceCount = schedule.devices.length;
              return (
                <div
                  key={schedule.schedule_id}
                  className={[
                    "blocking-session-row",
                    running && "is-running",
                    selected && "is-selected",
                    paused && "is-paused",
                  ].filter(Boolean).join(" ")}
                >
                  <button
                    type="button"
                    className="blocking-session"
                    aria-pressed={selected}
                    aria-label={`${schedule.name} session`}
                    onClick={() => window.stopscrolling.selectInspector({ kind: "schedule", schedule })}
                  >
                    <span className="blocking-session-main">
                      <span className="blocking-session-heading">
                        <span className="blocking-session-title">{schedule.name}</span>
                        {running ? <Badge tone="success" dot>Running</Badge> : null}
                        {paused ? <Badge>Paused</Badge> : null}
                        {schedule.strict_mode ? (
                          <Badge tone="warning"><Lock size={11} aria-hidden="true" />Strict</Badge>
                        ) : null}
                      </span>
                      <span className="blocking-session-when">
                        <WeekStrip days={schedule.days_of_week} />
                        <span>{scheduleRange(schedule, clockFormat)}</span>
                      </span>
                      <span className="blocking-session-meta">
                        {schedule.blocklists.length
                          ? schedule.blocklists.map((list) => (
                            <span className="blocking-chip" key={list.blocklist_id}>{list.name}</span>
                          ))
                          : <span>No blocklists</span>}
                        {deviceCount ? (
                          <span title={schedule.devices.map(scheduleDeviceLabel).join(", ")}>
                            · {plural(deviceCount, "device")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {running ? (
                      <span className="blocking-session-countdown">{compactRemaining(minutesLeft(schedule))} left</span>
                    ) : null}
                  </button>
                  <IconButton
                    label={`Delete ${schedule.name}`}
                    icon={Trash2}
                    disabled={locked}
                    title={locked ? "Active Strict Mode sessions cannot be deleted." : `Delete ${schedule.name}`}
                    onClick={() => deleteSession(schedule)}
                  />
                </div>
              );
            })}
          </div>
        </Grouped>

        <Grouped
          title="Blocklists"
          description="Apps and sites a session can block"
          action={(
            <Button
              size="sm"
              icon={Plus}
              onClick={() => {
                setShowCreateBlocklist(true);
                void refreshInventory();
              }}
            >
              Add Blocklist
            </Button>
          )}
        >
          {blocking.loading && !blocking.blocklists.length ? <LoadingState label="Loading blocklists…" /> : null}
          {!blocking.loading && !blocking.blocklists.length && !failedLists.has("blocklists") ? (
            <EmptyState title="No blocklists" body="Create a blocklist with websites and apps to use in sessions." />
          ) : null}
          {blocking.blocklists.map((list) => {
            const websites = list.entries.filter((entry) => entry.entry_type === "website").length;
            const apps = list.entries.length - websites;
            const usedBy = blocking.schedules
              .filter((schedule) => schedule.blocklists.some((ref) => ref.blocklist_id === list.blocklist_id))
              .map((schedule) => schedule.name);
            const locked = strictBlocklistIds.has(list.blocklist_id);
            return (
              <button
                type="button"
                className="blocking-list-row"
                key={list.blocklist_id}
                onClick={() => {
                  setSelectedBlocklist(list);
                  void refreshInventory();
                }}
              >
                <span className="blocking-list-icon">
                  {locked ? <Lock size={14} aria-hidden="true" /> : <Shield size={14} aria-hidden="true" />}
                </span>
                <span className="row-copy">
                  <span className="row-title">{list.name}</span>
                  <span className="row-subtitle">
                    {[
                      websites ? plural(websites, "website") : "",
                      apps ? plural(apps, "app") : "",
                    ].filter(Boolean).join(" · ") || "Empty"}
                    {" · "}
                    {usedBy.length ? `Used by ${usedBy.join(", ")}` : "Not in a session"}
                  </span>
                </span>
                <BlocklistPreview blocklist={list} applications={installedApplications} />
              </button>
            );
          })}
        </Grouped>
      </div>
      {selectedBlocklist ? (
        <BlocklistDetailDialog
          blocklist={selectedBlocklist}
          loading={blocking.loading}
          installedApplications={blocking.installedApplications}
          inventoryLoading={inventoryLoading}
          inventoryUnavailableReason={inventoryUnavailableReason}
          onRefreshInventory={() => void refreshInventory()}
          editingDisabledReason={strictBlocklistIds.has(selectedBlocklist.blocklist_id)
            ? "This blocklist cannot be edited while its Strict Mode session is active."
            : undefined}
          onClose={() => setSelectedBlocklist(null)}
        />
      ) : null}
      {editingSchedule && !(strictActive && editingSchedule.schedule_id === occurrence?.schedule_id) ? (
        <SessionEditDialog
          schedule={editingSchedule}
          blocklists={blocking.blocklists}
          devices={registeredDevices}
          loading={blocking.loading}
          onClose={() => onCloseEdit?.()}
        />
      ) : null}
      {showCreateBlocklist ? (
        <SessionModal
          title="New blocklist"
          titleId="blocklist-create-title"
          subtitle="Choose the websites and apps a session can block."
          closeLabel="Close new blocklist"
          onClose={() => setShowCreateBlocklist(false)}
          size="form"
        >
          <BlocklistComposer
            submitLabel="Create blocklist"
            loading={blocking.loading}
            installedApplications={blocking.installedApplications}
            inventoryLoading={inventoryLoading}
            inventoryUnavailableReason={inventoryUnavailableReason}
            onRefreshInventory={() => void refreshInventory()}
            onCancel={() => setShowCreateBlocklist(false)}
            onSubmit={(payload) => {
              window.stopscrolling.createBlocklist(payload);
              setShowCreateBlocklist(false);
            }}
          />
        </SessionModal>
      ) : null}
      {showCreateSession ? (
        <SessionModal
          title="New session"
          titleId="session-create-title"
          subtitle="Choose when to block, what to block, and the screen you see."
          closeLabel="Close new session"
          onClose={() => setShowCreateSession(false)}
          size="form"
        >
          <SessionComposer
            initialDraft={emptySessionDraft(state.auth?.user?.time_zone)}
            blocklists={blocking.blocklists}
            devices={registeredDevices}
            loading={blocking.loading}
            submitLabel="Create blocking session"
            submitError={createError}
            onCancel={() => setShowCreateSession(false)}
            onSubmit={(payload, blockScreen) => {
              setCreateError(null);
              void window.stopscrolling.createBlockingSchedule(payload).then(async (result) => {
                if (!result.ok) {
                  setCreateError(result.message);
                  return;
                }
                if (result.scheduleId && (blockScreen.header.trim() || blockScreen.detail.trim() || blockScreen.imageFile)) {
                  await window.stopscrolling.saveSessionBlockScreen({
                    scheduleId: result.scheduleId,
                    header: blockScreen.header,
                    detail: blockScreen.detail,
                    imageFile: blockScreen.imageFile,
                  });
                }
                setShowCreateSession(false);
              });
            }}
          />
        </SessionModal>
      ) : null}
    </div>
  );
}

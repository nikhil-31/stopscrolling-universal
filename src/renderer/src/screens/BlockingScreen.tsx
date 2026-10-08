import { useEffect, useMemo, useState } from "react";
import {
  emptySessionDraft,
  formatRemaining,
  remainingUntilEnd,
  scheduleRowKind,
  scheduleWhen,
} from "@shared/blocking";
import type { AppSnapshot } from "@shared/snapshot";
import type { Blocklist, BlockingSchedule, DeviceListEntry } from "@shared/types";
import { BlocklistComposer } from "../components/blocking/BlocklistComposer";
import { BlocklistDetailDialog } from "../components/blocking/BlocklistDetailDialog";
import { SessionComposer } from "../components/blocking/SessionComposer";
import { SessionEditDialog } from "../components/blocking/SessionEditDialog";
import { formatClock } from "@shared/timeline";
import { useClockFormat } from "../clock-format";
import {
  Plus,
  Shield,
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
  Tabs,
} from "../components/ui";

type SessionTab = "sessions" | "history";

function scheduleDetail(schedule: BlockingSchedule, kind: "current" | "schedule" | "named", now: Date) {
  if (kind === "current") return formatRemaining(remainingUntilEnd(schedule, now));
  if (kind === "schedule") return "Always Active";
  if (!schedule.blocklists.length) return "No blocklists";
  return `Blocks ${schedule.blocklists.map((list) => list.name).join(" and ")}`;
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
  const [tab, setTab] = useState<SessionTab>("sessions");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateBlocklist, setShowCreateBlocklist] = useState(false);
  const [selectedBlocklist, setSelectedBlocklist] = useState<Blocklist | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const blocking = state.blocking ?? { schedules: [], blocklists: [], statusMessage: "", loading: false };
  const registeredDevices = (state.devices ?? []).filter(
    (device): device is DeviceListEntry & { deviceID: string } => Boolean(device.deviceID),
  );
  const now = useMemo(() => new Date(), [blocking.schedules]);
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
  const enforcementTone = !enforcement?.available
    ? "danger"
    : enforcement.connected && !enforcement.lastError
      ? "success"
      : "warning";
  const enforcementLabel = !enforcement?.available
    ? "Blocking helper unavailable"
    : enforcement.connected && !enforcement.lastError
      ? occurrence
        ? "Blocking is enforced"
        : helperReady
          ? "Blocking helper ready"
          : "Blocking is ready"
      : "Blocking enforcement degraded";
  const inventoryUnavailableReason = capabilities?.applicationInventory === false
    ? capabilities.reason || "The blocking helper does not provide application inventory."
    : null;

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

  const visibleSchedules = tab === "sessions" ? blocking.schedules : [];

  return (
    <div className="blocking-page" data-testid="blocking-page">
      <Banner tone={enforcementTone}>
        <strong>{enforcementLabel}.</strong>{" "}
        {enforcement?.lastError || capabilities?.reason || (
          occurrence
            ? `${occurrence.schedule_name} is active until ${formatClock(occurrence.end_at, clockFormat)}.`
            : helperReady
              ? "Permissions and native helper setup are complete."
              : "No session is blocking right now."
        )}
      </Banner>
      {blocking.statusMessage ? <p className="muted">{blocking.statusMessage}</p> : null}
      <div className="blocking-layout">
        <div className="blocking-column">
          <Grouped
            title="My Sessions"
            description="Schedules synced from your account"
            action={(
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setCreateError(null);
                  setShowCreateSession((open) => !open);
                }}
              >
                Add Session
              </Button>
            )}
          >
            <Tabs
              ariaLabel="Session views"
              value={tab}
              onChange={setTab}
              items={[
                { value: "sessions", label: "My Sessions" },
                { value: "history", label: "Session History" },
              ]}
            />
            {showCreateSession ? (
              <SessionComposer
                initialDraft={emptySessionDraft(state.auth?.user?.time_zone)}
                blocklists={blocking.blocklists}
                devices={registeredDevices}
                loading={blocking.loading}
                submitLabel="Create blocking session"
                submitError={createError}
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
            ) : null}
            <div className="blocking-session-list">
              {blocking.loading && !visibleSchedules.length ? <LoadingState label="Loading sessions…" /> : null}
              {tab === "history" ? (
                <EmptyState title="No session history" body="Completed sessions aren’t stored yet." />
              ) : null}
              {tab === "sessions" && !blocking.loading && !visibleSchedules.length && !showCreateSession ? (
                <EmptyState title="No sessions yet" body="Create a blocklist, then schedule a session." />
              ) : null}
              {visibleSchedules.map((schedule) => {
                const kind = scheduleRowKind(schedule, now);
                const selected = state.inspector.kind === "schedule"
                  && state.inspector.schedule?.schedule_id === schedule.schedule_id;
                const locked = strictActive && schedule.schedule_id === occurrence?.schedule_id;
                return (
                  <div
                    key={schedule.schedule_id}
                    className={`blocking-session-row ${kind === "current" ? "blocking-session-current" : ""} ${selected ? "is-selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="blocking-session"
                      aria-pressed={selected}
                      aria-label={`${schedule.name} session`}
                      onClick={() => window.stopscrolling.selectInspector({ kind: "schedule", schedule })}
                    >
                      <span>
                        <span className="blocking-session-title">{kind === "current" ? "Current Session" : schedule.name}</span>
                        <span className="blocking-session-meta">{scheduleWhen(schedule, { today: kind === "current" })}</span>
                      </span>
                      <span className={kind === "named" ? "blocking-session-meta" : "blocking-session-status"}>
                        {kind === "current"
                          ? `${schedule.name} · ${scheduleDetail(schedule, kind, now)}`
                          : scheduleDetail(schedule, kind, now)}
                        {schedule.strict_mode ? " · Strict Mode" : ""}
                      </span>
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
            title="My Blocklists"
            description="Lists of apps and sites to use in a session"
            action={(
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setShowCreateBlocklist((open) => !open);
                  if (!showCreateBlocklist) void refreshInventory();
                }}
              >
                Add Blocklist
              </Button>
            )}
          >
            {showCreateBlocklist ? (
              <BlocklistComposer
                submitLabel="Create blocklist"
                loading={blocking.loading}
                installedApplications={blocking.installedApplications}
                inventoryLoading={inventoryLoading}
                inventoryUnavailableReason={inventoryUnavailableReason}
                onRefreshInventory={() => void refreshInventory()}
                onSubmit={(payload) => {
                  window.stopscrolling.createBlocklist(payload);
                  setShowCreateBlocklist(false);
                }}
              />
            ) : null}
            {blocking.loading && !blocking.blocklists.length ? <LoadingState label="Loading blocklists…" /> : null}
            {!blocking.loading && !blocking.blocklists.length && !showCreateBlocklist ? (
              <EmptyState title="No blocklists" body="Create a blocklist with websites and apps to use in sessions." />
            ) : null}
            {blocking.blocklists.map((list) => (
              <button
                type="button"
                className="blocking-list-row"
                key={list.blocklist_id}
                onClick={() => {
                  setSelectedBlocklist(list);
                  void refreshInventory();
                }}
              >
                <span className="blocking-list-icon"><Shield size={14} aria-hidden="true" /></span>
                <span className="row-copy">
                  <span className="row-title">{list.name}</span>
                  <span className="row-subtitle">{list.entry_count} custom {list.entry_count === 1 ? "filter" : "filters"}</span>
                </span>
                <Badge>{list.entry_count}</Badge>
              </button>
            ))}
          </Grouped>
        </div>
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
    </div>
  );
}

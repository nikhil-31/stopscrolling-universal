import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  RefreshCw,
  Shield,
  ShieldAlert,
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
  const [showCreateBlocklist, setShowCreateBlocklist] = useState(false);
  const [selectedBlocklist, setSelectedBlocklist] = useState<Blocklist | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [supportToken, setSupportToken] = useState("");
  const [supportDeviceID, setSupportDeviceID] = useState("");
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(null);

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
        : "Blocking helper ready"
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

  async function redeemSupportToken(event: FormEvent) {
    event.preventDefault();
    if (!occurrence || !supportToken.trim() || !supportDeviceID.trim()) return;
    setDiagnosticsStatus("Submitting signed support token…");
    try {
      await window.stopscrolling.redeemBlockingBypass({
        token: supportToken.trim(),
        device_id: supportDeviceID.trim(),
        occurrence_id: occurrence.occurrence_id,
        action: "end",
      });
      setSupportToken("");
      setDiagnosticsStatus("Support token redeemed.");
    } catch (error) {
      setDiagnosticsStatus(error instanceof Error ? error.message : "Support token redemption failed.");
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
            : "Permissions and native helper setup are complete."
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
                onClick={() => setShowCreateSession((open) => !open)}
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
                onSubmit={(payload) => {
                  window.stopscrolling.createBlockingSchedule(payload);
                  setShowCreateSession(false);
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

        <div className="blocking-column">
          <Grouped
            title="Blocking Status"
            description="Native helper permissions and enforcement"
            action={(
              <Badge tone={enforcementTone} dot={enforcementTone === "success"}>
                {enforcementLabel.replace("Blocking ", "")}
              </Badge>
            )}
          >
            <div className="blocking-helper-status">
              {enforcementTone === "success"
                ? <ShieldCheck size={20} aria-hidden="true" />
                : <ShieldAlert size={20} aria-hidden="true" />}
              <span className="row-copy">
                <strong>{enforcementLabel}</strong>
                <span className="row-subtitle">
                  {enforcement?.connected
                    ? `Helper protocol ${enforcement.protocolVersion} connected`
                    : capabilities?.reason || enforcement?.lastError || "Complete helper installation and required system permissions."}
                </span>
              </span>
            </div>
            <ol className="blocking-setup-checklist" data-testid="blocking-setup-checklist">
              <li data-complete={blocking.hostSetup?.helperRegistered ? "true" : "false"}>
                Helper registered
              </li>
              <li data-complete={blocking.hostSetup?.networkFilterApproved ? "true" : "false"}>
                Network Filter approved
              </li>
              <li data-complete={blocking.hostSetup?.endpointSecurityApproved ? "true" : "false"}>
                Endpoint Security / Full Disk Access approved
              </li>
            </ol>
            {occurrence ? (
              <div className="blocking-occurrence" aria-label="Active blocking occurrence">
                <div className="inspector-kicker">Active occurrence</div>
                <strong>{occurrence.schedule_name}</strong>
                <span className="muted">
                  {new Date(occurrence.start_at).toLocaleString()} – {new Date(occurrence.end_at).toLocaleString()}
                </span>
                <span className="muted">{occurrence.entries.length} enforced {occurrence.entries.length === 1 ? "entry" : "entries"}</span>
                {strictActive ? <Badge tone="danger">Strict Mode locked</Badge> : <Badge tone="success">Normal session</Badge>}
              </div>
            ) : null}
            <div className="form-actions">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => void window.stopscrolling.activateNativeBlocking()}
              >
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void window.stopscrolling.refreshBlockingStatus()}
              >
                Check setup
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void refreshInventory()}
                disabled={inventoryLoading || capabilities?.applicationInventory === false}
              >
                {inventoryLoading ? "Loading apps…" : "Refresh apps"}
              </Button>
            </div>
            <details
              className="blocking-diagnostics"
              open={diagnosticsOpen}
              onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
            >
              <summary>Support diagnostics</summary>
              <p className="muted">For server-signed support tokens supplied by Stop Scrolling support.</p>
              {!occurrence ? (
                <p className="muted">No active occurrence is available for diagnostics.</p>
              ) : (
                <form className="form" onSubmit={(event) => void redeemSupportToken(event)}>
                  <label className="field">
                    <span>Signed support token</span>
                    <textarea
                      value={supportToken}
                      onChange={(event) => setSupportToken(event.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Device ID</span>
                    <input
                      value={supportDeviceID}
                      onChange={(event) => setSupportDeviceID(event.target.value)}
                      required
                    />
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={!supportToken.trim() || !supportDeviceID.trim() || capabilities?.bypassRedemption === false}
                  >
                    Redeem signed token
                  </Button>
                </form>
              )}
              {diagnosticsStatus ? <p role="status">{diagnosticsStatus}</p> : null}
            </details>
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

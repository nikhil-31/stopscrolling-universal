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
import {
  Laptop2,
  MonitorSmartphone,
  Plus,
  Shield,
  ShieldOff,
} from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Grouped,
  LoadingState,
  Tabs,
  Toggle,
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
  const [lockedMode, setLockedMode] = useState(false);
  const [tab, setTab] = useState<SessionTab>("sessions");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [showCreateBlocklist, setShowCreateBlocklist] = useState(false);
  const [selectedBlocklist, setSelectedBlocklist] = useState<Blocklist | null>(null);

  const blocking = state.blocking ?? { schedules: [], blocklists: [], statusMessage: "", loading: false };
  const devices = state.devices ?? [];
  const registeredDevices = devices.filter((device): device is DeviceListEntry & { deviceID: string } => Boolean(device.deviceID));
  const now = useMemo(() => new Date(), [blocking.schedules]);

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
      <Banner tone="info">
        Sessions and blocklists sync to your account. This desktop app does not enforce blocks yet.
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
                initialDraft={emptySessionDraft()}
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
                return (
                  <button
                    key={schedule.schedule_id}
                    type="button"
                    className={`blocking-session ${kind === "current" ? "blocking-session-current" : ""} ${selected ? "is-selected" : ""}`}
                    aria-pressed={selected}
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
                    </span>
                  </button>
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
                onClick={() => setShowCreateBlocklist((open) => !open)}
              >
                Add Blocklist
              </Button>
            )}
          >
            {showCreateBlocklist ? (
              <BlocklistComposer
                submitLabel="Create blocklist"
                loading={blocking.loading}
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
                onClick={() => setSelectedBlocklist(list)}
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
            className="blocking-devices"
            title="My Devices"
            description="Devices that can join a session"
            action={<Badge>{devices.length}</Badge>}
          >
            <div className="device-grid">
              {devices.map((device) => (
                <div className="device-card" key={device.visibilityKey}>
                  <div className="device-card-top">
                    <span className="device-icon">
                      {device.devicePlatform === "windows" ? <MonitorSmartphone size={15} /> : <Laptop2 size={15} />}
                    </span>
                    <span className="row-copy">
                      <span className="row-title">{device.deviceName}</span>
                      <span className="row-subtitle">{device.devicePlatform}</span>
                    </span>
                    <span className={`dot ${device.isOnline ? "online" : ""}`} title={device.isOnline ? "Online" : "Offline"} />
                  </div>
                </div>
              ))}
            </div>
            {!devices.length ? <p className="muted">Devices appear here after your first sync.</p> : null}
          </Grouped>

          <Grouped title="Options" description="Session behavior on this device">
            <Toggle
              label="Locked Mode"
              description="Keeps the session from ending early. Preview only."
              checked={lockedMode}
              onChange={setLockedMode}
              testId="blocking-locked-mode"
            />
          </Grouped>
        </div>
      </div>
      {selectedBlocklist ? (
        <BlocklistDetailDialog
          blocklist={selectedBlocklist}
          loading={blocking.loading}
          onClose={() => setSelectedBlocklist(null)}
        />
      ) : null}
      {editingSchedule ? (
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

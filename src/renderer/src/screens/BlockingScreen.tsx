import { useMemo, useState } from "react";
import type { AppSnapshot } from "@shared/snapshot";
import {
  Laptop2,
  MonitorSmartphone,
  Plus,
  Shield,
} from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  Grouped,
  Tabs,
  Toggle,
} from "../components/ui";

type SessionTab = "sessions" | "history";

interface BlockingSession {
  id: string;
  title: string;
  detail: string;
  meta: string;
  kind: "current" | "schedule" | "named";
}

interface BlockingList {
  id: string;
  name: string;
  filterCount: number;
}

interface BlockingDevice {
  key: string;
  name: string;
  platform: string;
  isOnline: boolean;
}

const DEMO_DEVICES: BlockingDevice[] = [
  { key: "demo-mac", name: "This Mac", platform: "macos", isOnline: true },
  { key: "demo-windows", name: "Windows PC", platform: "windows", isOnline: false },
];

const INITIAL_SESSIONS: BlockingSession[] = [
  {
    id: "current",
    title: "Current Session",
    detail: "17 hours 30 minutes left",
    meta: "07:31 – 07:31 · Today",
    kind: "current",
  },
  {
    id: "schedule",
    title: "My schedule",
    detail: "Always Active",
    meta: "00:00 – 00:00 · Every day",
    kind: "schedule",
  },
  {
    id: "deep-work",
    title: "Deep work",
    detail: "Blocks Social and Games",
    meta: "16:00 – 18:00 · Mon, Tue, Wed, Thu, Fri",
    kind: "named",
  },
  {
    id: "evening",
    title: "Evening reset",
    detail: "Blocks News and Social",
    meta: "21:00 – 23:00 · Every day",
    kind: "named",
  },
];

const INITIAL_HISTORY: BlockingSession[] = [
  {
    id: "hist-1",
    title: "Deep work",
    detail: "Completed",
    meta: "Yesterday · 2 hours",
    kind: "named",
  },
];

const INITIAL_LISTS: BlockingList[] = [
  { id: "social", name: "Social", filterCount: 4 },
  { id: "news", name: "News", filterCount: 3 },
  { id: "games", name: "Games", filterCount: 2 },
];

export function BlockingScreen({ state }: { state: AppSnapshot }) {
  const [lockedMode, setLockedMode] = useState(false);
  const [tab, setTab] = useState<SessionTab>("sessions");
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [history] = useState(INITIAL_HISTORY);
  const [blocklists, setBlocklists] = useState(INITIAL_LISTS);

  const devices = useMemo<BlockingDevice[]>(() => {
    const connected = state.devices ?? [];
    if (connected.length) {
      return connected.map((device) => ({
        key: device.visibilityKey,
        name: device.deviceName,
        platform: device.devicePlatform,
        isOnline: device.isOnline,
      }));
    }
    return DEMO_DEVICES;
  }, [state.devices]);

  const usingDemoDevices = !(state.devices ?? []).length;
  const visibleSessions = tab === "sessions" ? sessions : history;

  return (
    <div className="blocking-page" data-testid="blocking-page">
      <Banner tone="info">
        Blocking is a preview. Sessions and lists here don’t restrict apps or websites yet.
      </Banner>
      <div className="blocking-layout">
        <div className="blocking-column">
          <Grouped
            title="My Sessions"
            description="Schedules and timed sessions for this preview"
            action={(
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  const namedCount = sessions.filter((session) => session.kind === "named").length;
                  setSessions((current) => [
                    ...current,
                    {
                      id: `session-${Date.now()}`,
                      title: `Session ${namedCount + 1}`,
                      detail: "Custom session",
                      meta: "10:00 – 12:00 · Weekdays",
                      kind: "named",
                    },
                  ]);
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
            <div className="blocking-session-list">
              {visibleSessions.map((session) => (
                <details
                  key={session.id}
                  className={`blocking-session ${session.kind === "current" ? "blocking-session-current" : ""}`}
                  open={session.kind === "current"}
                >
                  <summary>
                    <span>
                      <span className="blocking-session-title">{session.title}</span>
                      <span className="blocking-session-meta">{session.meta}</span>
                    </span>
                    <span className={session.kind === "named" ? "blocking-session-meta" : "blocking-session-status"}>
                      {session.detail}
                    </span>
                  </summary>
                  <div className="blocking-session-body">
                    {session.kind === "current"
                      ? "This timed session is a preview. It will not block apps or websites."
                      : session.kind === "schedule"
                        ? "Always-on schedule for selected lists. Preview only."
                        : "A named session you can start later. Preview only."}
                  </div>
                </details>
              ))}
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
                  setBlocklists((current) => [
                    ...current,
                    {
                      id: `list-${Date.now()}`,
                      name: `Blocklist ${current.length + 1}`,
                      filterCount: 1,
                    },
                  ]);
                }}
              >
                Add Blocklist
              </Button>
            )}
          >
            {blocklists.map((list) => (
              <div className="blocking-list-row" key={list.id}>
                <span className="blocking-list-icon"><Shield size={14} aria-hidden="true" /></span>
                <span className="row-copy">
                  <span className="row-title">{list.name}</span>
                  <span className="row-subtitle">{list.filterCount} custom {list.filterCount === 1 ? "filter" : "filters"}</span>
                </span>
                <Badge>{list.filterCount}</Badge>
              </div>
            ))}
          </Grouped>
        </div>

        <div className="blocking-column">
          <Grouped
            className="blocking-devices"
            title="My Devices"
            description={usingDemoDevices ? "Sample devices until yours sync" : "Devices that can join a session"}
            action={<Badge>{devices.length}</Badge>}
          >
            <div className="device-grid">
              {devices.map((device) => (
                <div className="device-card" key={device.key}>
                  <div className="device-card-top">
                    <span className="device-icon">
                      {device.platform === "windows" ? <MonitorSmartphone size={15} /> : <Laptop2 size={15} />}
                    </span>
                    <span className="row-copy">
                      <span className="row-title">{device.name}</span>
                      <span className="row-subtitle">{device.platform}</span>
                    </span>
                    <span className={`dot ${device.isOnline ? "online" : ""}`} title={device.isOnline ? "Online" : "Offline"} />
                  </div>
                </div>
              ))}
            </div>
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
    </div>
  );
}

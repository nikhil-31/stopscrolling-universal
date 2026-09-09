import type { AppSnapshot } from "@shared/snapshot";
import {
  CalendarDays,
  Cloud,
  ExternalLink,
  FileText,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  Grouped,
  TextField,
  Toggle,
} from "../components/ui";

export function SettingsScreen({ state }: { state: AppSnapshot }) {
  const settings = state.settings;
  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Personalize how StopScrolling tracks, looks, and connects.</p>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#general">General</a>
          <a href="#appearance">Appearance</a>
          <a href="#work-hours">Work hours</a>
          <a href="#labels">Labels</a>
          <a href="#calendars">Calendars</a>
          <a href="#backend">Sync</a>
          <a href="#diagnostics">Diagnostics</a>
        </nav>
        <div>
          <section id="general" className="settings-section">
            <Grouped title="General" description="Control the tracking lifecycle">
              <Toggle
                label="Record screen time on launch"
                description="Begin a private local session whenever StopScrolling opens."
                checked={settings.startScreenTimeOnLaunch}
                onChange={(startScreenTimeOnLaunch) => window.stopscrolling.updateSettings({ startScreenTimeOnLaunch })}
                testId="settings-start-screen-time-on-launch"
              />
            </Grouped>
          </section>

          <section id="appearance" className="settings-section">
            <Grouped title="Appearance" description="Choose how the interface feels">
              <div className="appearance-grid" data-testid="settings-appearance-picker">
                {([
                  { value: "system", label: "System", icon: Monitor },
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    className={`appearance-option ${settings.appearance === value ? "is-selected" : ""}`}
                    aria-pressed={settings.appearance === value}
                    onClick={() => window.stopscrolling.updateSettings({ appearance: value })}
                  >
                    <div className={`appearance-preview preview-${value}`} />
                    <Icon size={13} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            </Grouped>
          </section>

          <section id="work-hours" className="settings-section">
            <Grouped title="Work hours" description="Daily target used on the Calendar summary">
              <TextField
                label="Daily work target (hours)"
                type="number"
                min={1}
                max={16}
                step={0.5}
                value={String(Math.round((settings.dailyWorkTargetSeconds / 3600) * 10) / 10)}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed) || parsed <= 0) return;
                  window.stopscrolling.updateSettings({ dailyWorkTargetSeconds: Math.round(parsed * 3600) });
                }}
              />
            </Grouped>
          </section>

          <section id="labels" className="settings-section">
            <Grouped title="Labels" description="Names and colors applied to reviewed time on Calendar">
              <div className="calendar-label-picks">
                {state.calendarWorkspace.labels.map((label) => (
                  <div key={label.id} className="calendar-label-manage">
                    <span className="calendar-legend-dot" style={{ background: label.color }} />
                    <span>{label.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.deleteCalendarLabel(label.id)}>Delete</Button>
                  </div>
                ))}
              </div>
              <div className="form-actions">
                <Button
                  size="sm"
                  onClick={() => window.stopscrolling.upsertCalendarLabel({
                    name: "New label",
                    color: "#1fb894",
                    bucket: "other",
                    countsTowardWork: true,
                  })}
                >
                  Add label
                </Button>
              </div>
            </Grouped>
          </section>

          <section id="calendars" className="settings-section">
            <Grouped
              title="Calendar"
              description="Place commitments alongside tracked activity"
              action={<Badge tone={state.googleCalendarConnected ? "success" : "neutral"} dot>{state.googleCalendarConnected ? "Connected" : "Not connected"}</Badge>}
            >
              <div className="setting-row">
                <Toggle
                  label="Show Google Calendar events"
                  description="Overlay timed events on the Calendar day view."
                  checked={settings.showGoogleCalendarEvents}
                  onChange={(showGoogleCalendarEvents) => window.stopscrolling.updateSettings({ showGoogleCalendarEvents })}
                  testId="settings-show-google-calendar-events"
                />
              </div>
              <div className="setting-row">
                <TextField
                  label="Google OAuth client ID"
                  placeholder="Client ID from Google Cloud Console"
                  value={settings.googleClientId}
                  onChange={(event) => window.stopscrolling.updateSettings({ googleClientId: event.target.value })}
                  hint="Stored locally and used only for calendar authorization."
                />
              </div>
              <div className="connection-row">
                <CalendarDays size={17} aria-hidden="true" />
                <div className="connection-copy">
                  <strong>Google Calendar</strong>
                  <span>{state.googleCalendarStatus}</span>
                </div>
                {state.googleCalendarConnected ? (
                  <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.googleDisconnect()}>Disconnect</Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => window.stopscrolling.googleConnect()}>Connect</Button>
                )}
              </div>
              <p className="small muted">Apple Calendar / EventKit is not available in the cross-platform Electron client.</p>
            </Grouped>
          </section>

          <section id="backend" className="settings-section">
            <Grouped
              title="Backend sync"
              description="Securely upload sessions and retrieve device timelines"
              action={<Badge tone={state.auth.user && settings.syncEnabled ? "success" : "warning"} dot>{state.auth.user && settings.syncEnabled ? "Ready" : "Needs attention"}</Badge>}
            >
              <div className="setting-row">
                <Toggle
                  label="Sync events to backend"
                  description="Upload completed sessions from the encrypted local outbox."
                  checked={settings.syncEnabled}
                  onChange={(syncEnabled) => window.stopscrolling.updateSettings({ syncEnabled })}
                  testId="settings-backend-sync-enabled"
                />
              </div>
              <div className="setting-row">
                <TextField
                  label="API base URL"
                  value={settings.apiBaseUrl}
                  onChange={(event) => window.stopscrolling.updateSettings({ apiBaseUrl: event.target.value })}
                  data-testid="settings-backend-api-url"
                />
              </div>
              {settings.apiBaseUrl.trim().toLowerCase().startsWith("http://") ? (
                <div data-testid="settings-backend-http-warning">
                  <Banner tone="warning">HTTP is suitable for local development only. Use HTTPS in production.</Banner>
                </div>
              ) : null}
              {!state.auth.user ? (
                <Banner tone="warning">Sign in from Account before enabling cloud sync.</Banner>
              ) : (
                <div className="connection-row">
                  <Cloud size={17} aria-hidden="true" />
                  <div className="connection-copy">
                    <strong>Signed in</strong>
                    <span>{state.auth.user.email}</span>
                  </div>
                  <Badge tone="success">Authenticated</Badge>
                </div>
              )}
              <div className="form-actions">
                <Button icon={RefreshCw} data-testid="settings-sync-all-unsynced" onClick={() => window.stopscrolling.syncAll()}>
                  Sync unsynced
                </Button>
                <Button variant="ghost" icon={Cloud} data-testid="settings-pull-from-server" onClick={() => window.stopscrolling.pullFromServer()}>
                  Pull from server
                </Button>
              </div>
            </Grouped>
          </section>

          <section id="diagnostics" className="settings-section">
            <Grouped title="Diagnostics" description="Inspect local logs when something feels off">
              <Banner>{state.capabilities.urlCaptureNote}</Banner>
              <div className="setting-row">
                <div className="path-row">
                  <FileText size={15} aria-hidden="true" />
                  <span className="path-value" title={state.logs.network}>{state.logs.network}</span>
                  <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.stopscrolling.openPath(state.logs.network)}>Open</Button>
                </div>
              </div>
              <div className="setting-row">
                <div className="path-row">
                  <FileText size={15} aria-hidden="true" />
                  <span className="path-value" title={state.logs.observability}>{state.logs.observability}</span>
                  <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.stopscrolling.openPath(state.logs.observability)}>Open</Button>
                </div>
              </div>
            </Grouped>
          </section>
        </div>
      </div>
    </div>
  );
}

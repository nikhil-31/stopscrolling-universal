import { useEffect, useState, type ReactNode } from "react";
import { effectiveTimeZone, localTimeZoneLabel } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import type { AppleCalendarAccess, CalendarSourceOption } from "@shared/types";
import {
  CalendarDays,
  Cloud,
  ExternalLink,
  FileText,
  Hand,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  TextField,
  Toggle,
} from "../components/ui";
import { GameMark } from "../components/GameMark";
import { BlockScreenEditor, emptyBlockScreenDraft, type BlockScreenDraft } from "../components/blocking/BlockScreenEditor";

function SettingsGroup({
  title,
  description,
  action,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      {title ? (
        <header className="settings-group-heading">
          <div>
            <h3 className="settings-group-title">{title}</h3>
            {description ? <p className="settings-group-description">{description}</p> : null}
          </div>
          {action ? <div className="settings-group-action">{action}</div> : null}
        </header>
      ) : null}
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  icon,
  testId,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row" data-testid={testId}>
      {icon ? <span className="settings-row-icon">{icon}</span> : null}
      <div className="settings-row-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {children ? <div className="settings-row-control">{children}</div> : null}
    </div>
  );
}

function BlockedScreenSettings() {
  const [screenDraft, setScreenDraft] = useState<BlockScreenDraft>(emptyBlockScreenDraft);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = window.stopscrolling.getBlockScreens;
    if (!load) return;
    void load().then((screens) => {
      setScreenDraft({
        header: screens.default.header,
        detail: screens.default.detail,
        imageFile: screens.default.imageFile,
        imageUrl: screens.default.imageUrl,
      });
    }).catch(() => {});
  }, []);

  return (
    <SettingsGroup
      title="Blocked screen"
      description="Shown for every session that does not set its own image, header, and detail."
    >
      <BlockScreenEditor
        value={screenDraft}
        onChange={setScreenDraft}
        hint="Leave a field blank to keep the built-in blue page for that part."
      />
      <div className="block-screen-actions">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            void window.stopscrolling.saveDefaultBlockScreen({
              header: screenDraft.header,
              detail: screenDraft.detail,
              imageFile: screenDraft.imageFile,
            }).then(() => setStatus("Blocked screen saved."));
          }}
        >
          Save blocked screen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const cleared = emptyBlockScreenDraft();
            setScreenDraft(cleared);
            void window.stopscrolling.saveDefaultBlockScreen(cleared).then(() => setStatus("Using the built-in screen."));
          }}
        >
          Use built-in screen
        </Button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </SettingsGroup>
  );
}

function DistractionReminderSettings() {
  const [imageFile, setImageFile] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [detail, setDetail] = useState("");
  const [presets, setPresets] = useState<Array<{ id: string; label: string; imageUrl: string }>>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = window.stopscrolling.getNudgeReminder;
    if (load) {
      void load().then((reminder) => {
        setImageFile(reminder.imageFile);
        setImageUrl(reminder.imageUrl);
        setDetail(reminder.detail);
      }).catch(() => {});
    }
    const list = window.stopscrolling.listBlockScreenPresets;
    if (list) void list().then(setPresets).catch(() => {});
  }, []);

  async function chooseImage() {
    setError("");
    const choose = window.stopscrolling.chooseBlockScreenImage;
    if (!choose) return;
    const chosen = await choose();
    if (!chosen) return;
    if ("error" in chosen) {
      setError(chosen.error);
      return;
    }
    setImageFile(chosen.imageFile);
    setImageUrl(chosen.imageUrl);
  }

  const support = detail.trim() || "This looks distracting";

  return (
    <SettingsGroup
      title="Distraction reminder"
      description="Shown on the card when you start something distracting. A GIF keeps playing."
    >
      <div className="nudge-reminder-editor">
        {error ? <p className="muted" role="alert">{error}</p> : null}
        <div className="nudge-reminder-preview">
          {imageUrl ? <img src={imageUrl} alt="" /> : null}
          <strong>youtube.com</strong>
          <span>{support}</span>
        </div>
        {presets.length ? (
          <div className="block-screen-gallery" role="listbox" aria-label="Images and GIFs">
            {presets.map((preset) => {
              const selected = imageFile === `preset:${preset.id}`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="option"
                  className={`block-screen-choice${selected ? " is-selected" : ""}`}
                  aria-selected={selected}
                  aria-label={preset.label}
                  onClick={() => {
                    setImageFile(`preset:${preset.id}`);
                    setImageUrl(preset.imageUrl);
                  }}
                >
                  <img src={preset.imageUrl} alt="" />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="block-screen-actions">
          <Button type="button" size="sm" onClick={() => void chooseImage()}>
            Choose from your files
          </Button>
          {imageFile ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setImageFile("");
                setImageUrl("");
              }}
            >
              Remove image
            </Button>
          ) : null}
        </div>
        <TextField
          label="Support"
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="This looks distracting"
        />
      </div>
      <div className="block-screen-actions">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            const save = window.stopscrolling.saveNudgeReminder;
            if (!save) return;
            void save({ imageFile, detail }).then(() => setStatus("Distraction reminder saved."));
          }}
        >
          Save reminder
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setImageFile("");
            setImageUrl("");
            setDetail("");
            const save = window.stopscrolling.saveNudgeReminder;
            if (!save) return;
            void save({ imageFile: "", detail: "" }).then(() => setStatus("Using the built-in reminder."));
          }}
        >
          Use built-in reminder
        </Button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </SettingsGroup>
  );
}


type SettingsPane = "general" | "appearance" | "blocking" | "calendar" | "games" | "sync" | "diagnostics";

const PANES: Array<{ id: SettingsPane; label: string }> = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "blocking", label: "Blocking" },
  { id: "calendar", label: "Calendar" },
  { id: "games", label: "Games" },
  { id: "sync", label: "Sync" },
  { id: "diagnostics", label: "Diagnostics" },
];

function GeneralPane({ state }: { state: AppSnapshot }) {
  const settings = state.settings;
  const signedIn = Boolean(state.auth?.user);
  const timeZones = Intl.supportedValuesOf("timeZone");
  const selectedZone = state.auth?.user?.time_zone ?? "";
  return (
    <>
      <SettingsGroup>
        <SettingRow
          label="Time zone"
          description={signedIn
            ? "Days, calendars, and insights use this zone. Recorded sessions keep the computer’s zone."
            : "Sign in to save a time zone on your account."}
        >
          <select
            aria-label="Time zone"
            data-testid="settings-time-zone"
            value={selectedZone}
            disabled={!signedIn}
            onChange={(event) => window.stopscrolling.setTimeZone(event.target.value)}
          >
            <option value="">Same as this computer ({localTimeZoneLabel(effectiveTimeZone())})</option>
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Clock" description="Hour labels on the activity trend, timelines, and calendar.">
          <select
            aria-label="Clock"
            data-testid="settings-clock-format"
            value={settings.clockFormat === "12" ? "12" : "24"}
            onChange={(event) => window.stopscrolling.updateSettings({
              clockFormat: event.target.value === "12" ? "12" : "24",
            })}
          >
            <option value="24">24-hour</option>
            <option value="12">12-hour</option>
          </select>
        </SettingRow>
        <SettingRow label="Daily work target" description="Hours used on the Calendar summary.">
          <input
            aria-label="Daily work target (hours)"
            className="settings-number"
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
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title="System">
        <Toggle
          label="Launch at login"
          description="Starts with your computer and stays in the menu bar until you choose Quit."
          checked={settings.launchAtLogin}
          onChange={(launchAtLogin) => window.stopscrolling.updateSettings({ launchAtLogin })}
          testId="settings-launch-at-login"
        />
        {state.capabilities.platform === "macos" ? (
          <Toggle
            label="Desktop widget"
            description="Shows the time panel on your desktop. It uses the same productive, neutral, and distracting totals as the main window."
            checked={settings.desktopWidgetVisible}
            onChange={(desktopWidgetVisible) => window.stopscrolling.updateSettings({ desktopWidgetVisible })}
            testId="settings-desktop-widget"
          />
        ) : null}
        {state.capabilities.platform === "macos" ? (
          <SettingRow
            label="Accessibility"
            description={state.capabilities.urlCaptureNote}
            icon={<Hand size={16} aria-hidden="true" />}
            testId="settings-accessibility"
          >
            {state.capabilities.accessibilityGranted ? (
              <Badge tone="success">Granted</Badge>
            ) : (
              <Button size="sm" onClick={() => window.stopscrolling.requestAccessibility()}>
                Grant access
              </Button>
            )}
          </SettingRow>
        ) : null}
      </SettingsGroup>
    </>
  );
}

function AppearancePane({ state }: { state: AppSnapshot }) {
  const appearance = state.settings.appearance;
  return (
    <SettingsGroup title="Theme">
      <div className="appearance-grid" data-testid="settings-appearance-picker">
        {([
          { value: "system", label: "System", icon: Monitor },
          { value: "light", label: "Light", icon: Sun },
          { value: "dark", label: "Dark", icon: Moon },
        ] as const).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            className={`appearance-option ${appearance === value ? "is-selected" : ""}`}
            aria-pressed={appearance === value}
            onClick={() => window.stopscrolling.updateSettings({ appearance: value })}
          >
            <div className={`appearance-preview preview-${value}`} />
            <Icon size={13} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
    </SettingsGroup>
  );
}

const APPLE_ACCESS_TEXT: Record<AppleCalendarAccess, string> = {
  notDetermined: "Allow access to show events from Calendar.app.",
  fullAccess: "Reading calendars from Calendar.app on this Mac.",
  writeOnly: "Stop Scrolling needs full access to read events. Change it in System Settings › Privacy & Security › Calendars.",
  denied: "Access is off. Turn it on in System Settings › Privacy & Security › Calendars.",
  restricted: "Calendar access is restricted on this Mac.",
  unsupported: "",
};

function CalendarToggle({ calendar }: { calendar: CalendarSourceOption }) {
  return (
    <Toggle
      label={calendar.name}
      description={calendar.coveredByGoogle ? "Shown through your linked Google account" : calendar.accountLabel}
      checked={calendar.selected}
      disabled={calendar.coveredByGoogle}
      onChange={(selected) => void window.stopscrolling.setCalendarSelected({
        provider: calendar.provider,
        id: calendar.id,
        selected,
      })}
      testId={`settings-calendar-${calendar.provider}-${calendar.id}`}
    />
  );
}

function CalendarPane({ state }: { state: AppSnapshot }) {
  const settings = state.settings;
  const { google, apple, calendars, errors } = state.calendarIntegration;
  const googleCalendars = calendars.filter((calendar) => calendar.provider === "google");
  const appleCalendars = calendars.filter((calendar) => calendar.provider === "apple");
  const linked = google.accounts.length > 0;
  return (
    <>
      <SettingsGroup title="Events" description="Place commitments alongside tracked activity.">
        <Toggle
          label="Show calendar events"
          description="Overlay events from the calendars below on Calendar."
          checked={settings.showCalendarEvents}
          onChange={(showCalendarEvents) => window.stopscrolling.updateSettings({ showCalendarEvents })}
          testId="settings-show-calendar-events"
        />
        {errors.length ? <Banner tone="warning">{errors.join(" ")}</Banner> : null}
      </SettingsGroup>
      <SettingsGroup
        title="Google Calendar"
        description="Linked to your Stop Scrolling account, so it shows on every device you sign in to. Read-only."
        action={<Badge tone={linked ? "success" : "neutral"} dot>{linked ? "Connected" : "Not connected"}</Badge>}
      >
        {google.accounts.map((account) => (
          <SettingRow
            key={account.id}
            label={account.email}
            description={account.needsReauth ? "Google access expired. Reconnect to keep seeing events." : "Connected"}
            icon={<CalendarDays size={16} aria-hidden="true" />}
          >
            {account.needsReauth ? (
              <Button size="sm" variant="primary" disabled={google.connecting} onClick={() => void window.stopscrolling.googleConnect()}>
                Reconnect
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => void window.stopscrolling.googleDisconnect(account.id)}>Disconnect</Button>
          </SettingRow>
        ))}
        {googleCalendars.map((calendar) => <CalendarToggle key={`google-${calendar.id}`} calendar={calendar} />)}
        <SettingRow
          label={linked ? "Add another Google account" : "Google Calendar"}
          description={
            !google.available
              ? "Sign in to link Google Calendar."
              : google.connecting
                ? "Finish signing in with Google in your browser."
                : "Opens Google in your browser."
          }
          icon={linked ? undefined : <CalendarDays size={16} aria-hidden="true" />}
        >
          <Button
            size="sm"
            variant={linked ? "ghost" : "primary"}
            disabled={!google.available || google.connecting}
            onClick={() => void window.stopscrolling.googleConnect()}
            data-testid="settings-google-calendar-connect"
          >
            {google.connecting ? "Waiting…" : "Connect"}
          </Button>
        </SettingRow>
        {linked ? (
          <div className="form-actions">
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void window.stopscrolling.refreshCalendarSources()}>
              Refresh calendar list
            </Button>
          </div>
        ) : null}
      </SettingsGroup>
      {apple.access === "unsupported" ? null : (
        <SettingsGroup
          title="Apple Calendar"
          description="Calendars from Calendar.app, read on this Mac only."
          action={<Badge tone={apple.access === "fullAccess" ? "success" : "neutral"} dot>{apple.access === "fullAccess" ? "Allowed" : "Not allowed"}</Badge>}
        >
          <SettingRow
            label="Calendar access"
            description={APPLE_ACCESS_TEXT[apple.access]}
            icon={<CalendarDays size={16} aria-hidden="true" />}
          >
            {apple.access === "notDetermined" ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void window.stopscrolling.appleCalendarRequestAccess()}
                data-testid="settings-apple-calendar-allow"
              >
                Allow access
              </Button>
            ) : null}
          </SettingRow>
          {appleCalendars.map((calendar) => <CalendarToggle key={`apple-${calendar.id}`} calendar={calendar} />)}
        </SettingsGroup>
      )}
      <SettingsGroup title="Labels" description="Names and colors applied to reviewed time on Calendar.">
        {state.calendarWorkspace.labels.map((label) => (
          <SettingRow
            key={label.id}
            label={label.name}
            icon={<span className="calendar-legend-dot" style={{ background: label.color }} />}
          >
            <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.deleteCalendarLabel(label.id)}>Delete</Button>
          </SettingRow>
        ))}
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
      </SettingsGroup>
    </>
  );
}

function GamesPane({ state }: { state: AppSnapshot }) {
  const [riotId, setRiotId] = useState("");
  const riot = state.gameAccounts?.riot ?? null;
  const steam = state.gameAccounts?.steam ?? null;
  const gameStatus = state.gameAccountsStatus ?? "Link a Riot ID or Steam account to upload matches.";
  return (
    <SettingsGroup
      title="Accounts"
      description="Upload League matches and Steam play sessions with your screen time."
      action={<Badge tone={riot || steam ? "success" : "neutral"} dot>{riot || steam ? "Linked" : "Not linked"}</Badge>}
    >
      <SettingRow
        label="Riot"
        description={riot ? `${riot.gameName}#${riot.tagLine}` : "League of Legends matches"}
        icon={<GameMark platform="riot" />}
      >
        {riot ? (
          <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.disconnectRiot()}>Disconnect</Button>
        ) : null}
      </SettingRow>
      {riot ? null : (
        <form
          className="settings-row settings-riot-form"
          onSubmit={(event) => {
            event.preventDefault();
            window.stopscrolling.linkRiot(riotId);
          }}
        >
          <TextField
            label="Riot ID"
            placeholder="Name#TAG"
            value={riotId}
            onChange={(event) => setRiotId(event.target.value)}
            data-testid="settings-riot-id"
          />
          <Button type="submit" size="sm" variant="primary" disabled={!riotId.trim()} data-testid="settings-riot-link">
            Link
          </Button>
        </form>
      )}
      <SettingRow
        label="Steam"
        description={steam ? (steam.personaName || steam.steamId64) : "Play sessions for linked games"}
        icon={<GameMark platform="steam" />}
      >
        {steam ? (
          <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.disconnectSteam()}>Disconnect</Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => window.stopscrolling.connectSteam()} data-testid="settings-steam-connect">
            Connect
          </Button>
        )}
      </SettingRow>
      <p className="settings-footnote">{gameStatus}</p>
    </SettingsGroup>
  );
}

function SyncPane({ state }: { state: AppSnapshot }) {
  const settings = state.settings;
  return (
    <>
      <SettingsGroup
        title="Backend sync"
        description="Securely upload sessions and retrieve device timelines."
        action={<Badge tone={state.auth.user && settings.syncEnabled ? "success" : "warning"} dot>{state.auth.user && settings.syncEnabled ? "Ready" : "Needs attention"}</Badge>}
      >
        {!state.auth.user ? (
          <Banner tone="warning">Sign in from Account before enabling cloud sync.</Banner>
        ) : (
          <SettingRow label="Signed in" description={state.auth.user.email} icon={<Cloud size={16} aria-hidden="true" />}>
            <Badge tone="success">Authenticated</Badge>
          </SettingRow>
        )}
        <Toggle
          label="Sync events to backend"
          description="Upload completed sessions from the encrypted local outbox."
          checked={settings.syncEnabled}
          onChange={(syncEnabled) => window.stopscrolling.updateSettings({ syncEnabled })}
          testId="settings-backend-sync-enabled"
        />
        <div className="settings-row settings-row-stacked">
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
        <div className="form-actions">
          <Button icon={RefreshCw} data-testid="settings-sync-all-unsynced" onClick={() => window.stopscrolling.syncAll()}>
            Sync unsynced
          </Button>
          <Button variant="ghost" icon={Cloud} data-testid="settings-pull-from-server" onClick={() => window.stopscrolling.pullFromServer()}>
            Pull from server
          </Button>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Privacy">
        <Toggle
          label="Send window titles to Jev"
          description="Lets the Agent tell pages apart, such as a lecture and a short on the same site. Titles are sent to your account, which asks Jev and saves the ratings."
          checked={settings.agentSendTitles}
          onChange={(agentSendTitles) => window.stopscrolling.updateSettings({ agentSendTitles })}
          testId="settings-agent-send-titles"
        />
      </SettingsGroup>
    </>
  );
}

function DiagnosticsPane({ state }: { state: AppSnapshot }) {
  return (
    <SettingsGroup title="Logs" description="Inspect local logs when something feels off.">
      <Banner>{state.capabilities.urlCaptureNote}</Banner>
      {[state.logs.network, state.logs.observability].map((path) => (
        <SettingRow
          key={path}
          label={<span className="path-value" title={path}>{path}</span>}
          icon={<FileText size={15} aria-hidden="true" />}
        >
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.stopscrolling.openPath(path)}>Open</Button>
        </SettingRow>
      ))}
    </SettingsGroup>
  );
}

export function SettingsScreen({ state }: { state: AppSnapshot }) {
  const [pane, setPane] = useState<SettingsPane>("general");
  const current = PANES.find((item) => item.id === pane) ?? PANES[0];
  return (
    <div className="settings-shell">
      <nav className="settings-sidebar" aria-label="Settings sections">
        <h1>Settings</h1>
        {PANES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={pane === id ? "page" : undefined}
            data-testid={`settings-nav-${id}`}
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="settings-pane">
        <div className="settings-pane-inner">
          <h2 className="settings-pane-title">{current.label}</h2>
          {pane === "general" ? <GeneralPane state={state} /> : null}
          {pane === "appearance" ? <AppearancePane state={state} /> : null}
          {pane === "blocking" ? (
            <>
              <BlockedScreenSettings />
              <DistractionReminderSettings />
            </>
          ) : null}
          {pane === "calendar" ? <CalendarPane state={state} /> : null}
          {pane === "games" ? <GamesPane state={state} /> : null}
          {pane === "sync" ? <SyncPane state={state} /> : null}
          {pane === "diagnostics" ? <DiagnosticsPane state={state} /> : null}
        </div>
      </main>
    </div>
  );
}

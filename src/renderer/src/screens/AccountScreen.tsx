import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { deviceColor, deviceDisplayName } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import type { DeviceListEntry } from "@shared/types";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Laptop2,
  LogOut,
  MonitorSmartphone,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import {
  Badge,
  Banner,
  Button,
  Card,
  Grouped,
  IconButton,
  Tabs,
  TextField,
  Toggle,
} from "../components/ui";

export function AccountScreen({ state }: { state: AppSnapshot }) {
  const auth = state.auth;
  if (!auth.user) return <SignInCard auth={auth} />;

  const user = auth.user;
  const devices = sortedDevices(state.devices, state.hiddenDeviceKeys);
  return (
    <div>
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Your space</div>
          <h2>Account & devices</h2>
          <p>Manage your identity and choose which devices contribute to your timeline.</p>
        </div>
        <SyncBadge syncEnabled={state.settings.syncEnabled} pending={state.pendingUploadCount} />
      </header>
      <div className="account-stack">
        <Card className="profile-card">
          <div className="profile-head">
            <div className="profile-avatar" aria-hidden="true">{initials(user.email)}</div>
            <div className="profile-identity">
              <h3>{user.email.split("@")[0]}</h3>
              <p>{user.email}</p>
            </div>
            <Button variant="secondary" icon={LogOut} onClick={() => window.stopscrolling.authLogout()}>
              Sign out
            </Button>
          </div>
          <dl className="profile-facts">
            <div className="profile-fact">
              <dt>Two-factor sign-in</dt>
              <dd>
                {user.totp_enabled ? (
                  <Badge tone="success"><ShieldCheck size={11} aria-hidden="true" /> On</Badge>
                ) : (
                  <Badge><ShieldOff size={11} aria-hidden="true" /> Off</Badge>
                )}
              </dd>
            </div>
            <div className="profile-fact profile-fact-wide">
              <dt>Tracking ID</dt>
              <dd>
                <span className="profile-tracking-id" title={user.tracking_id}>{user.tracking_id}</span>
                <CopyButton value={user.tracking_id} label="Copy tracking ID" />
              </dd>
            </div>
          </dl>
        </Card>

        <Grouped
          title="Connected devices"
          description="Choose which devices appear in timelines. Removing a device hides its timeline; its time stays in your totals."
          action={<Badge>{devices.length === 1 ? "1 device" : `${devices.length} devices`}</Badge>}
        >
          {devices.length ? (
            <div className="device-grid">
              {devices.map((device) => (
                <DeviceNicknameCard
                  key={device.visibilityKey}
                  device={device}
                  color={deviceColor(device.visibilityKey, state.devices)}
                  visible={!state.hiddenDeviceKeys.includes(device.visibilityKey)}
                />
              ))}
            </div>
          ) : (
            <p className="muted">Devices appear here after your first sync.</p>
          )}
        </Grouped>
      </div>
    </div>
  );
}

function SignInCard({ auth }: { auth: AppSnapshot["auth"] }) {
  const [showPassword, setShowPassword] = useState(false);
  const signingUp = auth.formMode === "signUp";
  const passwordsDiffer = signingUp && auth.confirmPassword !== "" && auth.confirmPassword !== auth.password;
  const status = auth.statusMessage ? (
    auth.statusTone === "error"
      ? <Banner tone="danger">{auth.statusMessage}</Banner>
      : <p className="auth-hint" role="status">{auth.statusMessage}</p>
  ) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (auth.loading) return;
    if (auth.mfaChallenge) window.stopscrolling.authVerifyMfa();
    else if (signingUp) window.stopscrolling.authRegister();
    else window.stopscrolling.authLogin();
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card" elevated>
        <div className="auth-brand">
          <BrandMark />
          <div>
            <h2>{auth.mfaChallenge ? "Verify it’s you" : "Welcome to Stop Scrolling"}</h2>
            <p>{auth.mfaChallenge ? "One more step keeps your timeline secure." : "Your screen time, made intentional."}</p>
          </div>
        </div>
        {auth.mfaChallenge ? (
          <form className="form" onSubmit={submit}>
            {status}
            <TextField
              label={auth.useBackupCode ? "Backup code" : "Verification code"}
              placeholder={auth.useBackupCode ? "XXXX-XXXX" : "000000"}
              inputMode={auth.useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              value={auth.useBackupCode ? auth.backupCode : auth.mfaCode}
              onChange={(event) => window.stopscrolling.authSetForm(
                auth.useBackupCode
                  ? { backupCode: event.target.value }
                  : { mfaCode: event.target.value },
              )}
            />
            <Toggle
              label="Use a backup code"
              description="Choose this if you cannot access your authenticator."
              checked={auth.useBackupCode}
              onChange={(useBackupCode) => window.stopscrolling.authSetForm({ useBackupCode })}
            />
            <div className="form-actions">
              <Button type="submit" variant="primary" icon={ShieldCheck} disabled={auth.loading}>
                {auth.loading ? "Verifying…" : "Verify identity"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => window.stopscrolling.authResendOtp()}>Resend code</Button>
            </div>
          </form>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="auth-tabs">
              <Tabs
                ariaLabel="Account action"
                value={auth.formMode}
                onChange={(formMode) => window.stopscrolling.authSetForm({ formMode })}
                items={[
                  { value: "signIn", label: "Sign in", icon: UserRound },
                  { value: "signUp", label: "Create account", icon: Sparkles },
                ]}
              />
            </div>
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={auth.email}
              onChange={(event) => window.stopscrolling.authSetForm({ email: event.target.value })}
            />
            <div className="field">
              <label className="field-label" htmlFor="account-password">Password</label>
              <div className="password-input">
                <input
                  id="account-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  value={auth.password}
                  onChange={(event) => window.stopscrolling.authSetForm({ password: event.target.value })}
                />
                <IconButton
                  type="button"
                  label={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? EyeOff : Eye}
                  onClick={() => setShowPassword((value) => !value)}
                />
              </div>
            </div>
            {signingUp ? (
              <>
                <TextField
                  label="Confirm password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={auth.confirmPassword}
                  aria-invalid={passwordsDiffer || undefined}
                  hint={passwordsDiffer ? "Passwords don’t match yet" : undefined}
                  className={passwordsDiffer ? "is-invalid" : undefined}
                  onChange={(event) => window.stopscrolling.authSetForm({ confirmPassword: event.target.value })}
                />
                <TextField
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+15551234567"
                  hint="Optional · use international format"
                  value={auth.phoneNumber}
                  onChange={(event) => window.stopscrolling.authSetForm({ phoneNumber: event.target.value })}
                />
              </>
            ) : null}
            {status}
            <Button
              type="submit"
              variant="primary"
              icon={signingUp ? Sparkles : UserRound}
              disabled={auth.loading}
            >
              {auth.loading ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function SyncBadge({ syncEnabled, pending }: { syncEnabled: boolean; pending: number }) {
  if (!syncEnabled) return <Badge dot>Sync off</Badge>;
  if (pending > 0) return <Badge tone="warning" dot>{pending.toLocaleString()} waiting to sync</Badge>;
  return <Badge tone="success" dot>Synced</Badge>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <IconButton
      className="profile-copy"
      label={copied ? "Copied" : label}
      icon={copied ? Check : Copy}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {});
      }}
    />
  );
}

function DeviceNicknameCard({
  device,
  color,
  visible,
}: {
  device: DeviceListEntry;
  /** The device's timeline color, so the card matches its line in Today and Calendar. */
  color: string;
  visible: boolean;
}) {
  const displayName = deviceDisplayName(device.devicePlatform, device.deviceName, device.nickname);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(device.nickname || displayName);

  useEffect(() => {
    if (!editing) setDraft(device.nickname || displayName);
  }, [device.nickname, displayName, editing]);

  function save() {
    const next = draft.trim();
    const current = device.nickname.trim();
    if (device.deviceID && next !== current && !(current === "" && next === device.deviceName)) {
      window.stopscrolling.setDeviceNickname(device.deviceID, next);
    }
    setEditing(false);
  }

  const sessions = `${device.sessionCount.toLocaleString()} ${device.sessionCount === 1 ? "session" : "sessions"}`;
  const subtitle = [device.nickname.trim() ? device.deviceName : "", platformLabel(device.devicePlatform), sessions]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={["device-card", visible ? "" : "is-hidden", confirmingDelete ? "is-confirming" : ""].filter(Boolean).join(" ")}
      style={{ "--device-tint": color } as CSSProperties}
    >
      <div className="device-card-top">
        <span className="device-icon">
          {device.devicePlatform === "windows" ? <MonitorSmartphone size={16} /> : <Laptop2 size={16} />}
        </span>
        {editing ? (
          <TextField
            className="device-nickname-field"
            label="Nickname"
            value={draft}
            maxLength={128}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(device.nickname || displayName);
                setEditing(false);
              }
            }}
          />
        ) : (
          <>
            <span className="row-copy">
              <span className="device-card-title-row">
                <span className="row-title">{displayName}</span>
                {device.isLocal ? <Badge tone="accent">This device</Badge> : null}
                {visible ? null : <Badge>Hidden</Badge>}
              </span>
              <span className="row-subtitle">{subtitle}</span>
              <span className="device-status">
                <span className={`dot ${device.isOnline ? "online" : ""}`} aria-hidden="true" />
                <span>{device.isOnline ? "Online now" : lastSeenLabel(device.lastSeenAt)}</span>
              </span>
            </span>
            <span className="device-card-actions">
              {device.deviceID ? (
                <IconButton
                  className="device-nickname-edit"
                  label={`Rename ${displayName}`}
                  icon={Pencil}
                  onClick={() => setEditing(true)}
                />
              ) : null}
              {device.deviceID && !device.isLocal ? (
                <IconButton
                  className="device-delete"
                  label={`Remove ${displayName}`}
                  icon={Trash2}
                  onClick={() => setConfirmingDelete(true)}
                />
              ) : null}
            </span>
          </>
        )}
      </div>
      {confirmingDelete ? (
        <div className="device-delete-confirm" role="alertdialog" aria-label={`Remove ${displayName}`}>
          <p>Remove {displayName} from this account? Its timeline disappears. Recorded screen time stays in your totals.</p>
          <div className="device-delete-actions">
            <Button size="sm" variant="ghost" autoFocus onClick={() => setConfirmingDelete(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (device.deviceID) window.stopscrolling.deleteDevice(device.deviceID);
                setConfirmingDelete(false);
              }}
            >
              Remove device
            </Button>
          </div>
        </div>
      ) : (
        <Toggle
          label="Show in timelines"
          description={visible ? "Appears in Today and Calendar" : "Hidden from timelines"}
          checked={visible}
          onChange={(nextVisible) => window.stopscrolling.setDeviceVisible(device.visibilityKey, nextVisible)}
        />
      )}
    </div>
  );
}

/** Devices shown in timelines first, then this computer, then devices that are online, then by name. */
function sortedDevices(devices: DeviceListEntry[], hiddenKeys: string[]) {
  const shown = (device: DeviceListEntry) => Number(!hiddenKeys.includes(device.visibilityKey));
  return [...devices].sort((a, b) =>
    shown(b) - shown(a)
    || Number(Boolean(b.isLocal)) - Number(Boolean(a.isLocal))
    || Number(b.isOnline) - Number(a.isOnline)
    || deviceDisplayName(a.devicePlatform, a.deviceName, a.nickname)
      .localeCompare(deviceDisplayName(b.devicePlatform, b.deviceName, b.nickname)));
}

const PLATFORM_LABELS: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  ipados: "iPadOS",
  android: "Android",
  watchos: "watchOS",
};

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform.toLowerCase()] ?? (platform ? platform[0].toUpperCase() + platform.slice(1) : "Unknown");
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["minute", 60],
  ["hour", 60],
  ["day", 24],
  ["week", 7],
  ["month", 4.35],
  ["year", 12],
];

export function lastSeenLabel(lastSeenAt: string | null, now = Date.now()) {
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return "Offline";
  let value = Math.max(0, (now - seen) / 60_000);
  if (value < 1) return "Last seen just now";
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  for (let index = 1; index < RELATIVE_STEPS.length && value >= RELATIVE_STEPS[index][1]; index += 1) {
    value /= RELATIVE_STEPS[index][1];
    unit = RELATIVE_STEPS[index][0];
  }
  return `Last seen ${new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-Math.floor(value), unit)}`;
}

function initials(value: string) {
  return value.split(/[@._-]+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS";
}

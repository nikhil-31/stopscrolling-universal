import { useEffect, useState } from "react";
import { deviceDisplayName } from "@shared/device";
import type { AppSnapshot } from "@shared/snapshot";
import type { DeviceListEntry } from "@shared/types";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Laptop2,
  LogOut,
  MonitorSmartphone,
  Pencil,
  ShieldCheck,
  Trash2,
  Sparkles,
  UserRound,
} from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  if (!auth.user) {
    return (
      <div className="auth-shell">
        <Card className="auth-card" elevated>
          <div className="auth-brand">
            <span className="brand-mark"><Sparkles size={20} aria-hidden="true" /></span>
            <div>
              <h2>{auth.mfaChallenge ? "Verify it’s you" : "Welcome to Stop Scrolling"}</h2>
              <p>{auth.mfaChallenge ? "One more step keeps your timeline secure." : "Your screen time, made intentional."}</p>
            </div>
          </div>
          {auth.mfaChallenge ? (
            <div className="form">
              <Banner>{auth.statusMessage}</Banner>
              <TextField
                label={auth.useBackupCode ? "Backup code" : "Verification code"}
                placeholder={auth.useBackupCode ? "XXXX-XXXX" : "000000"}
                inputMode={auth.useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
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
                <Button
                  variant="primary"
                  icon={ShieldCheck}
                  disabled={auth.loading}
                  onClick={() => window.stopscrolling.authVerifyMfa()}
                >
                  Verify identity
                </Button>
                <Button variant="ghost" onClick={() => window.stopscrolling.authResendOtp()}>Resend code</Button>
              </div>
            </div>
          ) : (
            <div className="form">
              <Tabs
                ariaLabel="Account action"
                value={auth.formMode}
                onChange={(formMode) => window.stopscrolling.authSetForm({ formMode })}
                items={[
                  { value: "signIn", label: "Sign in", icon: UserRound },
                  { value: "signUp", label: "Create account", icon: Sparkles },
                ]}
              />
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
                <div style={{ position: "relative" }}>
                  <input
                    id="account-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={auth.formMode === "signIn" ? "current-password" : "new-password"}
                    placeholder="At least 8 characters"
                    value={auth.password}
                    onChange={(event) => window.stopscrolling.authSetForm({ password: event.target.value })}
                    style={{ paddingRight: 42 }}
                  />
                  <IconButton
                    label={showPassword ? "Hide password" : "Show password"}
                    icon={showPassword ? EyeOff : Eye}
                    onClick={() => setShowPassword((value) => !value)}
                    style={{ position: "absolute", right: 2, top: 2 }}
                  />
                </div>
              </div>
              {auth.formMode === "signUp" ? (
                <>
                  <TextField
                    label="Confirm password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={auth.confirmPassword}
                    onChange={(event) => window.stopscrolling.authSetForm({ confirmPassword: event.target.value })}
                  />
                  <TextField
                    label="Phone number"
                    placeholder="+15551234567"
                    hint="Optional · use international format"
                    value={auth.phoneNumber}
                    onChange={(event) => window.stopscrolling.authSetForm({ phoneNumber: event.target.value })}
                  />
                </>
              ) : null}
              {auth.statusMessage ? <p className="small muted" role="status">{auth.statusMessage}</p> : null}
              <Button
                variant="primary"
                icon={auth.formMode === "signIn" ? UserRound : Sparkles}
                disabled={auth.loading}
                onClick={() => auth.formMode === "signIn"
                  ? window.stopscrolling.authLogin()
                  : window.stopscrolling.authRegister()}
              >
                {auth.loading ? "Please wait…" : auth.formMode === "signIn" ? "Sign in" : "Create account"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Your space</div>
          <h2>Account & devices</h2>
          <p>Manage your identity and choose which devices contribute to your timeline.</p>
        </div>
        <Badge tone="success" dot>Synced</Badge>
      </header>
      <div className="account-layout">
        <Card className="profile-card">
          <div className="profile-avatar">{initials(auth.user.email)}</div>
          <h3>{auth.user.email.split("@")[0]}</h3>
          <p className="small muted">{auth.user.email}</p>
          <div className="inspector-meta">
            <Badge tone="success"><CheckCircle2 size={11} aria-hidden="true" /> Signed in</Badge>
            {auth.user.totp_enabled ? <Badge tone="accent"><ShieldCheck size={11} aria-hidden="true" /> MFA</Badge> : null}
          </div>
          <div className="path-row" title={auth.user.tracking_id}>
            <span className="path-value">{auth.user.tracking_id}</span>
          </div>
          <Button variant="ghost" icon={LogOut} onClick={() => window.stopscrolling.authLogout()}>
            Sign out
          </Button>
        </Card>

        <Grouped
          title="Connected devices"
          description="Choose which devices appear in timelines, or remove one from this account"
          action={<Badge>{state.devices.length} devices</Badge>}
        >
          <div className="device-grid">
            {state.devices.map((device) => (
              <DeviceNicknameCard
                key={device.visibilityKey}
                device={device}
                visible={!state.hiddenDeviceKeys.includes(device.visibilityKey)}
              />
            ))}
          </div>
          {!state.devices.length ? <p className="muted">Devices appear here after your first sync.</p> : null}
        </Grouped>
      </div>
    </div>
  );
}

function DeviceNicknameCard({
  device,
  visible,
}: {
  device: DeviceListEntry;
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

  const subtitle = device.nickname.trim()
    ? `${device.deviceName} · ${device.devicePlatform} · ${device.sessionCount} sessions`
    : `${device.devicePlatform} · ${device.sessionCount} sessions`;

  return (
    <div className="device-card">
      <div className="device-card-top">
        <span className="device-icon">
          {device.devicePlatform === "windows" ? <MonitorSmartphone size={15} /> : <Laptop2 size={15} />}
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
          <span className="row-copy">
            <span className="device-card-title-row">
              <span className="row-title">{displayName}</span>
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
            <span className="row-subtitle">{subtitle}</span>
          </span>
        )}
        <span className={`dot ${device.isOnline ? "online" : ""}`} title={device.isOnline ? "Online" : "Offline"} />
      </div>
      {confirmingDelete ? (
        <div className="device-delete-confirm">
          <p>Remove {displayName} from this account? Its timeline disappears. Recorded screen time stays in your totals.</p>
          <div className="device-delete-actions">
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
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
          checked={visible}
          onChange={(nextVisible) => window.stopscrolling.setDeviceVisible(device.visibilityKey, nextVisible)}
        />
      )}
    </div>
  );
}

function initials(value: string) {
  return value.split(/[@._-]+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS";
}

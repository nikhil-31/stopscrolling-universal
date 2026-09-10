import { useState } from "react";
import type { AppSnapshot } from "@shared/snapshot";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Laptop2,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
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
          description="Choose which devices appear in timeline views"
          action={<Badge>{state.devices.length} devices</Badge>}
        >
          <div className="device-grid">
            {state.devices.map((device) => (
              <div className="device-card" key={device.visibilityKey}>
                <div className="device-card-top">
                  <span className="device-icon">
                    {device.devicePlatform === "windows" ? <MonitorSmartphone size={15} /> : <Laptop2 size={15} />}
                  </span>
                  <span className="row-copy">
                    <span className="row-title">{device.deviceName}</span>
                    <span className="row-subtitle">{device.devicePlatform} · {device.sessionCount} sessions</span>
                  </span>
                  <span className={`dot ${device.isOnline ? "online" : ""}`} title={device.isOnline ? "Online" : "Offline"} />
                </div>
                <Toggle
                  label="Show in timelines"
                  checked={!state.hiddenDeviceKeys.includes(device.visibilityKey)}
                  onChange={(visible) => window.stopscrolling.setDeviceVisible(device.visibilityKey, visible)}
                />
              </div>
            ))}
          </div>
          {!state.devices.length ? <p className="muted">Devices appear here after your first sync.</p> : null}
        </Grouped>
      </div>
    </div>
  );
}

function initials(value: string) {
  return value.split(/[@._-]+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS";
}

import { app } from "electron";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir, hostname } from "node:os";

export function userDataDir() {
  return app.getPath("userData");
}

export function settingsPath() {
  return join(userDataDir(), "app-settings.json");
}

export function desktopWidgetBoundsPath() {
  return join(userDataDir(), "desktop-widget-bounds.json");
}

export function calendarWorkspacePath() {
  return join(userDataDir(), "calendar-workspace.json");
}

export function calendarWorkspaceSyncPath() {
  return join(userDataDir(), "calendar-workspace.sync.json");
}

export function timesheetSummariesPath() {
  return join(userDataDir(), "timesheet-summaries.json");
}

export function tokensPath() {
  return join(userDataDir(), "auth-tokens.dat");
}

export function sessionUserPath() {
  return join(userDataDir(), "auth-user.json");
}

export function outboxPath() {
  return join(userDataDir(), "pending-api-events.bin");
}

export function outboxKeyPath() {
  return join(userDataDir(), "outbox.key");
}

export function historyDir() {
  return join(userDataDir(), "session-history");
}

export function historyKeyPath() {
  return join(userDataDir(), "session-history.key");
}

export function checkpointPath() {
  return join(userDataDir(), "open-session.json");
}

export function hiddenDevicesPath() {
  return join(userDataDir(), "hidden-devices.json");
}

export function devicesCachePath() {
  return join(userDataDir(), "devices.json");
}

export function localDeviceIdPath() {
  return join(userDataDir(), "local-device-id.txt");
}

/** Google tokens older versions kept on this device; Google Calendar now links through the server. */
export function legacyGoogleTokensPath() {
  return join(userDataDir(), "google-calendar.dat");
}

export function gameMatchPath() {
  return join(userDataDir(), "game-matches.json");
}

export function gameAssetPath() {
  return join(userDataDir(), "game-assets");
}

export function networkLogPath() {
  return join(userDataDir(), "network.log");
}

export function observabilityLogPath() {
  return join(userDataDir(), "observability.log");
}

export function crashLogPath() {
  return join(userDataDir(), "crash.log");
}

export function jevCategoriesPath() {
  return join(userDataDir(), "jev-categories.json");
}

export function jevProductivityPath() {
  return join(userDataDir(), "jev-productivity.json");
}

export function typesafeKeyPath() {
  return join(userDataDir(), "typesafe-api-key.dat");
}

export function deviceName() {
  return hostname() || homedir().split("/").filter(Boolean).pop() || "Desktop";
}

let cachedComputerName: string | null = null;

/** The name shown in the device picker, such as the Mac computer name. */
export function localComputerName() {
  if (cachedComputerName !== null) return cachedComputerName;
  cachedComputerName = "";
  if (process.platform === "darwin") {
    try {
      cachedComputerName = execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], { encoding: "utf8" }).trim();
    } catch {
      cachedComputerName = "";
    }
  }
  return cachedComputerName;
}

import { app } from "electron";
import { join } from "node:path";
import { homedir, hostname } from "node:os";

export function userDataDir() {
  return app.getPath("userData");
}

export function settingsPath() {
  return join(userDataDir(), "app-settings.json");
}

export function calendarWorkspacePath() {
  return join(userDataDir(), "calendar-workspace.json");
}

export function tokensPath() {
  return join(userDataDir(), "auth-tokens.dat");
}

export function outboxPath() {
  return join(userDataDir(), "pending-api-events.bin");
}

export function outboxKeyPath() {
  return join(userDataDir(), "outbox.key");
}

export function checkpointPath() {
  return join(userDataDir(), "open-session.json");
}

export function hiddenDevicesPath() {
  return join(userDataDir(), "hidden-devices.json");
}

export function localDeviceIdPath() {
  return join(userDataDir(), "local-device-id.txt");
}

export function googleTokensPath() {
  return join(userDataDir(), "google-calendar.dat");
}

export function networkLogPath() {
  return join(userDataDir(), "network.log");
}

export function observabilityLogPath() {
  return join(userDataDir(), "observability.log");
}

export function jevCategoriesPath() {
  return join(userDataDir(), "jev-categories.json");
}

export function typesafeKeyPath() {
  return join(userDataDir(), "typesafe-api-key.dat");
}

export function deviceName() {
  return hostname() || homedir().split("/").filter(Boolean).pop() || "Desktop";
}

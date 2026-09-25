import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings } from "@shared/types";
import { settingsPath } from "./paths";

export const defaultSettings = (): AppSettings => ({
  startScreenTimeOnLaunch: true,
  appearance: "system",
  clockFormat: "24",
  apiBaseUrl: "http://localhost",
  syncEnabled: true,
  showGoogleCalendarEvents: false,
  googleClientId: "",
  dailyWorkTargetSeconds: 8 * 60 * 60,
  timerBonusSeconds: 0,
  timerBonusDay: "",
});

export function loadSettings(): AppSettings {
  try {
    if (!existsSync(settingsPath())) return defaultSettings();
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<AppSettings>;
    const settings = { ...defaultSettings(), ...parsed };
    settings.clockFormat = settings.clockFormat === "12" ? "12" : "24";
    return settings;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings) {
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

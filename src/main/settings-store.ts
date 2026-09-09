import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings } from "@shared/types";
import { settingsPath } from "./paths";

export const defaultSettings = (): AppSettings => ({
  startScreenTimeOnLaunch: true,
  appearance: "system",
  apiBaseUrl: "http://localhost",
  syncEnabled: true,
  showGoogleCalendarEvents: false,
  googleClientId: "",
  dailyWorkTargetSeconds: 8 * 60 * 60,
});

export function loadSettings(): AppSettings {
  try {
    if (!existsSync(settingsPath())) return defaultSettings();
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<AppSettings>;
    return { ...defaultSettings(), ...parsed };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings) {
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

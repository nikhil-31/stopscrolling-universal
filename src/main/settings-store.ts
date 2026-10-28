import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings } from "@shared/types";
import { settingsPath } from "./paths";

export const defaultSettings = (): AppSettings => ({
  startScreenTimeOnLaunch: true,
  launchAtLogin: true,
  appearance: "system",
  clockFormat: "24",
  apiBaseUrl: "http://localhost",
  syncEnabled: true,
  showCalendarEvents: false,
  appleCalendarIds: null,
  dailyWorkTargetSeconds: 8 * 60 * 60,
  timerBonusSeconds: 0,
  timerBonusDay: "",
  agentSendTitles: true,
  distractionResponse: "popup",
  desktopWidgetVisible: true,
});

/** Settings older versions saved, from when Google Calendar was linked on this device. */
interface LegacySettings {
  showGoogleCalendarEvents?: boolean;
  googleClientId?: string;
}

export function loadSettings(): AppSettings {
  try {
    if (!existsSync(settingsPath())) return defaultSettings();
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<AppSettings> & LegacySettings;
    const { showGoogleCalendarEvents, googleClientId: _googleClientId, ...current } = parsed;
    const settings = { ...defaultSettings(), ...current };
    if (current.showCalendarEvents === undefined && showGoogleCalendarEvents !== undefined) {
      settings.showCalendarEvents = showGoogleCalendarEvents;
    }
    settings.appleCalendarIds = Array.isArray(settings.appleCalendarIds)
      ? settings.appleCalendarIds.filter((id) => typeof id === "string")
      : null;
    settings.clockFormat = settings.clockFormat === "12" ? "12" : "24";
    const response = settings.distractionResponse as string;
    settings.distractionResponse = response === "off"
      ? "off"
      : response === "block" || response === "screen" || response === "both"
        ? "block"
        : "popup";
    settings.desktopWidgetVisible = settings.desktopWidgetVisible !== false;
    return settings;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings) {
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

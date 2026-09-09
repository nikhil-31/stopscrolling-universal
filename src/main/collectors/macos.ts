import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { systemPreferences } from "electron";
import { looksLikeBrowser } from "@shared/browser";
import type { ActivityCollector, ActivitySnapshot } from "./types";

const execFileAsync = promisify(execFile);

async function osascript(script: string) {
  const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2500 });
  return stdout.trim();
}

const BROWSER_URL_SCRIPTS: Record<string, string> = {
  safari: 'tell application "Safari" to get URL of current tab of front window',
  chrome: 'tell application "Google Chrome" to get URL of active tab of front window',
  "google chrome": 'tell application "Google Chrome" to get URL of active tab of front window',
  "microsoft edge": 'tell application "Microsoft Edge" to get URL of active tab of front window',
  brave: 'tell application "Brave Browser" to get URL of active tab of front window',
  "brave browser": 'tell application "Brave Browser" to get URL of active tab of front window',
  arc: 'tell application "Arc" to get URL of active tab of front window',
  vivaldi: 'tell application "Vivaldi" to get URL of active tab of front window',
  firefox: 'tell application "Firefox" to get URL of active tab of front window',
};

export class MacCollector implements ActivityCollector {
  async start() {
    this.requestPermission();
  }

  async stop() {}

  requestPermission() {
    try {
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      return false;
    }
  }

  capabilities() {
    const granted = (() => {
      try {
        return systemPreferences.isTrustedAccessibilityClient(false);
      } catch {
        return false;
      }
    })();
    return {
      platform: "macos" as const,
      accessibilityGranted: granted,
      urlCaptureSupported: true,
      urlCaptureNote: granted
        ? "Browser URLs are read from the frontmost window."
        : "Grant Accessibility to capture browser URLs and window titles.",
      waylandLimited: false,
    };
  }

  async sample(): Promise<ActivitySnapshot | null> {
    try {
      const raw = await osascript(`
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set bundleId to bundle identifier of frontApp
          set winTitle to ""
          try
            set winTitle to name of front window of frontApp
          end try
          return appName & "|||" & bundleId & "|||" & winTitle
        end tell
      `);
      const [appName, bundleID, title] = raw.split("|||");
      let url = "";
      if (looksLikeBrowser(bundleID) || looksLikeBrowser(appName)) {
        const script = BROWSER_URL_SCRIPTS[appName?.toLowerCase() ?? ""];
        if (script) {
          try {
            url = await osascript(script);
          } catch {
            url = "";
          }
        }
      }
      return {
        appName: appName || "Unknown",
        bundleID: bundleID || appName || "unknown",
        title: title || appName || "",
        url,
      };
    } catch {
      return null;
    }
  }
}

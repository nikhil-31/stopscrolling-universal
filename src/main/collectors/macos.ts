import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { systemPreferences } from "electron";
import {
  browserKind,
  extractUrlFromText,
  looksLikeBrowser,
  normalizeCapturedUrl,
  parseBrowserTabResult,
} from "@shared/browser";
import type { ActivityCollector, ActivitySnapshot } from "./types";

const execFileAsync = promisify(execFile);

async function osascript(script: string, timeout = 1800) {
  const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout });
  return stdout.trim();
}

function quoteAppleScript(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tabScript(kind: "safari" | "chromium", specifier: string) {
  if (kind === "safari") {
    return `tell application ${specifier}
  if (count of windows) is 0 then return "|||"
  return (name of current tab of front window) & "|||" & (URL of current tab of front window)
end tell`;
  }
  return `tell application ${specifier}
  if (count of windows) is 0 then return "|||"
  return (title of active tab of front window) & "|||" & (URL of active tab of front window)
end tell`;
}

async function captureBrowserTab(appName: string, bundleID: string, windowTitle: string) {
  const kind = browserKind(appName, bundleID);
  if (!kind) return { title: windowTitle, url: extractUrlFromText(windowTitle) };

  if (kind !== "firefox") {
    const specifiers = [
      bundleID ? `id ${quoteAppleScript(bundleID)}` : "",
      quoteAppleScript(appName),
    ].filter(Boolean);
    for (const specifier of specifiers) {
      try {
        const parsed = parseBrowserTabResult(await osascript(tabScript(kind, specifier)));
        if (parsed.url) return { title: parsed.title || windowTitle, url: parsed.url };
      } catch {
        /* try the next source */
      }
    }
  }

  try {
    const axUrl = normalizeCapturedUrl(
      await osascript(`tell application "System Events"
  tell (first application process whose frontmost is true)
    try
      return value of attribute "AXDocument" of front window
    on error
      return ""
    end try
  end tell
end tell`),
    );
    if (axUrl) return { title: windowTitle, url: axUrl };
  } catch {
    /* Accessibility document URL is best-effort */
  }

  return { title: windowTitle, url: extractUrlFromText(windowTitle) };
}

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
        ? "Browser tab titles and URLs are read from the frontmost window."
        : "Grant Accessibility so Stop Scrolling can record browser tabs and window titles. Approve Automation when macOS asks for Chrome, Safari, or Edge.",
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
      const snapshot = {
        appName: appName || "Unknown",
        bundleID: bundleID || appName || "unknown",
        title: title || appName || "",
        url: "",
      };
      if (looksLikeBrowser(snapshot.bundleID) || looksLikeBrowser(snapshot.appName)) {
        const tab = await captureBrowserTab(snapshot.appName, snapshot.bundleID, snapshot.title);
        snapshot.title = tab.title || snapshot.title;
        snapshot.url = tab.url;
      }
      return snapshot;
    } catch {
      return null;
    }
  }
}

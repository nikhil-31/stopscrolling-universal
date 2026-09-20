import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  browserKind,
  browserTitleScripts,
  browserUrlScripts,
  extractUrlFromText,
  looksLikeBrowser,
  normalizeCapturedUrl,
  scriptingAppName,
} from "@shared/browser";
import { logObservability } from "../logger";
import { readBrowserContext } from "./ax-browser";
import { isAccessibilityGranted, requestAccessibilityAccess } from "./macos-accessibility";
import type { ActivityCollector, ActivitySnapshot } from "./types";

const execFileAsync = promisify(execFile);

async function osascript(script: string, timeout = 1800) {
  const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout });
  return stdout.trim();
}

function quoteAppleScript(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function firstPlain(scripts: string[]) {
  for (const script of scripts) {
    try {
      const value = (await osascript(script, 2500)).trim();
      if (value && !/^(missing value|null|undefined|none)$/i.test(value)) return value;
    } catch {
      /* try the next source */
    }
  }
  return "";
}

async function firstUrl(scripts: string[]) {
  for (const script of scripts) {
    try {
      const url = normalizeCapturedUrl(await osascript(script, 2500));
      if (url) return url;
    } catch {
      /* try the next source */
    }
  }
  return "";
}

async function captureAxUrl() {
  if (!isAccessibilityGranted()) return "";
  try {
    return normalizeCapturedUrl(
      await osascript(`tell application "System Events"
  tell (first application process whose frontmost is true)
    tell front window
      try
        set doc to value of attribute "AXDocument"
        if doc is not missing value and doc is not "" then return doc as text
      end try
      try
        set u to value of attribute "AXURL"
        if u is not missing value and u is not "" then return u as text
      end try
    end tell
    try
      set focused to value of attribute "AXFocusedUIElement"
      set v to value of focused
      if (v as text) starts with "http" then return v as text
    end try
    try
      tell toolbar 1 of front window
        repeat with tf in text fields
          set v to value of tf
          if (v as text) starts with "http" then return v as text
        end repeat
        repeat with g in groups
          repeat with tf in text fields of g
            set v to value of tf
            if (v as text) starts with "http" then return v as text
          end repeat
        end repeat
      end tell
    end try
  end tell
end tell`),
    );
  } catch {
    return "";
  }
}

async function captureBrowserTab(appName: string, bundleID: string, windowTitle: string, pid = 0) {
  const kind = browserKind(appName, bundleID);
  if (!kind) return { title: windowTitle, url: extractUrlFromText(windowTitle) };

  const ax = pid ? readBrowserContext(pid) : { title: "", url: "" };
  if (ax.url) {
    return { title: ax.title || windowTitle, url: ax.url };
  }

  const scriptName = scriptingAppName(appName, bundleID);
  const specifiers = [
    scriptName ? quoteAppleScript(scriptName) : "",
    bundleID ? `id ${quoteAppleScript(bundleID)}` : "",
    quoteAppleScript(appName),
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  let url = "";
  let title = "";
  for (const specifier of specifiers) {
    if (!url) url = await firstUrl(browserUrlScripts(kind, specifier));
    if (!title) {
      const rawTitle = await firstPlain(browserTitleScripts(kind, specifier));
      if (rawTitle && !normalizeCapturedUrl(rawTitle)) title = rawTitle;
    }
    if (url) break;
  }

  if (!url) url = await captureAxUrl();
  if (!url) url = extractUrlFromText(windowTitle);

  return { title: title || ax.title || windowTitle, url };
}

export class MacCollector implements ActivityCollector {
  async start() {
    if (!isAccessibilityGranted()) {
      logObservability("accessibility_not_granted");
    }
  }

  async stop() {}

  requestPermission() {
    return requestAccessibilityAccess();
  }

  capabilities() {
    const granted = isAccessibilityGranted();
    return {
      platform: "macos" as const,
      accessibilityGranted: granted,
      urlCaptureSupported: true,
      urlCaptureNote: granted
        ? "Accessibility is granted. Browser tab titles and URLs are read from the frontmost window."
        : "Grant Accessibility so Stop Scrolling can record browser tabs and window titles. Approve Automation when macOS asks for Chrome, Safari, or Edge.",
      waylandLimited: false,
    };
  }

  async sample(): Promise<ActivitySnapshot | null> {
    if (!isAccessibilityGranted()) return null;
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
          return appName & "|||" & bundleId & "|||" & winTitle & "|||" & (unix id of frontApp as text)
        end tell
      `);
      const [appName, bundleID, title, pid] = raw.split("|||");
      const snapshot = {
        appName: appName || "Unknown",
        bundleID: bundleID || appName || "unknown",
        title: title || appName || "",
        url: "",
      };
      if (looksLikeBrowser(snapshot.bundleID) || looksLikeBrowser(snapshot.appName)) {
        const tab = await captureBrowserTab(snapshot.appName, snapshot.bundleID, snapshot.title, Number(pid) || 0);
        snapshot.title = tab.title || snapshot.title;
        snapshot.url = tab.url;
      }
      return snapshot;
    } catch {
      return null;
    }
  }
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { browserKind, scriptingAppName, type BrowserKind } from "@shared/browser";
import { freedomPageUrl } from "./freedom-page";

const execFileAsync = promisify(execFile);

function quoteAppleScript(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isProtectedProcess(appName: string, bundleID: string) {
  const haystack = `${appName} ${bundleID}`.toLowerCase();
  return haystack.includes("stop scrolling")
    || haystack.includes("stopscrolling")
    || haystack.includes("electron")
    || bundleID === "com.stopscrolling.desktop";
}

async function osascript(script: string) {
  await execFileAsync("osascript", ["-e", script], { timeout: 2500 });
}

/** AppleScript that replaces the front tab with the freedom page. */
export function blockedTabScript(kind: BrowserKind, appName: string, pageUrl: string) {
  const spec = quoteAppleScript(appName);
  const url = quoteAppleScript(pageUrl);
  const tab = kind === "safari" ? "current tab" : "active tab";
  return `tell application ${spec} to set URL of ${tab} of front window to ${url}`;
}

/** Leave the blocked site. The browser itself stays open. */
export async function closeBlockedWebsite(appName: string, bundleID: string) {
  if (process.platform !== "darwin") return;
  const kind = browserKind(appName, bundleID);
  const name = scriptingAppName(appName, bundleID);
  if (!kind || !name) return;
  await osascript(blockedTabScript(kind, name, await freedomPageUrl()));
}

/** Quit a blocked app. Stop Scrolling itself is never a target. */
export async function quitBlockedApp(appName: string, bundleID: string) {
  if (isProtectedProcess(appName, bundleID)) return;
  if (process.platform !== "darwin") return;
  const scripts = [
    bundleID.includes(".") ? `tell application id ${quoteAppleScript(bundleID)} to quit` : "",
    appName ? `tell application ${quoteAppleScript(appName)} to quit` : "",
  ].filter(Boolean);
  let last: unknown;
  for (const script of scripts) {
    try {
      await osascript(script);
      return;
    } catch (error) {
      last = error;
    }
  }
  if (last) throw last;
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { domainMatches } from "@shared/blocking-match";
import { browserKind, scriptingAppName, websiteHostname, type BrowserKind } from "@shared/browser";
import { quitFocusedApp, typeFocusedOmnibox } from "../collectors/ax-browser";
import { logObservability } from "../logger";
import { freedomPageUrl } from "./freedom-page";

const execFileAsync = promisify(execFile);
const TAB_SEPARATOR = "\u001f";

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

async function osascript(script: string, timeout = 8000) {
  const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout });
  return stdout.trim();
}

/** AppleScript that replaces the front tab with the freedom page. */
export function blockedTabScript(kind: BrowserKind, appName: string, pageUrl: string) {
  const spec = quoteAppleScript(appName);
  const url = quoteAppleScript(pageUrl);
  const tab = kind === "safari" ? "current tab" : "active tab";
  return `tell application ${spec} to set URL of ${tab} of front window to ${url}`;
}

/** Lists every tab of every window as `windowIndex<US>tabIndex<US>url` lines. */
export function listTabsScript(appName: string) {
  const spec = quoteAppleScript(appName);
  return `tell application ${spec}
  set rows to {}
  set wi to 1
  repeat with w in windows
    set ti to 1
    repeat with t in tabs of w
      set end of rows to (wi as text) & (ASCII character 31) & (ti as text) & (ASCII character 31) & (URL of t as text)
      set ti to ti + 1
    end repeat
    set wi to wi + 1
  end repeat
  set AppleScript's text item delimiters to linefeed
  set rendered to rows as text
  set AppleScript's text item delimiters to ""
  return rendered
end tell`;
}

export function setTabsScript(
  appName: string,
  tabs: Array<{ windowIndex: number; tabIndex: number }>,
  pageUrl: string,
) {
  const spec = quoteAppleScript(appName);
  const url = quoteAppleScript(pageUrl);
  const lines = tabs.map((tab) => `set URL of tab ${tab.tabIndex} of window ${tab.windowIndex} to ${url}`);
  return `tell application ${spec}\n${lines.join("\n")}\nend tell`;
}

/** Tabs whose host matches one of the blocked sites. */
export function matchingTabs(listing: string, hosts: string[]) {
  const matches: Array<{ windowIndex: number; tabIndex: number }> = [];
  for (const line of listing.split(/\r?\n/)) {
    const [windowText, tabText, url] = line.split(TAB_SEPARATOR);
    const windowIndex = Number(windowText);
    const tabIndex = Number(tabText);
    if (!Number.isInteger(windowIndex) || !Number.isInteger(tabIndex) || windowIndex < 1 || tabIndex < 1 || !url) continue;
    const host = websiteHostname(url);
    if (hosts.some((blocked) => domainMatches(host, blocked))) matches.push({ windowIndex, tabIndex });
  }
  return matches;
}

async function redirectMatchingTabs(kind: BrowserKind, name: string, pageUrl: string, hosts: string[]) {
  if (kind === "firefox") {
    await osascript(blockedTabScript(kind, name, pageUrl));
    return;
  }
  const listing = await osascript(listTabsScript(name));
  const tabs = matchingTabs(listing, hosts);
  if (!tabs.length) {
    await osascript(blockedTabScript(kind, name, pageUrl));
    return;
  }
  await osascript(setTabsScript(name, tabs, pageUrl));
}

/** Leave every matching tab. The browser itself stays open. */
export async function closeBlockedWebsite(appName: string, bundleID: string, hosts: string[] = []) {
  if (process.platform !== "darwin") return;
  const kind = browserKind(appName, bundleID);
  const name = scriptingAppName(appName, bundleID);
  if (!kind || !name) return;
  const pageUrl = await freedomPageUrl();
  try {
    await redirectMatchingTabs(kind, name, pageUrl, hosts);
  } catch (error) {
    if (!(await typeFocusedOmnibox(pageUrl))) throw error;
    logObservability("Apple Events were denied. Accessibility moved the front tab. Other tabs of this site still need Automation.");
  }
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
  if (quitFocusedApp()) return;
  if (last) throw last;
}

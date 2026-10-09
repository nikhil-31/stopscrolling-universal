import { describe, expect, it } from "vitest";
import { isQuitMenuItem } from "../collectors/ax-browser";
import { blockedTabScript, listTabsScript, matchingTabs, setTabsScript } from "./local-actions";

describe("blocked tab script", () => {
  const page = "http://127.0.0.1:43123/";

  it("points Safari, Chrome, and Firefox at the freedom page", () => {
    expect(blockedTabScript("safari", "Safari", page)).toBe(
      `tell application "Safari" to set URL of current tab of front window to "${page}"`,
    );
    expect(blockedTabScript("chromium", "Google Chrome", page)).toContain(`to "${page}"`);
    expect(blockedTabScript("firefox", "Firefox", page)).toBe(
      `tell application "Firefox" to set URL of active tab of front window to "${page}"`,
    );
    expect(blockedTabScript("firefox", "Firefox", page)).not.toContain("close active tab");
  });

  it("visits every Chrome and Safari tab and keeps only blocked hosts", () => {
    const chrome = listTabsScript("Google Chrome");
    const safari = listTabsScript("Safari");
    for (const script of [chrome, safari]) {
      expect(script).toContain("repeat with w in windows");
      expect(script).toContain("repeat with t in tabs of w");
    }
    const listing = [
      `1\u001f1\u001fhttps://www.instagram.com/`,
      `1\u001f2\u001fhttps://example.com/`,
      `2\u001f1\u001fhttps://news.instagram.com/p/1`,
    ].join("\n");
    const tabs = matchingTabs(listing, ["instagram.com"]);
    expect(tabs).toEqual([
      { windowIndex: 1, tabIndex: 1 },
      { windowIndex: 2, tabIndex: 1 },
    ]);
    expect(setTabsScript("Google Chrome", tabs, page)).toContain(`set URL of tab 1 of window 1 to "${page}"`);
    expect(setTabsScript("Google Chrome", tabs, page)).toContain(`set URL of tab 1 of window 2 to "${page}"`);
    expect(setTabsScript("Google Chrome", tabs, page)).not.toContain("tab 2 of window 1");
  });

  it("treats a menu title that starts with Quit as the quit target", () => {
    expect(isQuitMenuItem("Quit Google Chrome")).toBe(true);
    expect(isQuitMenuItem("Quit")).toBe(true);
    expect(isQuitMenuItem("Close Window")).toBe(false);
  });
});

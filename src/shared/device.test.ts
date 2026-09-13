import { describe, expect, it } from "vitest";
import { deviceDisplayName, displayNameForDevice, deviceKey, isDeviceOnline } from "./device";
import { browserKind, browserUrlScripts, extractUrlFromText, isBrowserProcess, looksLikeBrowser, normalizeCapturedUrl, parseBrowserTabResult, scriptingAppName, websiteHostname } from "./browser";

describe("device display names", () => {
  it("prefers a nickname and falls back to hostname or platform", () => {
    expect(deviceDisplayName("macos", "Studio Mac", "Work Mac")).toBe("Work Mac");
    expect(deviceDisplayName("macos", "Studio Mac", "  ")).toBe("Studio Mac");
    expect(deviceDisplayName("macos", "", "")).toBe("Mac");
  });

  it("looks up nicknames by platform and hostname without changing the key", () => {
    const devices = [{
      visibilityKey: "macos|Studio Mac",
      deviceName: "Studio Mac",
      nickname: "Work Mac",
      devicePlatform: "macos",
    }];
    expect(displayNameForDevice("macos", "Studio Mac", devices)).toBe("Work Mac");
    expect(deviceKey("macos", "Studio Mac")).toBe("macos|Studio Mac");
    expect(displayNameForDevice("ios", "iPhone", devices)).toBe("iPhone");
  });
});

describe("device online fallback", () => {
  it("prefers the server-reported state", () => {
    expect(isDeviceOnline({ lastSeenAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), reportedOnline: true })).toBe(true);
    expect(isDeviceOnline({ lastSeenAt: new Date().toISOString(), reportedOnline: false })).toBe(false);
  });

  it("falls back to last-seen when the server is silent", () => {
    expect(isDeviceOnline({ lastSeenAt: new Date(Date.now() - 60 * 1000).toISOString(), reportedOnline: null })).toBe(true);
    expect(isDeviceOnline({ lastSeenAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), reportedOnline: null })).toBe(false);
    expect(isDeviceOnline({ lastSeenAt: null, reportedOnline: null })).toBe(false);
  });
});

describe("browser catalog", () => {
  it("matches supported browsers and rejects substrings", () => {
    expect(isBrowserProcess("chrome")).toBe(true);
    expect(isBrowserProcess("code")).toBe(false);
    expect(isBrowserProcess("searcher")).toBe(false);
    expect(looksLikeBrowser("com.google.Chrome")).toBe(true);
    expect(looksLikeBrowser("Google Chrome")).toBe(true);
    expect(looksLikeBrowser("Safari")).toBe(true);
  });
});

describe("browser URL parsing", () => {
  it("normalizes AppleScript and address-bar values", () => {
    expect(normalizeCapturedUrl("missing value")).toBe("");
    expect(normalizeCapturedUrl("https://github.com/stopscrolling")).toBe("https://github.com/stopscrolling");
    expect(normalizeCapturedUrl("docs.google.com/document")).toBe("https://docs.google.com/document");
  });

  it("pulls a URL out of a window title and tab script result", () => {
    expect(extractUrlFromText("Inbox - https://mail.google.com/mail/u/0/#inbox")).toBe(
      "https://mail.google.com/mail/u/0/#inbox",
    );
    expect(parseBrowserTabResult("GitHub|||https://github.com/")).toEqual({
      title: "GitHub",
      url: "https://github.com/",
    });
    expect(browserKind("Google Chrome", "com.google.Chrome")).toBe("chromium");
    expect(browserKind("Safari", "com.apple.Safari")).toBe("safari");
    expect(websiteHostname("https://www.GitHub.com/org/repo?tab=1")).toBe("github.com");
    expect(websiteHostname("")).toBe("");
  });
});

describe("browser scripting names", () => {
  it("maps Chrome helpers to the scriptable Google Chrome app", () => {
    expect(scriptingAppName("Google Chrome", "com.google.Chrome")).toBe("Google Chrome");
    expect(scriptingAppName("Google Chrome Helper", "com.google.Chrome.helper")).toBe("Google Chrome");
    expect(scriptingAppName("Chromium", "org.chromium.Chromium")).toBe("Chromium");
    expect(scriptingAppName("Safari", "com.apple.Safari")).toBe("Safari");
  });

  it("asks Chrome for the active tab URL without bundling title", () => {
    expect(browserUrlScripts("chromium", '"Google Chrome"')).toEqual([
      'tell application "Google Chrome" to return URL of active tab of front window',
      'tell application "Google Chrome" to return URL of active tab of window 1',
    ]);
  });
});

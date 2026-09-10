import { describe, expect, it } from "vitest";
import { isDeviceOnline } from "./device";
import { browserKind, extractUrlFromText, isBrowserProcess, looksLikeBrowser, normalizeCapturedUrl, parseBrowserTabResult } from "./browser";

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
  });
});

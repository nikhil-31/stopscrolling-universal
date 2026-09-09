import { describe, expect, it } from "vitest";
import { isDeviceOnline } from "./device";
import { isBrowserProcess, looksLikeBrowser } from "./browser";

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
  });
});

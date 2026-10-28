import { describe, expect, it, vi } from "vitest";

const load = vi.fn();
vi.mock("koffi", () => ({ default: { load, decode: vi.fn() } }));

const { AppleCalendarBridge, appleCalendarLibraryCandidates } = await import("./apple-calendar");

describe("AppleCalendarBridge", () => {
  it("reports Apple Calendar as unsupported off macOS without loading anything", async () => {
    const bridge = new AppleCalendarBridge("win32", () => "/somewhere/StopScrollingCalendar.dylib");
    expect(await bridge.access()).toBe("unsupported");
    expect(await bridge.calendars()).toEqual([]);
    expect(await bridge.events(new Date(), new Date(), ["home"])).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("reports unsupported on macOS when the library isn't bundled", async () => {
    const bridge = new AppleCalendarBridge("darwin", () => null);
    expect(bridge.supported()).toBe(false);
    expect(await bridge.requestAccess()).toBe("unsupported");
  });

  it("looks for the library in the app bundle first, then the dev build", () => {
    expect(appleCalendarLibraryCandidates("/App.app/Contents/MacOS/Stop Scrolling", "/App.app/Contents/Resources", "/repo")).toEqual([
      "/App.app/Contents/Frameworks/StopScrollingCalendar.dylib",
      "/App.app/Contents/Resources/native/macos/StopScrollingCalendar.dylib",
      "/repo/release-native/macos/StopScrollingCalendar.dylib",
      "/repo/native/macos/.derivedData/widget-pack/StopScrollingCalendar.dylib",
    ]);
  });
});

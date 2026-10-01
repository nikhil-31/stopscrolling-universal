// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { ALL_DEVICES } from "@shared/timeline";
import type { DeviceListEntry } from "@shared/types";
import { TodayChrome } from "./TodayChrome";

const desktop = {
  setTodayDay: vi.fn(),
  setTodayDevice: vi.fn(),
  navigate: vi.fn(),
  requestAccessibility: vi.fn(),
};

function device(partial: Partial<DeviceListEntry> & Pick<DeviceListEntry, "visibilityKey" | "deviceName" | "devicePlatform">): DeviceListEntry {
  return {
    nickname: "",
    deviceID: null,
    sessionCount: 1,
    timeZone: "UTC",
    lastSeenAt: null,
    lastOnlineAt: null,
    reportedOnline: null,
    isOnline: false,
    isRegistered: true,
    ...partial,
  };
}

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "today",
    todayDay: "2026-09-17T12:00:00.000Z",
    todayDeviceKey: ALL_DEVICES,
    devices: [],
    hiddenDeviceKeys: [],
    capabilities: { accessibilityGranted: true, platform: "macos" },
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("TodayChrome jump to today", () => {
  it("shows a dot when the selected day is not today", () => {
    render(<TodayChrome state={snapshot({ todayDay: "2020-01-15T12:00:00.000Z" })} onOpenMore={() => undefined} />);
    expect(screen.getByRole("button", { name: "Jump to today" }).querySelector(".icon-button-dot")).not.toBeNull();
  });

  it("hides the dot when the selected day is today", () => {
    render(<TodayChrome state={snapshot({ todayDay: new Date().toISOString() })} onOpenMore={() => undefined} />);
    expect(screen.getByRole("button", { name: "Jump to today" }).querySelector(".icon-button-dot")).toBeNull();
  });
});

describe("TodayChrome device picker", () => {
  it("hides the device picker when fewer than two devices are visible", () => {
    render(<TodayChrome state={snapshot({
      devices: [device({ visibilityKey: "macos|Studio Mac", deviceName: "Studio Mac", devicePlatform: "macos" })],
    })} onOpenMore={() => undefined} />);
    expect(screen.queryByRole("tablist", { name: "Today devices" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "All devices" })).toBeNull();
  });

  it("lets you pick a device when two or more are visible", async () => {
    const user = userEvent.setup();
    render(<TodayChrome state={snapshot({
      devices: [
        device({ visibilityKey: "macos|Studio Mac", deviceName: "Studio Mac", devicePlatform: "macos", nickname: "Work Mac", colorIndex: 0 }),
        device({ visibilityKey: "ios|iPhone", deviceName: "iPhone", devicePlatform: "ios", colorIndex: 1 }),
      ],
    })} onOpenMore={() => undefined} />);
    expect(screen.getByRole("tab", { name: "All devices" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Work Mac" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Work Mac" }).querySelector(".device-picker-dot")).toHaveStyle({ background: "var(--device-0)" });
    expect(screen.getByRole("tab", { name: "iPhone" }).querySelector(".device-picker-dot")).toHaveStyle({ background: "var(--device-1)" });
    expect(screen.getByRole("tab", { name: "All devices" }).querySelector(".device-picker-dot")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Work Mac" }));
    expect(desktop.setTodayDevice).toHaveBeenCalledWith("macos|Studio Mac");
  });

  it("selects the current device and ignores hidden devices", () => {
    render(<TodayChrome state={snapshot({
      todayDeviceKey: "macos|Studio Mac",
      hiddenDeviceKeys: ["ios|iPhone"],
      devices: [
        device({ visibilityKey: "macos|Studio Mac", deviceName: "Studio Mac", devicePlatform: "macos" }),
        device({ visibilityKey: "ios|iPhone", deviceName: "iPhone", devicePlatform: "ios" }),
        device({ visibilityKey: "windows|PC", deviceName: "PC", devicePlatform: "windows" }),
      ],
    })} onOpenMore={() => undefined} />);
    expect(screen.getByRole("tab", { name: "Studio Mac" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "PC" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "iPhone" })).toBeNull();
  });
});

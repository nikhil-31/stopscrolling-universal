// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { ALL_INSIGHTS_DEVICES } from "@shared/timeline";
import type { DeviceListEntry } from "@shared/types";
import { InsightsScreen } from "./InsightsScreen";

const desktop = {
  setInsightsTab: vi.fn(),
  setInsightsDevice: vi.fn(),
  selectInspector: vi.fn(),
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
    navigation: "insights",
    loadingEntries: false,
    insightsPeriod: "week",
    insightsTab: "overview",
    insightsDeviceKey: ALL_INSIGHTS_DEVICES,
    devices: [],
    hiddenDeviceKeys: [],
    timelines: [],
    snapshot: {
      totalSeconds: 3600,
      sessionCount: 4,
      timelineSegments: [],
      listSegments: [],
      categories: [{ category: "Productivity", seconds: 3600, percentage: 1 }],
      apps: [{
        key: "notes",
        label: "Notes",
        subtitle: "Productivity",
        category: "Productivity",
        seconds: 3600,
        percentage: 1,
      }],
      buckets: [{
        id: "mon",
        label: "Mon",
        start: "2026-09-08T00:00:00.000Z",
        end: "2026-09-09T00:00:00.000Z",
        seconds: 3600,
      }],
      trackedSecondsByDay: {},
    },
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("InsightsScreen", () => {
  it("shows breakdown content on Overview and hides the Breakdown tab", () => {
    render(<InsightsScreen state={snapshot()} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Breakdown" })).toBeNull();
    expect(screen.getByText("Activity trend")).toBeVisible();
    expect(screen.getByText("Time by category")).toBeVisible();
    expect(screen.getByText("Apps & websites")).toBeVisible();
    expect(screen.getByText("Notes")).toBeVisible();
  });

  it("treats a leftover breakdown tab as Overview", () => {
    render(<InsightsScreen state={snapshot({ insightsTab: "breakdown" as unknown as AppSnapshot["insightsTab"] })} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Time by category")).toBeVisible();
  });

  it("hides the device picker when fewer than two devices are visible", () => {
    render(<InsightsScreen state={snapshot({
      devices: [device({ visibilityKey: "macos|Studio Mac", deviceName: "Studio Mac", devicePlatform: "macos" })],
    })} />);
    expect(screen.queryByRole("tablist", { name: "Insights devices" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "All devices" })).toBeNull();
  });

  it("lets you pick a device when two or more are visible", async () => {
    const user = userEvent.setup();
    render(<InsightsScreen state={snapshot({
      devices: [
        device({ visibilityKey: "macos|Studio Mac", deviceName: "Studio Mac", devicePlatform: "macos", nickname: "Work Mac" }),
        device({ visibilityKey: "ios|iPhone", deviceName: "iPhone", devicePlatform: "ios" }),
      ],
    })} />);
    expect(screen.getByRole("tab", { name: "All devices" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Work Mac" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "iPhone" })).toBeVisible();
    expect(screen.getByText("Across this week")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Work Mac" }));
    expect(desktop.setInsightsDevice).toHaveBeenCalledWith("macos|Studio Mac");
  });

  it("renders daily rhythm blocks for the selected day", () => {
    const dayStart = new Date(2026, 8, 10).toISOString();
    const dayEnd = new Date(2026, 8, 11).toISOString();
    render(<InsightsScreen state={snapshot({
      insightsPeriod: "day",
      timelines: [{
        id: "macos|Studio Mac",
        deviceName: "Studio Mac",
        devicePlatform: "macos",
        timeZoneIdentifier: "UTC",
        dayStart,
        dayEnd,
        segments: [],
        blocks: [{
          id: "block-1",
          start: new Date(2026, 8, 10, 9).toISOString(),
          end: new Date(2026, 8, 10, 10).toISOString(),
          title: "Cursor",
          subtitle: "Development",
          category: "Development",
          devicePlatform: "macos",
          deviceName: "Studio Mac",
          durationSeconds: 3600,
          items: [{
            id: "cursor",
            title: "Cursor",
            subtitle: "Development",
            url: "",
            category: "Development",
            appName: "Cursor",
            start: new Date(2026, 8, 10, 9).toISOString(),
            end: new Date(2026, 8, 10, 10).toISOString(),
            durationSeconds: 3600,
          }],
        }],
      }],
    })} />);
    expect(screen.getByText("Daily rhythm")).toBeVisible();
    expect(screen.getByRole("img", { name: /1 blocks, 1h tracked/ })).toBeVisible();
    expect(screen.queryByText(/No activity recorded/)).toBeNull();
  });

  it("shows the selected device in metric copy and ignores hidden devices", () => {
    render(<InsightsScreen state={snapshot({
      insightsDeviceKey: "macos|Studio Mac",
      hiddenDeviceKeys: ["ios|iPhone"],
      devices: [
        device({ visibilityKey: "macos|Studio Mac", deviceName: "Studio Mac", devicePlatform: "macos" }),
        device({ visibilityKey: "ios|iPhone", deviceName: "iPhone", devicePlatform: "ios" }),
        device({ visibilityKey: "windows|PC", deviceName: "PC", devicePlatform: "windows" }),
      ],
    })} />);
    expect(screen.getByRole("tab", { name: "Studio Mac" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "PC" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "iPhone" })).toBeNull();
    expect(screen.getByText("On Studio Mac this week")).toBeVisible();
  });
});

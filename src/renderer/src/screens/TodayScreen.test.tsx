// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { ALL_DEVICES } from "@shared/timeline";
import { TodayScreen } from "./TodayScreen";

const desktop = {
  setTodayTab: vi.fn(),
  setTodayDay: vi.fn(),
  setTodayDevice: vi.fn(),
  navigate: vi.fn(),
  requestAccessibility: vi.fn(),
  selectInspector: vi.fn(),
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  const dayStart = new Date(2026, 8, 10).toISOString();
  const dayEnd = new Date(2026, 8, 11).toISOString();
  const cursorStart = new Date(2026, 8, 10, 9).toISOString();
  const cursorEnd = new Date(2026, 8, 10, 10).toISOString();
  const safariStart = new Date(2026, 8, 10, 11).toISOString();
  const safariEnd = new Date(2026, 8, 10, 11, 20).toISOString();
  return {
    navigation: "today",
    isAuthenticated: true,
    todayDay: dayStart,
    todayTab: "timeline",
    todayDeviceKey: ALL_DEVICES,
    devices: [],
    hiddenDeviceKeys: [],
    capabilities: { accessibilityGranted: true, platform: "macos", urlCaptureNote: "" },
    snapshot: {
      totalSeconds: 4800,
      sessionCount: 2,
      timelineSegments: [],
      listSegments: [
        {
          id: "cursor",
          start: cursorStart,
          end: cursorEnd,
          label: "Cursor",
          subtitle: "Development",
          url: "",
          bundleID: "Cursor",
          category: "Development",
          appName: "Cursor",
          devicePlatform: "macos",
          deviceName: "Studio Mac",
          timeZoneIdentifier: "UTC",
          isLive: false,
        },
        {
          id: "safari",
          start: safariStart,
          end: safariEnd,
          label: "Safari",
          subtitle: "github.com",
          url: "https://github.com",
          bundleID: "Safari",
          category: "Social",
          appName: "Safari",
          devicePlatform: "macos",
          deviceName: "Studio Mac",
          timeZoneIdentifier: "UTC",
          isLive: false,
        },
      ],
      categories: [
        { category: "Development", seconds: 3600, percentage: 0.75 },
        { category: "Social", seconds: 1200, percentage: 0.25 },
      ],
      apps: [
        {
          key: "app|Cursor",
          label: "Cursor",
          subtitle: "Development",
          category: "Development",
          seconds: 3600,
          percentage: 0.75,
        },
        {
          key: "web|github.com",
          label: "github.com",
          subtitle: "Safari",
          category: "Social",
          seconds: 1200,
          percentage: 0.25,
        },
      ],
      buckets: [],
      trackedSecondsByDay: {},
    },
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
        start: cursorStart,
        end: cursorEnd,
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
          start: cursorStart,
          end: cursorEnd,
          durationSeconds: 3600,
        }],
      }, {
        id: "block-2",
        start: safariStart,
        end: safariEnd,
        title: "Safari",
        subtitle: "github.com",
        category: "Social",
        devicePlatform: "macos",
        deviceName: "Studio Mac",
        durationSeconds: 1200,
        items: [{
          id: "github",
          title: "Safari",
          subtitle: "github.com",
          url: "https://github.com",
          category: "Social",
          appName: "Safari",
          start: safariStart,
          end: safariEnd,
          durationSeconds: 1200,
        }],
      }],
    }],
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("TodayScreen app filter", () => {
  it("filters today to the selected app and restores with Show all", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TodayScreen state={snapshot()} />);
    expect(screen.getByRole("button", { name: /^Cursor,/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Safari,/ })).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
    expect(screen.getByTestId("category-pie-chart")).toHaveAttribute("aria-label", expect.stringContaining("Social"));

    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("button", { name: "Highlight Cursor on the timeline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.getByRole("button", { name: /^Cursor,/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Safari,/ })).toBeNull();
    expect(screen.queryByTestId("timeline-highlight")).toBeNull();
    expect(screen.queryByText("Social")).toBeNull();
    expect(screen.getByTestId("category-pie-chart")).toHaveAttribute("aria-label", expect.stringContaining("Development 1h, 100 percent"));
    expect(screen.getByRole("button", { name: "Highlight github.com on the timeline" })).toBeVisible();

    rerender(<TodayScreen state={snapshot({ todayTab: "eventLog" })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.getByText("Cursor")).toBeVisible();
    expect(screen.queryByText("Safari")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show all" }));
    rerender(<TodayScreen state={snapshot()} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /^Safari,/ })).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
  });

  it("clears the app filter when the same row is clicked again", async () => {
    const user = userEvent.setup();
    render(<TodayScreen state={snapshot()} />);
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /^Safari,/ })).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
  });
});

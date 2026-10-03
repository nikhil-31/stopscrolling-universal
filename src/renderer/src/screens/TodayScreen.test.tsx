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
    expect(screen.getByRole("button", { name: /^github\.com,/ })).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
    expect(screen.getByTestId("category-pie-chart")).toHaveAttribute("aria-label", expect.stringContaining("Social"));

    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("button", { name: "Highlight Cursor on the timeline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.getByRole("button", { name: /^Cursor,/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^github\.com,/ })).toBeNull();
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
    expect(screen.getByRole("button", { name: /^github\.com,/ })).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
  });

  it("clears the app filter when the same row is clicked again", async () => {
    const user = userEvent.setup();
    render(<TodayScreen state={snapshot()} />);
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /^github\.com,/ })).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
  });
});

describe("TodayScreen focus filter", () => {
  it("shows productive and distracting totals and filters the timeline", async () => {
    const user = userEvent.setup();
    const base = snapshot();
    const listSegments = [
      { ...base.snapshot.listSegments[0], verdict: "Productive" as const },
      { ...base.snapshot.listSegments[1], verdict: "Distracting" as const },
    ];
    const state = snapshot({
      snapshot: { ...base.snapshot, listSegments, timelineSegments: listSegments },
      timelines: [{
        ...base.timelines[0],
        segments: listSegments,
      }],
    });
    render(<TodayScreen state={state} />);
    expect(screen.getByRole("region", { name: "Focus" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Highlight Productive on the timeline" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Highlight Distracting on the timeline" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Highlight Distracting on the timeline" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Distracting");
    expect(screen.queryByText("Development")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.queryByRole("button", { name: "Highlight Distracting on the timeline" })).toBeNull();
    expect(screen.getByRole("button", { name: "Highlight Productive on the timeline" })).toBeVisible();
  });
});

describe("TodayScreen device lines", () => {
  it("shows a line per device on the timeline and follows the app filter", async () => {
    const user = userEvent.setup();
    const base = snapshot();
    const segments = [
      base.snapshot.listSegments[0],
      {
        ...base.snapshot.listSegments[1],
        devicePlatform: "ios",
        deviceName: "iPhone",
      },
    ];
    const state = snapshot({
      todayPeriod: "day",
      devices: [
        { visibilityKey: "macos|Studio Mac", devicePlatform: "macos", deviceName: "Studio Mac", nickname: "", colorIndex: 0 },
        { visibilityKey: "ios|iPhone", devicePlatform: "ios", deviceName: "iPhone", nickname: "Phone", colorIndex: 1 },
      ] as AppSnapshot["devices"],
      snapshot: {
        ...base.snapshot,
        timelineSegments: segments,
        listSegments: segments,
      },
    });
    const { rerender } = render(<TodayScreen state={state} />);
    expect(screen.getByRole("img", { name: "Activity by device, Studio Mac 1h, Phone 20m" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("img", { name: "Activity by device, Studio Mac 1h" })).toBeVisible();
    expect(screen.queryByRole("img", { name: /Phone/ })).toBeNull();

    rerender(<TodayScreen state={{ ...state, todayTab: "eventLog" }} />);
    expect(screen.queryByRole("img", { name: /Activity by device/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Activity by device" })).toBeNull();
  });
});

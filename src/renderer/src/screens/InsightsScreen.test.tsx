// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { ALL_INSIGHTS_DEVICES } from "@shared/timeline";
import type { DeviceListEntry, ScreenTimeTimelineSegment } from "@shared/types";
import { SESSION_LOG_PAGE_SIZE } from "../components/timeline";
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
    insightsAnchor: "2026-09-10T00:00:00.000Z",
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

function dayFilterState(): Partial<AppSnapshot> {
  const dayStart = new Date(2026, 8, 10).toISOString();
  const dayEnd = new Date(2026, 8, 11).toISOString();
  const cursorStart = new Date(2026, 8, 10, 9).toISOString();
  const cursorEnd = new Date(2026, 8, 10, 10).toISOString();
  const safariStart = new Date(2026, 8, 10, 11).toISOString();
  const safariEnd = new Date(2026, 8, 10, 11, 20).toISOString();
  return {
    insightsPeriod: "day",
    insightsAnchor: dayStart,
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
          category: "Development",
          appName: "Safari",
          devicePlatform: "macos",
          deviceName: "Studio Mac",
          timeZoneIdentifier: "UTC",
          isLive: false,
        },
      ],
      categories: [{ category: "Development", seconds: 4800, percentage: 1 }],
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
          category: "Development",
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
        category: "Development",
        devicePlatform: "macos",
        deviceName: "Studio Mac",
        durationSeconds: 1200,
        items: [{
          id: "github",
          title: "Safari",
          subtitle: "github.com",
          url: "https://github.com",
          category: "Development",
          appName: "Safari",
          start: safariStart,
          end: safariEnd,
          durationSeconds: 1200,
        }],
      }],
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("InsightsScreen", () => {
  it("keeps the activity header visible while the first insights fetch is in flight", () => {
    render(<InsightsScreen state={snapshot({ loadingEntries: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Building your insights…");
    expect(document.querySelectorAll(".insights-skeleton .skeleton").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Activity");
    expect(screen.queryByText("Activity trend")).toBeNull();
    expect(screen.queryByText("Time by category")).toBeNull();
  });

  it("shows breakdown content on Overview and hides the Breakdown tab", () => {
    render(<InsightsScreen state={snapshot()} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Breakdown" })).toBeNull();
    expect(screen.getByText("Activity trend")).toBeVisible();
    expect(screen.getByText("Time by category")).toBeVisible();
    expect(screen.getByText("Apps & websites")).toBeVisible();
    expect(screen.getAllByText("Notes").length).toBeGreaterThan(0);
    expect(screen.getByText("100%")).toBeVisible();
    expect(screen.getByText("Leading app/website")).toBeVisible();
    expect(screen.queryByText("Average session")).toBeNull();
    expect(screen.queryByText("Leading category")).toBeNull();
  });

  it("shows the highest-time app as the leading app/website", () => {
    render(<InsightsScreen state={snapshot({
      snapshot: {
        totalSeconds: 3000,
        sessionCount: 2,
        timelineSegments: [],
        listSegments: [],
        categories: [{ category: "Productivity", seconds: 600, percentage: 0.2 }],
        apps: [
          { key: "notes", label: "Notes", subtitle: "Productivity", category: "Productivity", seconds: 600, percentage: 0.2 },
          { key: "cursor", label: "Cursor", subtitle: "Development", category: "Development", seconds: 2400, percentage: 0.8 },
        ],
        buckets: [],
        trackedSecondsByDay: {},
      },
    })} />);
    expect(screen.getByText("Leading app/website")).toBeVisible();
    expect(screen.getByText("40m", { selector: ".metric-value" })).toBeVisible();
    expect(screen.getByText("Cursor · 80%", { selector: ".metric-detail" })).toBeVisible();
    expect(screen.queryByText("Average session")).toBeNull();
    expect(screen.queryByText("Leading category")).toBeNull();
    expect(screen.queryByText("Productivity", { selector: ".metric-value" })).toBeNull();
  });

  it("orders Apps & websites by time spent descending", () => {
    render(<InsightsScreen state={snapshot({
      snapshot: {
        totalSeconds: 3000,
        sessionCount: 2,
        timelineSegments: [],
        listSegments: [],
        categories: [],
        apps: [
          { key: "notes", label: "Notes", subtitle: "Productivity", category: "Productivity", seconds: 600, percentage: 0.2 },
          { key: "cursor", label: "Cursor", subtitle: "Development", category: "Development", seconds: 2400, percentage: 0.8 },
        ],
        buckets: [],
        trackedSecondsByDay: {},
      },
    })} />);
    const rows = screen.getAllByRole("button", { name: /Highlight .+ on the timeline/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Highlight Cursor on the timeline",
      "Highlight Notes on the timeline",
    ]);
    expect(screen.getByText("80%")).toBeVisible();
    expect(screen.getByText("20%")).toBeVisible();
    expect(screen.getAllByText("40m").length).toBeGreaterThan(0);
    expect(screen.getByText("10m")).toBeVisible();
    const bars = document.querySelectorAll(".activity-app-bar span");
    expect(bars[0]).toHaveStyle({ width: "80%" });
    expect(bars[1]).toHaveStyle({ width: "20%" });
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

  it("renders timeline blocks for the selected day", () => {
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
    expect(screen.getByText("Timeline")).toBeVisible();
    expect(screen.getByRole("img", { name: /1 blocks, 1h tracked/ })).toBeVisible();
    expect(screen.queryByText(/No activity recorded/)).toBeNull();
  });

  it("filters the day insights to the selected app and restores with Show all", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<InsightsScreen state={snapshot(dayFilterState())} />);
    expect(screen.getByText("1h 20m", { selector: ".metric-value" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Cursor,/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Safari,/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("button", { name: "Highlight Cursor on the timeline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.getByText("Cursor across your visible devices")).toBeVisible();
    expect(screen.queryByText("1h 20m")).toBeNull();
    expect(screen.getAllByText("1h", { selector: ".metric-value" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Across this day · Cursor")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Cursor,/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Safari,/ })).toBeNull();
    expect(screen.queryByTestId("timeline-highlight")).toBeNull();
    expect(screen.getByRole("button", { name: "Highlight github.com on the timeline" })).toBeVisible();

    rerender(<InsightsScreen state={snapshot({ ...dayFilterState(), insightsTab: "sessions" })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.getByText("Cursor")).toBeVisible();
    expect(screen.queryByText("Safari")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show all" }));
    rerender(<InsightsScreen state={snapshot(dayFilterState())} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("1h 20m", { selector: ".metric-value" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Safari,/ })).toBeVisible();
  });

  it("clears the app filter when the same row is clicked again", async () => {
    const user = userEvent.setup();
    render(<InsightsScreen state={snapshot(dayFilterState())} />);
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("1h 20m", { selector: ".metric-value" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Safari,/ })).toBeVisible();
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

function logSession(index: number, patch: Partial<ScreenTimeTimelineSegment> = {}): ScreenTimeTimelineSegment {
  return {
    id: `session-${index}`,
    start: new Date(2026, 8, 10, 8, index).toISOString(),
    end: new Date(2026, 8, 10, 8, index, 30).toISOString(),
    label: `Log ${String(index).padStart(2, "0")}`,
    subtitle: "Development",
    url: "",
    bundleID: "Cursor",
    category: "Development",
    appName: "Cursor",
    devicePlatform: "macos",
    deviceName: "Mac",
    timeZoneIdentifier: "UTC",
    isLive: false,
    ...patch,
  };
}

function sessionsState(segments: ScreenTimeTimelineSegment[], extra: Partial<AppSnapshot> = {}): Partial<AppSnapshot> {
  return {
    insightsTab: "sessions",
    snapshot: {
      totalSeconds: segments.length * 30,
      sessionCount: segments.length,
      timelineSegments: [],
      listSegments: segments,
      categories: [{ category: "Development", seconds: segments.length * 30, percentage: 1 }],
      apps: [{
        key: "app|Cursor",
        label: "Cursor",
        subtitle: "Development",
        category: "Development",
        seconds: segments.length * 30,
        percentage: 1,
      }],
      buckets: [],
      trackedSecondsByDay: {},
    },
    ...extra,
  };
}

describe("Insights session log pagination", () => {
  let intersect: (() => void) | null;

  beforeEach(() => {
    intersect = null;
    vi.stubGlobal("IntersectionObserver", class {
      callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe() {
        intersect = () => {
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        };
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the 30 most recent sessions until you scroll", () => {
    const segments = Array.from({ length: SESSION_LOG_PAGE_SIZE + 1 }, (_, index) => logSession(index));
    render(<InsightsScreen state={snapshot(sessionsState(segments))} />);
    expect(screen.getByText(`${SESSION_LOG_PAGE_SIZE + 1} recorded sessions`)).toBeVisible();
    expect(screen.getByRole("button", { name: /Log 30/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Log 01/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Log 00/ })).toBeNull();
  });

  it("loads the next page when the list bottom is visible", () => {
    const segments = Array.from({ length: SESSION_LOG_PAGE_SIZE + 1 }, (_, index) => logSession(index));
    render(<InsightsScreen state={snapshot(sessionsState(segments))} />);
    expect(screen.queryByRole("button", { name: /Log 00/ })).toBeNull();
    act(() => intersect?.());
    expect(screen.getByRole("button", { name: /Log 00/ })).toBeVisible();
  });

  it("resets to the first page when the session list changes", () => {
    const first = Array.from({ length: SESSION_LOG_PAGE_SIZE + 1 }, (_, index) => logSession(index));
    const { rerender } = render(<InsightsScreen state={snapshot(sessionsState(first))} />);
    act(() => intersect?.());
    expect(screen.getByRole("button", { name: /Log 00/ })).toBeVisible();

    const next = Array.from({ length: SESSION_LOG_PAGE_SIZE + 1 }, (_, index) => logSession(index + 100));
    rerender(<InsightsScreen state={snapshot(sessionsState(next))} />);
    expect(screen.getByRole("button", { name: /Log 130/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Log 100/ })).toBeNull();
  });

  it("keeps loaded pages when a new session is prepended", () => {
    const first = Array.from({ length: SESSION_LOG_PAGE_SIZE + 1 }, (_, index) => logSession(index));
    const { rerender } = render(<InsightsScreen state={snapshot(sessionsState(first))} />);
    act(() => intersect?.());
    expect(screen.getByRole("button", { name: /Log 00/ })).toBeVisible();

    rerender(<InsightsScreen state={snapshot(sessionsState([...first, logSession(99)]))} />);
    expect(screen.getByRole("button", { name: /Log 99/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Log 01/ })).toBeVisible();
  });

  it("paginates the filtered session log", async () => {
    const user = userEvent.setup();
    const cursor = Array.from({ length: SESSION_LOG_PAGE_SIZE + 1 }, (_, index) => logSession(index));
    const safari = logSession(SESSION_LOG_PAGE_SIZE + 1, {
      id: "safari",
      label: "Safari",
      appName: "Safari",
      bundleID: "Safari",
      url: "https://github.com",
      subtitle: "github.com",
    });
    const state = sessionsState([...cursor, safari], {
      insightsTab: "overview",
      insightsPeriod: "day",
      snapshot: {
        totalSeconds: 5000,
        sessionCount: cursor.length + 1,
        timelineSegments: [],
        listSegments: [...cursor, safari],
        categories: [{ category: "Development", seconds: 5000, percentage: 1 }],
        apps: [
          {
            key: "app|Cursor",
            label: "Cursor",
            subtitle: "Development",
            category: "Development",
            seconds: 4000,
            percentage: 0.8,
          },
          {
            key: "web|github.com",
            label: "github.com",
            subtitle: "Safari",
            category: "Development",
            seconds: 1000,
            percentage: 0.2,
          },
        ],
        buckets: [],
        trackedSecondsByDay: {},
      },
    });
    const { rerender } = render(<InsightsScreen state={snapshot(state)} />);
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    rerender(<InsightsScreen state={snapshot({ ...state, insightsTab: "sessions" })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing only Cursor");
    expect(screen.getByText(`${SESSION_LOG_PAGE_SIZE + 1} recorded sessions`)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Safari/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Log 00/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Log 30/ })).toBeVisible();
  });
});


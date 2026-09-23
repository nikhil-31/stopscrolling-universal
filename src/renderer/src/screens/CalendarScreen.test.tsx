// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "@shared/types";
import { dayBoardScrollTop } from "../components/calendar/DayBoard";
import { CalendarScreen } from "./CalendarScreen";

const desktop = {
  setCalendarAnchor: vi.fn(),
  setCalendarMonth: vi.fn(),
  setCalendarView: vi.fn(),
  openSettings: vi.fn(),
  selectInspector: vi.fn(),
};

const noon = new Date(2026, 8, 12, 12);

function block(patch: Partial<ScreenTimeSessionBlock> & Pick<ScreenTimeSessionBlock, "id" | "title" | "deviceName" | "devicePlatform">): ScreenTimeSessionBlock {
  const start = patch.start ?? new Date(2026, 8, 12, 9).toISOString();
  const end = patch.end ?? new Date(2026, 8, 12, 10).toISOString();
  return {
    subtitle: patch.subtitle ?? patch.title,
    category: patch.category ?? "Productivity",
    durationSeconds: patch.durationSeconds ?? 3600,
    items: patch.items ?? [{
      id: `${patch.id}-item`,
      title: patch.title,
      subtitle: patch.title,
      url: "",
      category: "Productivity",
      appName: patch.title,
      start,
      end,
      durationSeconds: 3600,
    }],
    start,
    end,
    ...patch,
  };
}

function timeline(patch: Partial<ScreenTimeDeviceTimeline> & Pick<ScreenTimeDeviceTimeline, "id" | "deviceName" | "devicePlatform">): ScreenTimeDeviceTimeline {
  return {
    timeZoneIdentifier: "UTC",
    dayStart: new Date(2026, 8, 12).toISOString(),
    dayEnd: new Date(2026, 8, 13).toISOString(),
    segments: [],
    blocks: [],
    ...patch,
  };
}

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "calendar",
    isTracking: false,
    currentContext: null,
    capabilities: { platform: "macos" },
    calendarView: "day",
    calendarAnchor: noon.toISOString(),
    calendarMonth: noon.toISOString(),
    calendarEvents: [],
    calendarReviewVisible: true,
    timelines: [],
    settings: { showGoogleCalendarEvents: true },
    calendarDayStats: {
      workSeconds: 3600,
      pendingSeconds: 600,
      trackedSeconds: 5400,
      targetSeconds: 28800,
      percentOfTarget: 12,
      labelTotals: [{ labelId: "label-research", name: "Research", color: "#1fb894", seconds: 3600 }],
      productivity: { focus: 3600, meetings: 0, breaks: 0, other: 0 },
      unlabeledBlocks: [],
      reviewCount: 2,
      dayTasks: [{
        id: "task-1",
        title: "Write PR",
        start: "2026-09-12T09:00:00.000Z",
        end: "2026-09-12T10:00:00.000Z",
      }],
    },
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CalendarScreen", () => {
  it("keeps time entries and calendar without labels or tasks", () => {
    render(<CalendarScreen state={snapshot()} />);

    expect(screen.getByText("Time Entries")).toBeVisible();
    expect(screen.getByText("Calendar")).toBeVisible();
    const summary = screen.getByRole("complementary", { name: "Day summary" });
    expect(within(summary).getByText("Day total")).toBeVisible();
    expect(summary.querySelector(".calendar-work-value")).toHaveTextContent("1 hr 30 min");
    expect(within(summary).getByText("Work Hours").nextElementSibling).toHaveTextContent("1 hr");
    expect(screen.queryByText("Labels")).toBeNull();
    expect(screen.queryByText("Tasks")).toBeNull();
    expect(screen.queryByText("Write PR")).toBeNull();
    expect(screen.queryByText("Research")).toBeNull();
    expect(screen.queryByText("Manage labels")).toBeNull();
    expect(screen.queryByText("Review Time Entries")).toBeNull();
    expect(screen.queryByText("No labels applied yet")).toBeNull();
  });

  it("shows a time-entry column per visible device", () => {
    render(
      <CalendarScreen
        state={snapshot({
          devices: [
            {
              visibilityKey: "macos|Studio Mac",
              deviceName: "Studio Mac",
              nickname: "Work Mac",
              devicePlatform: "macos",
              deviceID: "mac-1",
              sessionCount: 4,
              timeZone: "UTC",
              lastSeenAt: null,
              lastOnlineAt: null,
              reportedOnline: null,
              isOnline: true,
              isRegistered: true,
            },
            {
              visibilityKey: "ios|iPhone",
              deviceName: "iPhone",
              nickname: "",
              devicePlatform: "ios",
              deviceID: "phone-1",
              sessionCount: 2,
              timeZone: "UTC",
              lastSeenAt: null,
              lastOnlineAt: null,
              reportedOnline: null,
              isOnline: true,
              isRegistered: true,
            },
          ],
          timelines: [
            timeline({
              id: "macos|Studio Mac",
              deviceName: "Studio Mac",
              devicePlatform: "macos",
              blocks: [block({ id: "mac-block", title: "Writing", deviceName: "Studio Mac", devicePlatform: "macos" })],
            }),
            timeline({
              id: "ios|iPhone",
              deviceName: "iPhone",
              devicePlatform: "ios",
              blocks: [block({ id: "phone-block", title: "Safari", deviceName: "iPhone", devicePlatform: "ios" })],
            }),
          ],
        })}
      />,
    );

    expect(screen.queryByText("Time Entries")).toBeNull();
    expect(screen.getByText("Work Mac")).toBeVisible();
    expect(screen.getByText("iPhone")).toBeVisible();
    expect(screen.queryByText("Studio Mac")).toBeNull();

    const mac = screen.getByTestId("calendar-device-column-macos|Studio Mac");
    const phone = screen.getByTestId("calendar-device-column-ios|iPhone");
    expect(within(mac).getByText("Writing")).toBeVisible();
    expect(within(mac).queryByText("Safari")).toBeNull();
    expect(within(phone).getByText("Safari")).toBeVisible();
    expect(within(phone).queryByText("Writing")).toBeNull();
  });

  it("shows session time when hovering a time-entry block", () => {
    render(
      <CalendarScreen
        state={snapshot({
          timelines: [
            timeline({
              id: "macos|Studio Mac",
              deviceName: "Studio Mac",
              devicePlatform: "macos",
              blocks: [block({ id: "mac-block", title: "Writing", deviceName: "Studio Mac", devicePlatform: "macos" })],
            }),
          ],
        })}
      />,
    );

    const entry = screen.getByRole("button", { name: /Writing/ });
    fireEvent.mouseEnter(entry, { clientX: 40, clientY: 40 });
    const card = screen.getByTestId("session-hover-card");
    expect(within(card).getByText("Writing", { selector: ".native-hover-title" })).toBeVisible();
    expect(within(card).getAllByText("1h").length).toBeGreaterThan(0);

    fireEvent.mouseLeave(entry);
    expect(screen.queryByTestId("session-hover-card")).toBeNull();
  });

  it("marks Tracking... only on the local device live block", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 8, 12, 9, 30).getTime());
    render(
      <CalendarScreen
        state={snapshot({
          isTracking: true,
          currentContext: {
            title: "Weekly notes",
            url: "",
            appName: "Notes",
            bundleID: "com.apple.Notes",
            category: "Productivity",
          },
          timelines: [
            timeline({
              id: "macos|Studio Mac",
              deviceName: "Studio Mac",
              devicePlatform: "macos",
              blocks: [block({
                id: "mac-live",
                title: "Notes",
                deviceName: "Studio Mac",
                devicePlatform: "macos",
                items: [{
                  id: "notes",
                  title: "Notes",
                  subtitle: "Weekly notes",
                  url: "",
                  category: "Productivity",
                  appName: "Notes",
                  start: new Date(2026, 8, 12, 9).toISOString(),
                  end: new Date(2026, 8, 12, 10).toISOString(),
                  durationSeconds: 3600,
                }],
              })],
            }),
            timeline({
              id: "ios|iPhone",
              deviceName: "iPhone",
              devicePlatform: "ios",
              blocks: [block({ id: "phone-live", title: "Safari", deviceName: "iPhone", devicePlatform: "ios" })],
            }),
          ],
        })}
      />,
    );

    const mac = screen.getByTestId("calendar-device-column-macos|Studio Mac");
    const phone = screen.getByTestId("calendar-device-column-ios|iPhone");
    expect(within(mac).getByText("Tracking...")).toBeVisible();
    expect(within(mac).queryByText("Notes")).toBeNull();
    expect(within(phone).getByText("Safari")).toBeVisible();
    expect(within(phone).queryByText("Tracking...")).toBeNull();
  });

  it("centers the current time in the day board viewport", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 8, 12, 12).getTime());
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("data-testid") === "calendar-day-board" ? 400 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("day-board-head") ? 32 : 0;
    });

    render(<CalendarScreen state={snapshot()} />);
    const board = screen.getByTestId("calendar-day-board");
    await waitFor(() => {
      expect(board.scrollTop).toBe(dayBoardScrollTop({
        isToday: true,
        nowY: 12 / 24 * 48 * 24,
        firstEntryTop: null,
        viewportHeight: 400,
        headerHeight: 32,
      }));
    });
  });
});

describe("dayBoardScrollTop", () => {
  it("puts the now line in the middle of the visible timeline", () => {
    expect(dayBoardScrollTop({
      isToday: true,
      nowY: 576,
      firstEntryTop: 96,
      viewportHeight: 400,
      headerHeight: 32,
    })).toBe(392);
  });

  it("falls back to the first entry on other days", () => {
    expect(dayBoardScrollTop({
      isToday: false,
      nowY: 576,
      firstEntryTop: 96,
      viewportHeight: 400,
      headerHeight: 32,
    })).toBe(56);
  });
});

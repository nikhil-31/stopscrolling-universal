// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "@shared/calendar-workspace";
import { toDateInput } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import type { CalendarOverlayEvent, ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "@shared/types";
import { dayBoardScrollTop } from "../components/calendar/DayBoard";
import { layoutOverlaps } from "../components/calendar/events";
import { SessionTitleProvider } from "../session-title";
import { CalendarScreen } from "./CalendarScreen";

const desktop = {
  setCalendarAnchor: vi.fn(),
  setCalendarMonth: vi.fn(),
  setCalendarView: vi.fn(),
  openSettings: vi.fn(),
  selectInspector: vi.fn(),
};

const noon = new Date(2026, 8, 12, 12);

function calendarEvent(patch: Partial<CalendarOverlayEvent> & Pick<CalendarOverlayEvent, "id" | "title">): CalendarOverlayEvent {
  return {
    start: new Date(2026, 8, 12, 9).toISOString(),
    end: new Date(2026, 8, 12, 10).toISOString(),
    calendarId: "work",
    calendarName: "Work",
    isAllDay: false,
    colorHex: null,
    provider: "google",
    ...patch,
  };
}

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
    settings: { showCalendarEvents: true },
    calendarIntegration: {
      google: { available: true, connecting: false, accounts: [] },
      apple: { access: "unsupported" },
      calendars: [],
      errors: [],
    },
    calendarDayStats: {
      workSeconds: 3600,
      pendingSeconds: 600,
      trackedSeconds: 5400,
      targetSeconds: 28800,
      percentOfTarget: 12,
      labelTotals: [{ labelId: "label-research", name: "Research", color: "#1fb894", seconds: 3600 }],
      deviceTotals: [
        { key: "macos|Studio Mac", devicePlatform: "macos", deviceName: "Studio Mac", seconds: 2 * 3600 },
        { key: "ios|iPhone", devicePlatform: "ios", deviceName: "iPhone", seconds: 30 * 60 },
      ],
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
  vi.useRealTimers();
});

describe("CalendarScreen", () => {
  it("keeps time entries and calendar without labels or tasks", () => {
    render(<CalendarScreen state={snapshot({
      devices: [{
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
        colorIndex: 0,
      }],
    })} />);

    expect(screen.getByText("Time Entries")).toBeVisible();
    expect(screen.getByText("Calendar")).toBeVisible();
    const summary = screen.getByRole("complementary", { name: "Day summary" });
    expect(within(summary).getByText("Day total")).toBeVisible();
    expect(summary.querySelector(".calendar-work-value")).toHaveTextContent("1 hr 30 min");
    expect(within(summary).getByText("Work Hours").nextElementSibling).toHaveTextContent("1 hr");
    expect(within(summary).getByText("Work Mac")).toBeVisible();
    expect(within(summary).getByText("2 hr")).toBeVisible();
    expect(within(summary).getByText("iPhone")).toBeVisible();
    expect(within(summary).getByText("30 min")).toBeVisible();
    expect(within(summary).queryByText("Focus")).toBeNull();
    expect(within(summary).queryByText("Meetings")).toBeNull();
    expect(within(summary).queryByText("Breaks")).toBeNull();
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
              colorIndex: 0,
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
              colorIndex: 1,
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
    expect(screen.getAllByText("Work Mac")).toHaveLength(2);
    expect(screen.getAllByText("iPhone")).toHaveLength(2);
    expect(screen.queryByText("Studio Mac")).toBeNull();

    const mac = screen.getByTestId("calendar-device-column-macos|Studio Mac");
    const phone = screen.getByTestId("calendar-device-column-ios|iPhone");
    expect(within(mac).getByText("Writing")).toBeVisible();
    expect(within(mac).queryByText("Safari")).toBeNull();
    expect(within(phone).getByText("Safari")).toBeVisible();
    expect(within(phone).queryByText("Writing")).toBeNull();
    expect(within(mac).getByRole("button", { name: /Writing/ })).toHaveStyle({ "--block-color": "var(--device-0)" });
    expect(within(phone).getByRole("button", { name: /Safari/ })).toHaveStyle({ "--block-color": "var(--device-1)" });
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

  it("titles day and week blocks like the Timesheet", () => {
    const summaries = { "mac-block": { status: "ready" as const, summary: "Wrote the launch post in Writing." } };
    const timelines = [
      timeline({
        id: "macos|Studio Mac",
        deviceName: "Studio Mac",
        devicePlatform: "macos",
        blocks: [
          block({ id: "mac-block", title: "Writing", deviceName: "Studio Mac", devicePlatform: "macos" }),
          block({
            id: "mac-safari",
            title: "Pull requests",
            deviceName: "Studio Mac",
            devicePlatform: "macos",
            start: new Date(2026, 8, 12, 11).toISOString(),
            end: new Date(2026, 8, 12, 12).toISOString(),
            items: [{
              id: "github",
              title: "Pull requests",
              subtitle: "github.com",
              url: "https://github.com/pulls",
              category: "Productivity",
              appName: "Safari",
              start: new Date(2026, 8, 12, 11).toISOString(),
              end: new Date(2026, 8, 12, 12).toISOString(),
              durationSeconds: 3600,
            }],
          }),
        ],
      }),
    ];
    const { rerender } = render(
      <SessionTitleProvider value={summaries}>
        <CalendarScreen state={snapshot({ timelines })} />
      </SessionTitleProvider>,
    );
    const day = screen.getByTestId("calendar-day-board");
    const titled = within(day).getByRole("button", { name: /Wrote the launch post in Writing\./ });
    expect(titled).toHaveAttribute("title", "Wrote the launch post in Writing.");
    expect(titled).toHaveTextContent("Wrote the launch post in Writing.");
    expect(within(day).getByText("github.com")).toBeVisible();
    expect(within(day).queryByText("Pull requests")).toBeNull();

    rerender(
      <SessionTitleProvider value={summaries}>
        <CalendarScreen state={snapshot({ timelines, calendarView: "week" })} />
      </SessionTitleProvider>,
    );
    const saturday = screen.getByTestId("calendar-week-day-2026-09-12-macos|Studio Mac");
    const weekTitle = within(saturday).getByRole("button", { name: /Wrote the launch post in Writing\./ });
    expect(weekTitle).toHaveAttribute("title", "Wrote the launch post in Writing.");
    expect(within(saturday).getByText("Wrote the launch post in Writing.")).toBeVisible();
    expect(within(saturday).getByText("github.com")).toBeVisible();
  });

  it("combines calendar sessions that start less than 10 minutes apart", () => {
    render(
      <CalendarScreen
        state={snapshot({
          timelines: [
            timeline({
              id: "macos|Studio Mac",
              deviceName: "Studio Mac",
              devicePlatform: "macos",
              blocks: [
                block({
                  id: "writing",
                  title: "Writing",
                  deviceName: "Studio Mac",
                  devicePlatform: "macos",
                  start: new Date(2026, 8, 12, 9).toISOString(),
                  end: new Date(2026, 8, 12, 9, 20).toISOString(),
                  durationSeconds: 20 * 60,
                }),
                block({
                  id: "mail",
                  title: "Mail",
                  deviceName: "Studio Mac",
                  devicePlatform: "macos",
                  start: new Date(2026, 8, 12, 9, 28).toISOString(),
                  end: new Date(2026, 8, 12, 9, 40).toISOString(),
                  durationSeconds: 12 * 60,
                }),
                block({
                  id: "notes",
                  title: "Notes",
                  deviceName: "Studio Mac",
                  devicePlatform: "macos",
                  start: new Date(2026, 8, 12, 9, 50).toISOString(),
                  end: new Date(2026, 8, 12, 10).toISOString(),
                  durationSeconds: 10 * 60,
                }),
              ],
            }),
          ],
        })}
      />,
    );
    const column = screen.getByTestId("calendar-device-column-macos|Studio Mac");
    const buttons = within(column).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName(/Writing/);
    expect(buttons[0]).toHaveAccessibleName(/Mail/);
    expect(buttons[1]).toHaveAccessibleName(/^Notes,/);
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

  it("places timed blocks on the Monday week grid", () => {
    render(
      <CalendarScreen
        state={snapshot({
          calendarView: "week",
          timelines: [
            timeline({
              id: "macos|Studio Mac",
              deviceName: "Studio Mac",
              devicePlatform: "macos",
              blocks: [
                block({
                  id: "monday-mail",
                  title: "Mail",
                  deviceName: "Studio Mac",
                  devicePlatform: "macos",
                  start: new Date(2026, 8, 7, 1).toISOString(),
                  end: new Date(2026, 8, 7, 1, 7).toISOString(),
                  durationSeconds: 7 * 60,
                }),
                block({
                  id: "sat-writing",
                  title: "Writing",
                  deviceName: "Studio Mac",
                  devicePlatform: "macos",
                  start: new Date(2026, 8, 12, 9).toISOString(),
                  end: new Date(2026, 8, 12, 10).toISOString(),
                }),
              ],
            }),
            timeline({
              id: "ios|iPhone",
              deviceName: "iPhone",
              devicePlatform: "ios",
              blocks: [block({
                id: "sat-safari",
                title: "Safari",
                deviceName: "iPhone",
                devicePlatform: "ios",
                start: new Date(2026, 8, 12, 9).toISOString(),
                end: new Date(2026, 8, 12, 10).toISOString(),
              })],
            }),
          ],
        })}
      />,
    );

    expect(screen.getByTestId("calendar-week-board")).toBeVisible();
    expect(screen.getAllByTestId(/calendar-week-day-/)).toHaveLength(14);
    expect(screen.getAllByText("Studio Mac")).toHaveLength(7);
    expect(screen.getAllByText("iPhone")).toHaveLength(7);
    expect(screen.getByRole("heading", { name: "September 7–13, 2026" })).toBeVisible();
    expect(screen.queryByTestId("calendar-week-strip")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Day summary" })).toBeNull();

    const mondayMac = screen.getByTestId("calendar-week-day-2026-09-07-macos|Studio Mac");
    const saturdayMac = screen.getByTestId("calendar-week-day-2026-09-12-macos|Studio Mac");
    const saturdayPhone = screen.getByTestId("calendar-week-day-2026-09-12-ios|iPhone");
    const shortBlock = within(mondayMac).getByRole("button", { name: /Mail/ });
    expect(shortBlock).toHaveTextContent("Mail");
    expect(shortBlock).not.toHaveTextContent("0:07");
    expect(shortBlock).toHaveAttribute("title", "Mail");
    expect(within(saturdayMac).getByText("Writing")).toBeVisible();
    expect(within(saturdayMac).queryByText("Safari")).toBeNull();
    expect(within(saturdayPhone).getByText("Safari")).toBeVisible();
    expect(within(saturdayPhone).queryByText("Writing")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(toDateInput(new Date(desktop.setCalendarAnchor.mock.calls[0][0]))).toBe("2026-09-05");
  });

  it("lists four month chips and the rest as more", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 12));
    const titles = ["Writing", "Reading", "Mail", "Notes", "Safari"];
    render(
      <CalendarScreen
        state={snapshot({
          calendarView: "month",
          devices: [{
            visibilityKey: "macos|Studio Mac",
            deviceName: "Studio Mac",
            nickname: "",
            devicePlatform: "macos",
            deviceID: "mac-1",
            sessionCount: 4,
            timeZone: "UTC",
            lastSeenAt: null,
            lastOnlineAt: null,
            reportedOnline: null,
            isOnline: true,
            isRegistered: true,
            colorIndex: 0,
          }],
          timelines: [
            timeline({
              id: "macos|Studio Mac",
              deviceName: "Studio Mac",
              devicePlatform: "macos",
              blocks: titles.map((title, index) => {
                const minutes = (index + 1) * 10;
                const start = new Date(2026, 8, 12, 9 + index);
                const end = new Date(start.getTime() + minutes * 60 * 1000);
                return block({
                  id: `month-${title}`,
                  title,
                  deviceName: "Studio Mac",
                  devicePlatform: "macos",
                  start: start.toISOString(),
                  end: end.toISOString(),
                  durationSeconds: minutes * 60,
                });
              }),
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "September 2026" })).toBeVisible();
    expect(screen.getByText("Monday")).toBeVisible();
    expect(screen.getByText("Sunday")).toBeVisible();
    expect(screen.queryByRole("complementary", { name: "Day summary" })).toBeNull();
    expect(document.querySelector(".month-day")).toBeNull();
    expect(screen.getByTestId("calendar-month-day-2026-08-31")).toHaveClass("is-outside");
    expect(screen.getByTestId("calendar-month-day-2026-09-26")).toHaveClass("is-today");

    const saturday = screen.getByTestId("calendar-month-day-2026-09-12");
    expect(within(saturday).getByRole("button", { name: /Safari/ })).toHaveStyle({ "--block-color": "var(--device-0)" });
    expect(within(saturday).getByText("Safari")).toBeVisible();
    expect(within(saturday).getByText("50 min")).toBeVisible();
    expect(within(saturday).getByText("Notes")).toBeVisible();
    expect(within(saturday).getByText("Mail")).toBeVisible();
    expect(within(saturday).getByText("Reading")).toBeVisible();
    expect(within(saturday).queryByText("Writing")).toBeNull();
    expect(within(saturday).getByRole("button", { name: "1 more" })).toBeVisible();

    fireEvent.click(within(saturday).getByRole("button", { name: /Safari/ }));
    expect(desktop.selectInspector).toHaveBeenCalledWith(expect.objectContaining({
      kind: "block",
      block: expect.objectContaining({ title: "Safari" }),
    }));

    fireEvent.click(within(saturday).getByRole("button", { name: "1 more" }));
    expect(desktop.setCalendarView).toHaveBeenCalledWith("day");
    expect(toDateInput(new Date(desktop.setCalendarAnchor.mock.calls[0][0]))).toBe("2026-09-12");

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(toDateInput(new Date(desktop.setCalendarMonth.mock.calls.at(-1)?.[0]))).toBe("2026-08-01");
  });

  it("opens a label suggestion from the live week block", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 8, 12, 9, 30).getTime());
    render(
      <CalendarScreen
        state={snapshot({
          calendarView: "week",
          isTracking: true,
          calendarWorkspace: defaultWorkspace(),
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
          ],
        })}
      />,
    );

    expect(screen.getByText("Click to create suggestion")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Tracking/ }));
    expect(screen.getByRole("heading", { name: "Apply label" })).toBeVisible();
    expect(desktop.selectInspector).not.toHaveBeenCalled();
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

describe("CalendarScreen navigation and scanning", () => {
  const studio = timeline({
    id: "macos|Studio Mac",
    deviceName: "Studio Mac",
    devicePlatform: "macos",
    blocks: [block({ id: "focus", title: "Xcode", deviceName: "Studio Mac", devicePlatform: "macos" })],
  });

  it("names the summary after the day instead of a placeholder", () => {
    vi.useFakeTimers();
    vi.setSystemTime(noon);
    render(<CalendarScreen state={snapshot()} />);
    const summary = screen.getByRole("complementary", { name: "Day summary" });
    expect(within(summary).getByText("Today")).toBeVisible();
    expect(within(summary).getByText("Devices")).toBeVisible();
    expect(summary).not.toHaveTextContent(">>");
  });

  it("shows all-day events in a strip above the day grid", () => {
    render(<CalendarScreen state={snapshot({
      calendarEvents: [
        calendarEvent({ id: "holiday", title: "Company offsite", start: "2026-09-12", end: "2026-09-13", isAllDay: true }),
        calendarEvent({ id: "tomorrow", title: "Next day trip", start: "2026-09-13", end: "2026-09-14", isAllDay: true }),
      ],
    })} />);
    expect(screen.getByText("All day")).toBeVisible();
    expect(document.querySelector(".day-board-allday")).toHaveTextContent("Company offsite");
    expect(document.querySelector(".day-board-allday")).not.toHaveTextContent("Next day trip");
  });

  it("shows only the anchor day's timed events in the day view", () => {
    render(<CalendarScreen state={snapshot({
      calendarEvents: [
        calendarEvent({ id: "standup", title: "Standup" }),
        calendarEvent({
          id: "later",
          title: "Retro",
          start: new Date(2026, 8, 14, 9).toISOString(),
          end: new Date(2026, 8, 14, 10).toISOString(),
        }),
      ],
    })} />);
    const column = document.querySelector(".day-board-calendar")!;
    expect(column).toHaveTextContent("Standup");
    expect(column).not.toHaveTextContent("Retro");
    expect(within(column as HTMLElement).getByTitle(/Work \(Google\)/)).toBeVisible();
  });

  it("puts week events under the day they happen and keeps multi-day all-day events on each day", () => {
    render(<CalendarScreen state={snapshot({
      calendarView: "week",
      calendarEvents: [
        calendarEvent({ id: "standup", title: "Standup", provider: "apple", calendarName: "Home" }),
        calendarEvent({ id: "trip", title: "Trip", start: "2026-09-10", end: "2026-09-12", isAllDay: true }),
      ],
    })} />);
    expect(screen.getByTestId("calendar-week-events-2026-09-12")).toHaveTextContent("Standup");
    expect(screen.getByTestId("calendar-week-events-2026-09-11")).not.toHaveTextContent("Standup");
    expect(screen.getByTitle(/Standup[\s\S]*Home \(Apple\)/)).toBeVisible();
    const allDay = document.querySelectorAll(".week-board-allday");
    // Monday 7 Sept is the first column; the trip covers Thursday and Friday (end date excluded).
    expect([...allDay].map((cell) => cell.textContent)).toEqual(["", "", "", "Trip", "Trip", "", ""]);
  });

  it("lists a day's events first in the month view and counts the rest as more", () => {
    render(<CalendarScreen state={snapshot({
      calendarView: "month",
      timelines: [studio],
      calendarEvents: [
        calendarEvent({ id: "a", title: "Standup" }),
        calendarEvent({ id: "b", title: "Design review", start: new Date(2026, 8, 12, 14).toISOString(), end: new Date(2026, 8, 12, 15).toISOString() }),
        calendarEvent({ id: "c", title: "Dinner", start: new Date(2026, 8, 12, 19).toISOString(), end: new Date(2026, 8, 12, 20).toISOString() }),
      ],
    })} />);
    const saturday = screen.getByTestId("calendar-month-day-2026-09-12");
    const events = saturday.querySelectorAll(".calendar-month-event");
    expect([...events].map((event) => event.querySelector("strong")?.textContent)).toEqual(["Standup", "Design review"]);
    expect(within(saturday).getByRole("button", { name: /1 more/ })).toBeVisible();
  });

  it("says when a day has no tracked activity", () => {
    render(<CalendarScreen state={snapshot({ calendarAnchor: new Date(2026, 0, 5, 12).toISOString() })} />);
    expect(screen.getByText("No activity recorded")).toBeVisible();
  });

  it("opens a day from the week header and shows each day's total", () => {
    render(<CalendarScreen state={snapshot({ calendarView: "week", timelines: [studio] })} />);
    const saturday = screen.getByRole("button", { name: /Open Saturday 12/ });
    expect(saturday).toHaveTextContent("1 hr");
    fireEvent.click(saturday);
    expect(desktop.setCalendarView).toHaveBeenCalledWith("day");
    expect(toDateInput(new Date(desktop.setCalendarAnchor.mock.calls[0][0]))).toBe("2026-09-12");
  });

  it("opens a day from the month date and tints busier days", () => {
    render(<CalendarScreen state={snapshot({ calendarView: "month", timelines: [studio] })} />);
    const saturday = screen.getByTestId("calendar-month-day-2026-09-12");
    expect(saturday.querySelector(".calendar-month-total")).toHaveTextContent("1 hr");
    expect(saturday.style.getPropertyValue("--cell-intensity")).toBe("14%");
    expect(screen.getByTestId("calendar-month-day-2026-09-13").style.getPropertyValue("--cell-intensity")).toBe("0%");
    fireEvent.click(within(saturday).getByRole("button", { name: /^Open / }));
    expect(desktop.setCalendarView).toHaveBeenCalledWith("day");
    expect(toDateInput(new Date(desktop.setCalendarAnchor.mock.calls[0][0]))).toBe("2026-09-12");
  });

  it("steps and switches views from the keyboard but not while a dialog is open", () => {
    render(<CalendarScreen state={snapshot()} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(toDateInput(new Date(desktop.setCalendarAnchor.mock.calls[0][0]))).toBe("2026-09-13");
    fireEvent.keyDown(window, { key: "w" });
    expect(desktop.setCalendarView).toHaveBeenCalledWith("week");
    fireEvent.keyDown(window, { key: "w", metaKey: true });
    expect(desktop.setCalendarView).toHaveBeenCalledTimes(1);
  });
});

describe("layoutOverlaps", () => {
  const event = (id: string, startHour: number, endHour: number) => calendarEvent({
    id,
    title: id,
    start: new Date(2026, 8, 12, startHour).toISOString(),
    end: new Date(2026, 8, 12, endHour).toISOString(),
  });

  it("puts overlapping events side by side and leaves separate ones full width", () => {
    const placed = layoutOverlaps([event("a", 9, 11), event("b", 10, 12), event("c", 13, 14)]);
    const byId = Object.fromEntries(placed.map((item) => [item.event.id, item]));
    expect(byId.a).toMatchObject({ column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ column: 0, columns: 1 });
  });

  it("reuses a freed column inside the same cluster", () => {
    const placed = layoutOverlaps([event("long", 9, 13), event("early", 9, 10), event("late", 11, 12)]);
    const byId = Object.fromEntries(placed.map((item) => [item.event.id, item]));
    expect(byId.early.column).toBe(byId.late.column);
    expect(byId.long.columns).toBe(2);
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

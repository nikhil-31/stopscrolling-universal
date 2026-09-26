// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveBlocks, defaultWorkspace } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeDeviceTimeline, ScreenTimeSessionBlock } from "@shared/types";
import { TimesheetScreen } from "./TimesheetScreen";

const desktop = {
  setCalendarAnchor: vi.fn(),
  setCalendarMonth: vi.fn(),
  setCalendarView: vi.fn(),
  openSettings: vi.fn(),
  selectInspector: vi.fn(),
  approveTimesheetEntries: vi.fn(),
  unapproveTimesheetEntry: vi.fn(),
  skipCalendarBlock: vi.fn(),
  reviewCalendarBlock: vi.fn(),
  assignCalendarLabel: vi.fn(),
};

const monday = new Date(2026, 8, 14, 12);

function block(id: string, title: string, startHour: number, minutes: number, day = 14): ScreenTimeSessionBlock {
  const start = new Date(2026, 8, day, startHour).toISOString();
  const end = new Date(new Date(2026, 8, day, startHour).getTime() + minutes * 60_000).toISOString();
  return {
    id,
    title,
    subtitle: title,
    category: "Productivity",
    start,
    end,
    durationSeconds: minutes * 60,
    deviceName: "Studio Mac",
    devicePlatform: "macos",
    items: [{
      id: `${id}-item`,
      title: `${title} window`,
      subtitle: title,
      url: "",
      category: "Productivity",
      appName: title,
      start,
      end,
      durationSeconds: minutes * 60,
    }],
  };
}

const xcode = block("block-1-2", "Xcode", 9, 60);
const slack = block("block-3-4", "Slack", 11, 30);
const figma = block("block-5-6", "Figma", 10, 45, 15);

function timeline(blocks: ScreenTimeSessionBlock[]): ScreenTimeDeviceTimeline {
  return {
    id: "mac",
    deviceName: "Studio Mac",
    devicePlatform: "macos",
    timeZoneIdentifier: "UTC",
    dayStart: new Date(2026, 8, 14).toISOString(),
    dayEnd: new Date(2026, 8, 15).toISOString(),
    segments: [],
    blocks,
  };
}

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "timesheet",
    isTracking: false,
    currentContext: null,
    capabilities: { platform: "macos" },
    calendarView: "day",
    calendarAnchor: monday.toISOString(),
    calendarMonth: monday.toISOString(),
    calendarEvents: [],
    timelines: [timeline([xcode, slack, figma])],
    calendarWorkspace: defaultWorkspace(),
    timesheetSummaries: {},
    devices: [],
    settings: { showGoogleCalendarEvents: true },
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

describe("TimesheetScreen", () => {
  it("shows the day's entries to review with stats and tab counts", () => {
    render(<TimesheetScreen state={snapshot()} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Timesheet");
    const stats = screen.getByTestId("timesheet-stats");
    expect(within(stats).getByText("Pending review").nextElementSibling).toHaveTextContent("1 hr 30 min");
    expect(within(stats).getByText("0/2 approved")).toBeVisible();
    expect(screen.getByRole("tab", { name: "To Review 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All Entries 2" })).toBeVisible();
    expect(screen.getByTestId("timesheet-row-block-1-2")).toHaveTextContent("Xcode");
    expect(screen.getByTestId("timesheet-row-block-3-4")).toHaveTextContent("Slack");
    expect(screen.queryByTestId("timesheet-row-block-5-6")).toBeNull();
  });

  it("uses AI summaries as descriptions", () => {
    render(<TimesheetScreen state={snapshot({
      timesheetSummaries: { "block-1-2": { status: "ready", summary: "Built the Timesheet table in Xcode." } },
    })} />);

    expect(screen.getByText("Built the Timesheet table in Xcode.")).toBeVisible();
    expect(screen.getByLabelText("AI summary")).toBeInTheDocument();
  });

  it("accepts one entry and approves all or selected entries", () => {
    render(<TimesheetScreen state={snapshot()} />);

    fireEvent.click(within(screen.getByTestId("timesheet-row-block-1-2")).getByRole("button", { name: "Accept" }));
    expect(desktop.approveTimesheetEntries).toHaveBeenLastCalledWith([
      { id: xcode.id, start: xcode.start, end: xcode.end, category: xcode.category },
    ]);

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    expect(desktop.approveTimesheetEntries.mock.lastCall?.[0].map((entry: { id: string }) => entry.id))
      .toEqual(["block-1-2", "block-3-4"]);

    fireEvent.click(screen.getByLabelText("Select entry Slack"));
    fireEvent.click(screen.getByRole("button", { name: /Approve Selected \(1\)/ }));
    expect(desktop.approveTimesheetEntries.mock.lastCall?.[0].map((entry: { id: string }) => entry.id))
      .toEqual(["block-3-4"]);
  });

  it("moves approved entries to the Approved tab with an undo action", () => {
    const workspace = approveBlocks(defaultWorkspace(), [xcode]);
    render(<TimesheetScreen state={snapshot({ calendarWorkspace: workspace })} />);

    expect(screen.queryByTestId("timesheet-row-block-1-2")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Approved 1" }));
    fireEvent.click(within(screen.getByTestId("timesheet-row-block-1-2")).getByRole("button", { name: "Undo" }));
    expect(desktop.unapproveTimesheetEntry).toHaveBeenCalledWith("block-1-2");
  });

  it("puts the live entry under Processing and blocks approval", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(slack.end).getTime() - 60_000);
    render(<TimesheetScreen state={snapshot({ isTracking: true })} />);

    fireEvent.click(screen.getByRole("tab", { name: "Processing 1" }));
    const row = screen.getByTestId("timesheet-row-block-3-4");
    expect(row).toHaveTextContent("Tracking…");
    expect(within(row).getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("opens the label and review prompts", () => {
    render(<TimesheetScreen state={snapshot()} />);

    fireEvent.click(within(screen.getByTestId("timesheet-row-block-1-2")).getByTitle(/Suggested label/));
    expect(screen.getByRole("dialog")).toHaveTextContent("Apply label");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /Review Time Entries \(2\)/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2 unlabeled blocks in this period");
    expect(dialog).toHaveTextContent("Xcode");
    expect(dialog).toHaveTextContent("Slack");
  });

  it("offers skip and details from the row menu", () => {
    render(<TimesheetScreen state={snapshot()} />);
    const row = screen.getByTestId("timesheet-row-block-1-2");

    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
    fireEvent.click(within(row).getByRole("menuitem", { name: "Skip" }));
    expect(desktop.skipCalendarBlock).toHaveBeenCalledWith("block-1-2");

    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
    fireEvent.click(within(row).getByRole("menuitem", { name: "Open details" }));
    expect(desktop.selectInspector).toHaveBeenCalledWith({ kind: "block", block: xcode });
  });

  it("groups week entries by day and can regroup or hide columns", () => {
    render(<TimesheetScreen state={snapshot({ calendarView: "week" })} />);

    expect(screen.getByRole("tab", { name: "To Review 3" })).toBeVisible();
    const groups = screen.getAllByRole("rowgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("2 entries");
    expect(groups[1]).toHaveTextContent("1 entry");

    fireEvent.click(screen.getByRole("button", { name: /Group By: Day/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Device" }));
    expect(screen.getAllByRole("rowgroup")).toHaveLength(1);
    expect(screen.getByRole("rowgroup")).toHaveTextContent("Studio Mac");

    expect(screen.getByRole("columnheader", { name: "Device" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Device" }));
    expect(screen.queryByRole("columnheader", { name: "Device" })).toBeNull();
  });
});

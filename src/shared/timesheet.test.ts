import { describe, expect, it } from "vitest";
import { approveBlocks, defaultWorkspace, normalizeWorkspace, unapproveBlock } from "./calendar-workspace";
import {
  blocksNeedingSummaries,
  buildTimesheetRows,
  fallbackDescription,
  groupTimesheetRows,
  rowsForTab,
  rowsInPeriod,
  timesheetEntryPayload,
  timesheetPeriodBounds,
  timesheetStats,
} from "./timesheet";
import type { ScreenTimeDeviceTimeline, ScreenTimeSessionBlock, ScreenTimeSessionBlockItem } from "./types";

const UTC = "UTC";

function item(id: string, appName: string, start: string, end: string, url = ""): ScreenTimeSessionBlockItem {
  return {
    id,
    title: `${appName} window`,
    subtitle: appName,
    url,
    category: "Productivity",
    appName,
    start,
    end,
    durationSeconds: (Date.parse(end) - Date.parse(start)) / 1000,
  };
}

function block(id: string, start: string, end: string, items?: ScreenTimeSessionBlockItem[], patch: Partial<ScreenTimeSessionBlock> = {}): ScreenTimeSessionBlock {
  return {
    id,
    title: "Xcode",
    subtitle: "Xcode",
    category: "Productivity",
    start,
    end,
    durationSeconds: (Date.parse(end) - Date.parse(start)) / 1000,
    items: items ?? [item(`${id}-item`, "Xcode", start, end)],
    deviceName: "Studio Mac",
    devicePlatform: "macos",
    ...patch,
  };
}

function timeline(id: string, blocks: ScreenTimeSessionBlock[], patch: Partial<ScreenTimeDeviceTimeline> = {}): ScreenTimeDeviceTimeline {
  return {
    id,
    deviceName: "Studio Mac",
    devicePlatform: "macos",
    timeZoneIdentifier: UTC,
    dayStart: "2026-09-14T00:00:00.000Z",
    dayEnd: "2026-09-15T00:00:00.000Z",
    segments: [],
    blocks,
    ...patch,
  };
}

const morning = block("block-a-b", "2026-09-14T09:00:00.000Z", "2026-09-14T10:00:00.000Z");
const afternoon = block("block-c-d", "2026-09-14T13:00:00.000Z", "2026-09-14T13:30:00.000Z");
const tuesday = block("block-e-f", "2026-09-15T08:00:00.000Z", "2026-09-15T08:45:00.000Z");

function rows(options: Partial<Parameters<typeof buildTimesheetRows>[0]> = {}) {
  return buildTimesheetRows({
    timelines: [timeline("mac", [afternoon, morning, tuesday])],
    workspace: defaultWorkspace(),
    summaries: {},
    isLive: () => false,
    ...options,
  });
}

describe("fallbackDescription", () => {
  it("names the top apps and websites by time", () => {
    const mixed = block("mixed", "2026-09-14T09:00:00.000Z", "2026-09-14T10:00:00.000Z", [
      item("1", "Safari", "2026-09-14T09:00:00.000Z", "2026-09-14T09:10:00.000Z", "https://github.com/pulls"),
      item("2", "Xcode", "2026-09-14T09:10:00.000Z", "2026-09-14T09:40:00.000Z"),
      item("3", "Slack", "2026-09-14T09:40:00.000Z", "2026-09-14T09:45:00.000Z"),
      item("4", "Notes", "2026-09-14T09:45:00.000Z", "2026-09-14T09:47:00.000Z"),
    ]);
    expect(fallbackDescription(mixed)).toBe("Xcode, github.com and Slack");
  });

  it("falls back to the block title without items", () => {
    expect(fallbackDescription(block("empty", morning.start, morning.end, [], { title: "Idle" }))).toBe("Idle");
  });
});

describe("timesheetEntryPayload", () => {
  it("sends items longest first with hostnames and whole seconds", () => {
    const payload = timesheetEntryPayload(block("p", "2026-09-14T09:00:00.000Z", "2026-09-14T09:30:00.000Z", [
      item("1", "Safari", "2026-09-14T09:00:00.000Z", "2026-09-14T09:05:00.000Z", "https://docs.python.org/3/"),
      item("2", "Xcode", "2026-09-14T09:05:00.000Z", "2026-09-14T09:30:00.000Z"),
    ]));
    expect(payload.entry_id).toBe("p");
    expect(payload.items.map((entry) => [entry.app_name, entry.hostname, entry.seconds])).toEqual([
      ["Xcode", "", 1500],
      ["Safari", "docs.python.org", 300],
    ]);
  });
});

describe("buildTimesheetRows", () => {
  it("sorts entries by start and skips skipped blocks", () => {
    const workspace = { ...defaultWorkspace(), skippedBlockIds: ["block-c-d"] };
    expect(rows({ workspace }).map((row) => row.id)).toEqual(["block-a-b", "block-e-f"]);
  });

  it("dedupes blocks that appear on more than one timeline", () => {
    const list = rows({ timelines: [timeline("a", [morning]), timeline("b", [morning])] });
    expect(list).toHaveLength(1);
  });

  it("derives status from approval, live tracking and pending summaries", () => {
    const workspace = { ...defaultWorkspace(), approvedBlockIds: ["block-a-b"] };
    const list = rows({
      workspace,
      summaries: { "block-e-f": { status: "pending", summary: "" } },
      isLive: (entry) => entry.id === "block-c-d",
    });
    expect(Object.fromEntries(list.map((row) => [row.id, row.status]))).toEqual({
      "block-a-b": "approved",
      "block-c-d": "processing",
      "block-e-f": "processing",
    });
    expect(list.find((row) => row.id === "block-c-d")?.live).toBe(true);
  });

  it("uses ready AI summaries and falls back otherwise", () => {
    const list = rows({ summaries: { "block-a-b": { status: "ready", summary: "Built the timesheet screen in Xcode." } } });
    const [first, second] = list;
    expect(first.description).toBe("Built the timesheet screen in Xcode.");
    expect(first.aiDescription).toBe(true);
    expect(second.description).toBe("Xcode");
    expect(second.aiDescription).toBe(false);
  });

  it("reports assigned labels and suggestions", () => {
    const labeled = approveBlocks(defaultWorkspace(), [morning]);
    const list = rows({ workspace: labeled });
    const first = list.find((row) => row.id === morning.id)!;
    const second = list.find((row) => row.id === afternoon.id)!;
    expect(first.label).not.toBeNull();
    expect(first.suggestedLabel).toBeNull();
    expect(first.assignmentId).toBeTruthy();
    expect(second.label).toBeNull();
    expect(second.suggestedLabel).not.toBeNull();
  });
});

describe("approveBlocks", () => {
  it("labels unlabeled blocks with the suggestion and records approval once", () => {
    const once = approveBlocks(defaultWorkspace(), [morning]);
    const twice = approveBlocks(once, [morning]);
    expect(twice.approvedBlockIds).toEqual([morning.id]);
    expect(twice.assignments).toHaveLength(1);
    expect(unapproveBlock(twice, morning.id).approvedBlockIds).toEqual([]);
  });

  it("survives workspace normalization", () => {
    expect(normalizeWorkspace({ approvedBlockIds: ["x", 3 as unknown as string] }).approvedBlockIds).toEqual(["x"]);
    expect(normalizeWorkspace({}).approvedBlockIds).toEqual([]);
  });
});

describe("stats, tabs and grouping", () => {
  const workspace = { ...defaultWorkspace(), approvedBlockIds: ["block-a-b"] };
  const list = rows({ workspace, isLive: (entry) => entry.id === "block-e-f" });

  it("totals pending, approved and processing time", () => {
    expect(timesheetStats(list)).toEqual({
      pendingSeconds: 30 * 60 + 45 * 60,
      pendingCount: 2,
      approvedSeconds: 3600,
      approvedCount: 1,
      totalSeconds: 3600 + 30 * 60 + 45 * 60,
      totalCount: 3,
      processingCount: 1,
      processingSeconds: 45 * 60,
    });
  });

  it("filters rows for each tab", () => {
    expect(rowsForTab(list, "review").map((row) => row.id)).toEqual(["block-c-d"]);
    expect(rowsForTab(list, "processing").map((row) => row.id)).toEqual(["block-e-f"]);
    expect(rowsForTab(list, "approved").map((row) => row.id)).toEqual(["block-a-b"]);
    expect(rowsForTab(list, "all")).toHaveLength(3);
  });

  it("groups by day in order and by label or device by total time", () => {
    const byDay = groupTimesheetRows(list, "day", { timeZone: UTC });
    expect(byDay.map((group) => [group.key, group.rows.length, group.seconds])).toEqual([
      ["2026-09-14", 2, 5400],
      ["2026-09-15", 1, 2700],
    ]);
    const byLabel = groupTimesheetRows(list, "label");
    expect(byLabel[0].seconds).toBeGreaterThanOrEqual(byLabel[byLabel.length - 1].seconds);
    expect(byLabel.some((group) => group.label === "No Label")).toBe(true);
    const byDevice = groupTimesheetRows(list, "device", { deviceName: () => "Work Mac" });
    expect(byDevice).toHaveLength(1);
    expect(byDevice[0].label).toBe("Work Mac");
    expect(groupTimesheetRows(list, "none")).toHaveLength(1);
  });
});

describe("period bounds", () => {
  it("keeps only entries that start inside the day, week or month", () => {
    const anchor = new Date("2026-09-14T12:00:00.000Z");
    const list = rows();
    expect(rowsInPeriod(list, timesheetPeriodBounds("day", anchor, anchor, UTC)).map((row) => row.id))
      .toEqual(["block-a-b", "block-c-d"]);
    expect(rowsInPeriod(list, timesheetPeriodBounds("week", anchor, anchor, UTC))).toHaveLength(3);
    const october = new Date("2026-10-05T12:00:00.000Z");
    expect(rowsInPeriod(list, timesheetPeriodBounds("month", october, october, UTC))).toHaveLength(0);
  });
});

describe("blocksNeedingSummaries", () => {
  it("asks for finished entries without a final summary", () => {
    const list = rows({ isLive: (entry) => entry.id === "block-e-f" });
    const needed = blocksNeedingSummaries(list, {
      "block-a-b": { status: "ready", summary: "Done" },
      "block-c-d": { status: "pending", summary: "" },
    });
    expect(needed.map((entry) => entry.id)).toEqual(["block-c-d"]);
    expect(blocksNeedingSummaries(list, { "block-c-d": { status: "disabled", summary: "" } }).map((entry) => entry.id))
      .toEqual(["block-a-b"]);
  });
});

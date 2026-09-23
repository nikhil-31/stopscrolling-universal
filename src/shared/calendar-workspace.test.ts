import { describe, expect, it } from "vitest";
import {
  assignLabel,
  assignLabelToApp,
  bucketForCategory,
  buildCalendarDayStats,
  defaultWorkspace,
  formatHourMinute,
  hourLabel24,
  mergeIntervals,
  normalizeWorkspace,
  overlapMs,
  reviewBlock,
  shouldShowReviewBar,
  skipBlock,
  suggestLabel,
  unlabeledBlocks,
  upsertLabel,
  upsertTask,
} from "./calendar-workspace";
import type { ScreenTimeSessionBlock, ScreenTimeTimelineSegment } from "./types";

function block(partial: Partial<ScreenTimeSessionBlock> & Pick<ScreenTimeSessionBlock, "id" | "start" | "end">): ScreenTimeSessionBlock {
  const durationSeconds = Math.max(0, (new Date(partial.end).getTime() - new Date(partial.start).getTime()) / 1000);
  const category = partial.category ?? "Development";
  return {
    title: partial.title ?? "Block",
    subtitle: "",
    category,
    devicePlatform: "macos",
    deviceName: "Mac",
    durationSeconds,
    items: [{
      id: `${partial.id}-item`,
      title: partial.title ?? "Block",
      subtitle: "",
      url: "",
      category,
      appName: partial.title ?? "Block",
      start: partial.start,
      end: partial.end,
      durationSeconds,
    }],
    ...partial,
  };
}

const day = new Date(2026, 8, 9, 12);

describe("calendar workspace math", () => {
  it("formats hour-minute copy like the calendar summary", () => {
    expect(formatHourMinute(8 * 3600 + 8 * 60)).toBe("8 hr 8 min");
    expect(formatHourMinute(26 * 60)).toBe("26 min");
    expect(hourLabel24(15)).toBe("15:00");
  });

  it("merges overlapping intervals without double counting", () => {
    expect(overlapMs(0, 100, 50, 150)).toBe(50);
    expect(mergeIntervals([[0, 100], [80, 140], [200, 220]])).toEqual([[0, 140], [200, 220]]);
  });

  it("treats unlabeled blocks as the review queue", () => {
    const workspace = defaultWorkspace();
    const blocks = [
      block({ id: "a", start: "2026-09-09T10:00:00", end: "2026-09-09T11:00:00" }),
      block({ id: "b", start: "2026-09-09T13:00:00", end: "2026-09-09T14:00:00" }),
    ];
    const labeled = assignLabel(workspace, {
      start: blocks[0].start,
      end: blocks[0].end,
      labelId: "label-research",
    });
    expect(unlabeledBlocks(blocks, labeled).map((item) => item.id)).toEqual(["b"]);
    const skipped = skipBlock(labeled, "b");
    expect(unlabeledBlocks(blocks, skipped)).toEqual([]);
  });

  it("counts work hours, pending unlabeled time, and productivity buckets", () => {
    let workspace = defaultWorkspace();
    workspace = assignLabel(workspace, {
      id: "as-1",
      start: "2026-09-09T09:00:00",
      end: "2026-09-09T11:00:00",
      labelId: "label-research",
    });
    workspace = assignLabel(workspace, {
      id: "as-2",
      start: "2026-09-09T11:00:00",
      end: "2026-09-09T11:30:00",
      labelId: "label-breaks",
    });
    const blocks = [
      block({ id: "a", start: "2026-09-09T09:00:00", end: "2026-09-09T11:00:00", category: "Development" }),
      block({ id: "b", start: "2026-09-09T13:00:00", end: "2026-09-09T14:00:00", category: "Communication" }),
    ];
    const stats = buildCalendarDayStats(workspace, blocks, day, 8 * 3600);
    expect(stats.workSeconds).toBe(2 * 3600);
    expect(stats.pendingSeconds).toBe(3600);
    expect(stats.percentOfTarget).toBe(25);
    expect(stats.productivity.focus).toBe(2 * 3600);
    expect(stats.productivity.breaks).toBe(30 * 60);
    expect(stats.productivity.other).toBe(3600);
    expect(stats.reviewCount).toBe(1);
    expect(stats.labelTotals[0]?.name).toBe("Research");
    expect(stats.trackedSeconds).toBe(3 * 3600);
  });

  it("sums session time inside a block and leaves out gaps", () => {
    const stats = buildCalendarDayStats(defaultWorkspace(), [
      block({
        id: "gap",
        start: "2026-09-09T09:00:00",
        end: "2026-09-09T10:00:00",
        items: [
          {
            id: "gap-a",
            title: "Cursor",
            subtitle: "",
            url: "",
            category: "Development",
            appName: "Cursor",
            start: "2026-09-09T09:00:00",
            end: "2026-09-09T09:30:00",
            durationSeconds: 30 * 60,
          },
          {
            id: "gap-b",
            title: "Cursor",
            subtitle: "",
            url: "",
            category: "Development",
            appName: "Cursor",
            start: "2026-09-09T09:35:00",
            end: "2026-09-09T10:00:00",
            durationSeconds: 25 * 60,
          },
        ],
      }),
    ], day, 8 * 3600);
    expect(stats.trackedSeconds).toBe(55 * 60);
  });

  it("counts only the part of a session that falls on the selected day", () => {
    const crossing = block({
      id: "midnight",
      start: "2026-09-09T23:30:00+05:30",
      end: "2026-09-10T00:30:00+05:30",
      items: [{
        id: "midnight-item",
        title: "Cursor",
        subtitle: "",
        url: "",
        category: "Development",
        appName: "Cursor",
        start: "2026-09-09T23:30:00+05:30",
        end: "2026-09-10T00:30:00+05:30",
        durationSeconds: 60 * 60,
      }],
    });
    const beforeMidnight = buildCalendarDayStats(
      defaultWorkspace(),
      [crossing],
      new Date("2026-09-09T12:00:00+05:30"),
      8 * 3600,
      "Asia/Kolkata",
    );
    const afterMidnight = buildCalendarDayStats(
      defaultWorkspace(),
      [crossing],
      new Date("2026-09-10T12:00:00+05:30"),
      8 * 3600,
      "Asia/Kolkata",
    );
    expect(beforeMidnight.trackedSeconds).toBe(30 * 60);
    expect(afterMidnight.trackedSeconds).toBe(30 * 60);
  });

  it("suggests a label from the block category", () => {
    expect(bucketForCategory("Communication")).toBe("meetings");
    expect(bucketForCategory("Development")).toBe("focus");
    const label = suggestLabel({ category: "Communication" }, defaultWorkspace().labels);
    expect(label?.id).toBe("label-meetings");
  });

  it("reviews a block by assigning a label and removing it from skip", () => {
    let workspace = skipBlock(defaultWorkspace(), "a");
    workspace = reviewBlock(workspace, {
      id: "a",
      start: "2026-09-09T09:00:00",
      end: "2026-09-09T10:00:00",
    }, "label-admin");
    expect(workspace.skippedBlockIds).toEqual([]);
    expect(workspace.assignments[0]?.labelId).toBe("label-admin");
  });

  it("shows the review bar again when a new unlabeled block appears", () => {
    expect(shouldShowReviewBar(["a", "b"], ["a", "b"])).toBe(false);
    expect(shouldShowReviewBar(["a", "b", "c"], ["a", "b"])).toBe(true);
    expect(shouldShowReviewBar([], ["a"])).toBe(false);
  });

  it("seeds default labels when the stored workspace is empty", () => {
    const workspace = normalizeWorkspace({ labels: [], tasks: [], assignments: [] });
    expect(workspace.labels.map((label) => label.name)).toEqual(["Research", "Admin", "Meetings", "Breaks"]);
    const withTask = upsertTask(upsertLabel(workspace, { name: "Deep work", color: "#2de2e2", bucket: "focus" }), {
      title: "Ship calendar",
      start: "2026-09-09T16:00:00",
      end: "2026-09-09T18:00:00",
    });
    expect(withTask.labels.some((label) => label.name === "Deep work")).toBe(true);
    expect(withTask.tasks).toHaveLength(1);
  });

  it("assigns a calendar label across matching app sessions", () => {
    const cursor = (id: string, hour: number): ScreenTimeTimelineSegment => ({
      id,
      start: `2026-09-09T${String(hour).padStart(2, "0")}:00:00`,
      end: `2026-09-09T${String(hour).padStart(2, "0")}:30:00`,
      label: "Cursor",
      subtitle: "electron-app",
      url: "",
      bundleID: "cursor",
      category: "Development",
      appName: "Cursor",
      devicePlatform: "macos",
      deviceName: "Mac",
      timeZoneIdentifier: "UTC",
      isLive: false,
    });
    const chrome: ScreenTimeTimelineSegment = {
      ...cursor("chrome", 12),
      id: "chrome",
      label: "YouTube",
      subtitle: "https://youtube.com",
      url: "https://youtube.com",
      bundleID: "chrome",
      category: "Entertainment",
      appName: "Google Chrome",
    };
    const workspace = assignLabelToApp(
      defaultWorkspace(),
      [cursor("a", 9), cursor("b", 11), chrome],
      "Cursor|electron-app|Development",
      "label-research",
    );
    expect(workspace.assignments).toHaveLength(2);
    expect(workspace.assignments.every((assignment) => assignment.labelId === "label-research")).toBe(true);
    expect(workspace.assignments.map((assignment) => assignment.start)).toEqual([
      "2026-09-09T09:00:00",
      "2026-09-09T11:00:00",
    ]);
  });
});

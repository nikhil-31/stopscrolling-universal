import { describe, expect, it } from "vitest";
import { blockSegments, entriesToTimelines, formatPeriod, normalizeInsightsTab, periodBounds, shiftTodayAnchor, snapshotFromEntries, timelineAxisTicks, todayPeriodBounds } from "./timeline";
import { mergeRecords, persistenceKey, entryToPayload } from "./payload";
import type { ScreenTimeEntry, ScreenTimeTimelineSegment } from "./types";

function entry(partial: Partial<ScreenTimeEntry> & Pick<ScreenTimeEntry, "startTimeUTC" | "endTimeUTC" | "appName">): ScreenTimeEntry {
  return {
    id: partial.id ?? persistenceKey({
      startTimeUTC: partial.startTimeUTC,
      endTimeUTC: partial.endTimeUTC,
      bundleID: partial.bundleID ?? partial.appName,
      title: partial.title ?? partial.appName,
      url: partial.url ?? "",
    }),
    title: partial.title ?? partial.appName,
    url: partial.url ?? "",
    bundleID: partial.bundleID ?? partial.appName,
    category: partial.category ?? "Application",
    platform: partial.platform ?? "macos",
    deviceName: partial.deviceName ?? "Mac",
    timeZoneIdentifier: partial.timeZoneIdentifier ?? "UTC",
    source: partial.source ?? "local",
    ...partial,
  };
}

describe("normalizeInsightsTab", () => {
  it("keeps sessions and treats breakdown as overview", () => {
    expect(normalizeInsightsTab("sessions")).toBe("sessions");
    expect(normalizeInsightsTab("overview")).toBe("overview");
    expect(normalizeInsightsTab("breakdown")).toBe("overview");
  });
});

describe("mergeRecords", () => {
  it("collapses the same session present locally and on the server", () => {
    const start = "2026-06-22T09:00:00.000Z";
    const end = "2026-06-22T09:30:00.000Z";
    const local = [entry({ startTimeUTC: start, endTimeUTC: end, appName: "chrome", source: "local" })];
    const remote = [entry({ startTimeUTC: start, endTimeUTC: end, appName: "chrome", source: "sync" })];
    const merged = mergeRecords(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("sync");
  });

  it("keeps distinct sessions in start order", () => {
    const local = [entry({ startTimeUTC: "2026-06-22T11:00:00.000Z", endTimeUTC: "2026-06-22T12:00:00.000Z", appName: "code" })];
    const remote = [entry({ startTimeUTC: "2026-06-22T09:00:00.000Z", endTimeUTC: "2026-06-22T10:00:00.000Z", appName: "chrome" })];
    const merged = mergeRecords(local, remote);
    expect(merged.map((item) => item.appName)).toEqual(["chrome", "code"]);
  });
});

describe("session blocks", () => {
  it("groups contiguous activity within a 5-minute gap", () => {
    const segments: ScreenTimeTimelineSegment[] = [
      {
        id: "a",
        start: "2026-06-22T09:00:00.000Z",
        end: "2026-06-22T09:10:00.000Z",
        label: "A",
        subtitle: "",
        url: "",
        bundleID: "a",
        category: "Development",
        appName: "Code",
        devicePlatform: "macos",
        deviceName: "Mac",
        timeZoneIdentifier: "UTC",
        isLive: false,
      },
      {
        id: "b",
        start: "2026-06-22T09:12:00.000Z",
        end: "2026-06-22T09:20:00.000Z",
        label: "B",
        subtitle: "",
        url: "",
        bundleID: "b",
        category: "Development",
        appName: "Code",
        devicePlatform: "macos",
        deviceName: "Mac",
        timeZoneIdentifier: "UTC",
        isLive: false,
      },
    ];
    expect(blockSegments(segments)).toHaveLength(1);
  });

  it("splits after a gap larger than 5 minutes", () => {
    const segments: ScreenTimeTimelineSegment[] = [
      {
        id: "a",
        start: "2026-06-22T09:00:00.000Z",
        end: "2026-06-22T09:10:00.000Z",
        label: "A",
        subtitle: "",
        url: "",
        bundleID: "a",
        category: "Development",
        appName: "Code",
        devicePlatform: "macos",
        deviceName: "Mac",
        timeZoneIdentifier: "UTC",
        isLive: false,
      },
      {
        id: "b",
        start: "2026-06-22T09:20:00.000Z",
        end: "2026-06-22T09:30:00.000Z",
        label: "B",
        subtitle: "",
        url: "",
        bundleID: "b",
        category: "Web",
        appName: "Chrome",
        devicePlatform: "macos",
        deviceName: "Mac",
        timeZoneIdentifier: "UTC",
        isLive: false,
      },
    ];
    expect(blockSegments(segments)).toHaveLength(2);
  });
});

describe("payload mapping", () => {
  it("prefers page title for app_name when it differs from the process", () => {
    const payload = entryToPayload(
      entry({
        startTimeUTC: "2026-06-22T09:00:00.000Z",
        endTimeUTC: "2026-06-22T09:05:00.000Z",
        appName: "Google Chrome",
        title: "Inbox",
        url: "https://mail.google.com",
        bundleID: "com.google.Chrome",
      }),
      "MacBook",
    );
    expect(payload.app_name).toBe("Inbox");
    expect(payload.duration_seconds).toBe(300);
    expect(payload.device_platform).toBe("macos");
  });
});

describe("insights snapshot", () => {
  it("replaces totals from a server summary but keeps local buckets", () => {
    const entries = [
      entry({
        startTimeUTC: "2026-06-22T09:00:00.000Z",
        endTimeUTC: "2026-06-22T09:01:00.000Z",
        appName: "code",
        category: "Local",
      }),
    ];
    const snapshot = snapshotFromEntries(entries, "day", new Date("2026-06-22T12:00:00"), {
      totalSeconds: 4200,
      sessionCount: 7,
      categories: [{ category: "Development", seconds: 4200, percentage: 1 }],
    });
    expect(snapshot.totalSeconds).toBe(4200);
    expect(snapshot.sessionCount).toBe(7);
    expect(snapshot.categories[0].category).toBe("Development");
    expect(snapshot.buckets).toHaveLength(24);
  });

  it("counts only overlapping time inside the selected period", () => {
    const anchor = new Date(2026, 8, 9, 12);
    const spanning = entry({
      startTimeUTC: new Date(2026, 8, 8, 22).toISOString(),
      endTimeUTC: new Date(2026, 8, 9, 2).toISOString(),
      appName: "Notes",
    });
    expect(snapshotFromEntries([spanning], "day", anchor).totalSeconds).toBe(2 * 3600);
  });

  it("sums tracked time for week, month, and year windows", () => {
    const anchor = new Date(2026, 8, 9, 12);
    const entries = [
      entry({
        startTimeUTC: new Date(2026, 8, 1, 10).toISOString(),
        endTimeUTC: new Date(2026, 8, 1, 11).toISOString(),
        appName: "Mail",
      }),
      entry({
        startTimeUTC: new Date(2026, 8, 9, 10).toISOString(),
        endTimeUTC: new Date(2026, 8, 9, 12).toISOString(),
        appName: "Cursor",
      }),
      entry({
        startTimeUTC: new Date(2026, 9, 2, 10).toISOString(),
        endTimeUTC: new Date(2026, 9, 2, 11).toISOString(),
        appName: "Safari",
      }),
    ];
    expect(snapshotFromEntries(entries, "day", anchor).totalSeconds).toBe(2 * 3600);
    expect(snapshotFromEntries(entries, "week", anchor).totalSeconds).toBe(2 * 3600);
    expect(snapshotFromEntries(entries, "month", anchor).totalSeconds).toBe(3 * 3600);
    expect(snapshotFromEntries(entries, "year", anchor).totalSeconds).toBe(4 * 3600);
  });

  it("uses daily totals inside the selected bounds instead of an unscoped server total", () => {
    const snapshot = snapshotFromEntries([], "day", new Date(2026, 8, 9, 12), {
      totalSeconds: 99_000,
      trackedSecondsByDay: {
        "2026-09-09": 1800,
        "2026-09-10": 7200,
      },
    });
    expect(snapshot.totalSeconds).toBe(1800);
  });
});

describe("today period windows", () => {
  it("uses a calendar month for Today month bounds", () => {
    const { start, end } = todayPeriodBounds("month", new Date(2026, 8, 9, 15));
    expect(start).toEqual(new Date(2026, 8, 1));
    expect(end).toEqual(new Date(2026, 9, 1));
  });

  it("reuses week bounds and shifts the anchor by period", () => {
    const anchor = new Date(2026, 8, 9, 12);
    expect(todayPeriodBounds("week", anchor)).toEqual(periodBounds("week", anchor));
    expect(shiftTodayAnchor("day", anchor, 1).getDate()).toBe(10);
    expect(shiftTodayAnchor("week", anchor, -1).getDate()).toBe(2);
    expect(shiftTodayAnchor("month", anchor, 1).getMonth()).toBe(9);
  });

  it("windows timelines to the selected Today range", () => {
    const start = new Date(2026, 8, 7, 0, 0, 0, 0);
    const end = new Date(2026, 8, 14, 0, 0, 0, 0);
    const timelines = entriesToTimelines(
      [
        entry({
          startTimeUTC: new Date(2026, 8, 8, 10).toISOString(),
          endTimeUTC: new Date(2026, 8, 8, 11).toISOString(),
          appName: "Cursor",
        }),
        entry({
          startTimeUTC: new Date(2026, 8, 20, 10).toISOString(),
          endTimeUTC: new Date(2026, 8, 20, 11).toISOString(),
          appName: "Notes",
        }),
      ],
      start,
      [],
      { start, end },
    );
    expect(timelines[0].dayStart).toBe(start.toISOString());
    expect(timelines[0].dayEnd).toBe(end.toISOString());
    expect(timelines[0].segments.map((segment) => segment.appName)).toEqual(["Cursor"]);
  });

  it("places 3-hour, weekday, and month ticks on the compact axis", () => {
    const day = new Date(2026, 8, 9);
    const dayTicks = timelineAxisTicks(day, new Date(day.getTime() + 24 * 60 * 60 * 1000));
    expect(dayTicks.map((tick) => tick.label)).toEqual(["3:00", "6:00", "9:00", "12:00", "15:00", "18:00", "21:00"]);
    const weekStart = periodBounds("week", day).start;
    const weekTicks = timelineAxisTicks(weekStart, new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000));
    expect(weekTicks).toHaveLength(7);
    expect(weekTicks[0].fraction).toBeCloseTo(0.5 / 7);
    const month = todayPeriodBounds("month", day);
    const monthTicks = timelineAxisTicks(month.start, month.end);
    expect(monthTicks[0].label).toBe("1");
    expect(monthTicks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("periodBounds", () => {
  it("returns a local calendar day window", () => {
    const { start, end } = periodBounds("day", new Date(2026, 5, 22, 15));
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("returns and labels a calendar month", () => {
    const anchor = new Date(2026, 8, 9, 15);
    expect(periodBounds("month", anchor)).toEqual({
      start: new Date(2026, 8, 1),
      end: new Date(2026, 9, 1),
    });
    expect(formatPeriod("month", anchor)).toBe("September 2026");
  });

  it("builds one insights bucket per day of the month", () => {
    const snapshot = snapshotFromEntries(
      [],
      "month",
      new Date(2026, 8, 9, 15),
      { trackedSecondsByDay: { "2026-09-01": 3600, "2026-09-30": 1800 } },
    );
    expect(snapshot.buckets).toHaveLength(30);
    expect(snapshot.buckets[0].label).toBe("1");
    expect(snapshot.buckets[0].seconds).toBe(3600);
    expect(snapshot.buckets[29].label).toBe("30");
    expect(snapshot.buckets[29].seconds).toBe(1800);
  });
});

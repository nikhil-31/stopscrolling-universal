import { describe, expect, it } from "vitest";
import { blockSegments, entriesToTimelines, filterEntriesForInsights, filterTimelinesForInsights, formatPeriod, highlightRangesForApp, ALL_INSIGHTS_DEVICES, normalizeInsightsDeviceKey, normalizeInsightsTab, periodBounds, shiftTodayAnchor, snapshotFromEntries, timelineAxisTicks, todayPeriodBounds } from "./timeline";
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

describe("insights device scope", () => {
  const mac = entry({
    startTimeUTC: "2026-06-22T09:00:00.000Z",
    endTimeUTC: "2026-06-22T10:00:00.000Z",
    appName: "Code",
    platform: "macos",
    deviceName: "Studio Mac",
  });
  const phone = entry({
    startTimeUTC: "2026-06-22T11:00:00.000Z",
    endTimeUTC: "2026-06-22T11:30:00.000Z",
    appName: "Safari",
    platform: "ios",
    deviceName: "iPhone",
  });

  it("normalizes unknown or hidden keys to all devices", () => {
    expect(normalizeInsightsDeviceKey("all", ["macos|Studio Mac"])).toBe(ALL_INSIGHTS_DEVICES);
    expect(normalizeInsightsDeviceKey("macos|Studio Mac", ["macos|Studio Mac"])).toBe("macos|Studio Mac");
    expect(normalizeInsightsDeviceKey("ios|iPhone", ["macos|Studio Mac"])).toBe(ALL_INSIGHTS_DEVICES);
    expect(normalizeInsightsDeviceKey("gone", [])).toBe(ALL_INSIGHTS_DEVICES);
  });

  it("keeps visible devices together and can isolate one", () => {
    expect(filterEntriesForInsights([mac, phone], ALL_INSIGHTS_DEVICES, []).map((item) => item.appName)).toEqual([
      "Code",
      "Safari",
    ]);
    expect(filterEntriesForInsights([mac, phone], "ios|iPhone", []).map((item) => item.appName)).toEqual(["Safari"]);
  });

  it("drops hidden devices even when viewing all", () => {
    expect(filterEntriesForInsights([mac, phone], ALL_INSIGHTS_DEVICES, ["ios|iPhone"]).map((item) => item.appName)).toEqual([
      "Code",
    ]);
    expect(filterEntriesForInsights([mac, phone], "ios|iPhone", ["ios|iPhone"])).toEqual([]);
  });

  it("filters timelines to the selected device", () => {
    const timelines = entriesToTimelines([mac, phone], new Date("2026-06-22T12:00:00.000Z"));
    expect(timelines.map((timeline) => timeline.id).sort()).toEqual(["ios|iPhone", "macos|Studio Mac"]);
    expect(filterTimelinesForInsights(timelines, ALL_INSIGHTS_DEVICES)).toHaveLength(2);
    expect(filterTimelinesForInsights(timelines, "macos|Studio Mac").map((timeline) => timeline.id)).toEqual([
      "macos|Studio Mac",
    ]);
  });

  it("windows Insights timeline to the insights day, not Today", () => {
    const insightsDay = new Date(2026, 8, 10, 15);
    const today = new Date(2026, 8, 18, 12);
    const activity = entry({
      startTimeUTC: new Date(2026, 8, 10, 9).toISOString(),
      endTimeUTC: new Date(2026, 8, 10, 10).toISOString(),
      appName: "Cursor",
    });
    const extra = [{ platform: "macos", name: "Mac" }];

    const usingToday = entriesToTimelines([activity], today, extra);
    expect(usingToday.flatMap((timeline) => timeline.blocks)).toEqual([]);

    const bounds = periodBounds("day", insightsDay);
    const usingInsights = entriesToTimelines([activity], insightsDay, extra, bounds);
    expect(usingInsights[0].blocks.map((block) => block.title)).toEqual(["Cursor"]);
    expect(usingInsights[0].dayStart).toBe(bounds.start.toISOString());
    expect(usingInsights[0].dayEnd).toBe(bounds.end.toISOString());
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

describe("highlightRangesForApp", () => {
  const dayStart = new Date("2026-06-22T00:00:00.000Z");
  const dayEnd = new Date("2026-06-23T00:00:00.000Z");

  function segment(partial: Partial<ScreenTimeTimelineSegment> & Pick<ScreenTimeTimelineSegment, "id" | "start" | "end" | "appName">): ScreenTimeTimelineSegment {
    return {
      label: partial.label ?? partial.appName,
      subtitle: "",
      url: "",
      bundleID: partial.appName,
      category: "Application",
      devicePlatform: "macos",
      deviceName: "Mac",
      timeZoneIdentifier: "UTC",
      isLive: false,
      ...partial,
    };
  }

  it("returns matching app slices inside mixed blocks", () => {
    const blocks = blockSegments([
      segment({ id: "cursor", start: "2026-06-22T09:00:00.000Z", end: "2026-06-22T09:30:00.000Z", appName: "Cursor" }),
      segment({ id: "notes", start: "2026-06-22T09:31:00.000Z", end: "2026-06-22T10:00:00.000Z", appName: "Notes" }),
    ]);
    expect(blocks).toHaveLength(1);
    const ranges = highlightRangesForApp(blocks, "app|Cursor", dayStart, dayEnd);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].id).toBe("cursor");
    expect(ranges[0].start.toISOString()).toBe("2026-06-22T09:00:00.000Z");
    expect(ranges[0].end.toISOString()).toBe("2026-06-22T09:30:00.000Z");
    expect(ranges[0].xFraction).toBeCloseTo(9 / 24);
    expect(ranges[0].widthFraction).toBeCloseTo(0.5 / 24);
  });

  it("matches websites by hostname", () => {
    const blocks = blockSegments([
      segment({
        id: "github",
        start: "2026-06-22T11:00:00.000Z",
        end: "2026-06-22T12:00:00.000Z",
        appName: "Safari",
        url: "https://github.com/org/repo",
      }),
      segment({
        id: "docs",
        start: "2026-06-22T12:01:00.000Z",
        end: "2026-06-22T12:30:00.000Z",
        appName: "Safari",
        url: "https://docs.google.com",
      }),
    ]);
    const ranges = highlightRangesForApp(blocks, "web|github.com", dayStart, dayEnd);
    expect(ranges.map((range) => range.id)).toEqual(["github"]);
  });

  it("clips ranges to the day window", () => {
    const blocks = blockSegments([
      segment({
        id: "overnight",
        start: "2026-06-21T23:30:00.000Z",
        end: "2026-06-22T00:30:00.000Z",
        appName: "Cursor",
      }),
    ]);
    const ranges = highlightRangesForApp(blocks, "app|Cursor", dayStart, dayEnd);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(ranges[0].end.toISOString()).toBe("2026-06-22T00:30:00.000Z");
    expect(ranges[0].xFraction).toBe(0);
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

  it("splits browser time by website and keeps native apps separate", () => {
    const snapshot = snapshotFromEntries([
      entry({
        startTimeUTC: "2026-06-22T09:00:00.000Z",
        endTimeUTC: "2026-06-22T09:40:00.000Z",
        appName: "Safari",
        url: "https://github.com/org/repo",
        category: "Development",
      }),
      entry({
        startTimeUTC: "2026-06-22T09:40:00.000Z",
        endTimeUTC: "2026-06-22T10:00:00.000Z",
        appName: "Safari",
        url: "https://www.github.com/settings",
        category: "Development",
      }),
      entry({
        startTimeUTC: "2026-06-22T10:00:00.000Z",
        endTimeUTC: "2026-06-22T10:30:00.000Z",
        appName: "Safari",
        url: "https://www.youtube.com/watch?v=1",
        category: "Video",
      }),
      entry({
        startTimeUTC: "2026-06-22T10:30:00.000Z",
        endTimeUTC: "2026-06-22T11:00:00.000Z",
        appName: "Cursor",
        category: "Development",
      }),
    ], "day", new Date("2026-06-22T12:00:00"));

    expect(snapshot.apps.map((app) => [app.label, app.seconds, Math.round(app.percentage * 100)])).toEqual([
      ["github.com", 60 * 60, 50],
      ["youtube.com", 30 * 60, 25],
      ["Cursor", 30 * 60, 25],
    ]);
  });

  it("keeps local website rows instead of a lumped server Safari total", () => {
    const snapshot = snapshotFromEntries([
      entry({
        startTimeUTC: "2026-06-22T09:00:00.000Z",
        endTimeUTC: "2026-06-22T10:00:00.000Z",
        appName: "Safari",
        url: "https://news.ycombinator.com",
      }),
    ], "day", new Date("2026-06-22T12:00:00"), {
      apps: [{
        key: "safari",
        label: "Safari",
        subtitle: "Studio Mac",
        category: "Web",
        seconds: 3600,
        percentage: 100,
      }],
    });
    expect(snapshot.apps).toHaveLength(1);
    expect(snapshot.apps[0].label).toBe("news.ycombinator.com");
    expect(snapshot.apps[0].percentage).toBe(1);
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

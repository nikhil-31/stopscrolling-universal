import { describe, expect, it } from "vitest";
import { blockSegments, periodBounds, snapshotFromEntries } from "./timeline";
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
});

describe("periodBounds", () => {
  it("returns a local calendar day window", () => {
    const { start, end } = periodBounds("day", new Date(2026, 5, 22, 15));
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

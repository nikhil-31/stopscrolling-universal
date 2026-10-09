import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { ScreenTimeEntry } from "@shared/types";
import { LocalHistoryStore, mergeEntries } from "./local-history";

const directories: string[] = [];

function openStore() {
  const directory = mkdtempSync(join(tmpdir(), "session-history-"));
  directories.push(directory);
  const key = randomBytes(32);
  return { directory, key, history: new LocalHistoryStore(directory, key) };
}

function entry(start: string, end: string, appName = "Notes"): ScreenTimeEntry {
  return {
    id: `${start}-${appName}`,
    startTimeUTC: start,
    endTimeUTC: end,
    title: appName,
    url: "",
    bundleID: appName,
    appName,
    category: "Application",
    platform: "macos",
    deviceName: "Mac",
    timeZoneIdentifier: "Asia/Calcutta",
    source: "local",
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("local session history", () => {
  it("returns a previous day after the sessions have been stored", () => {
    const { directory, key, history } = openStore();
    history.remember([
      entry("2026-10-08T04:00:00.000Z", "2026-10-08T05:00:00.000Z"),
      entry("2026-10-09T04:00:00.000Z", "2026-10-09T05:00:00.000Z", "Chrome"),
    ]);
    const reopened = new LocalHistoryStore(directory, key);
    const yesterday = reopened.overlapping(
      new Date("2026-10-07T18:30:00.000Z"),
      new Date("2026-10-08T18:30:00.000Z"),
    );
    expect(yesterday.map((item) => item.appName)).toEqual(["Notes"]);
  });

  it("keeps one copy when the same session is stored again", () => {
    const { history } = openStore();
    const session = entry("2026-10-08T04:00:00.000Z", "2026-10-08T05:00:00.000Z");
    history.remember([session]);
    history.remember([session]);
    const day = history.overlapping(
      new Date("2026-10-07T18:30:00.000Z"),
      new Date("2026-10-08T18:30:00.000Z"),
    );
    expect(day).toHaveLength(1);
  });

  it("keeps the live copy when history has the same session", () => {
    const stored = entry("2026-10-08T04:00:00.000Z", "2026-10-08T05:00:00.000Z");
    const live = { ...stored, source: "live" as const };
    const merged = mergeEntries([live], [stored]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("live");
  });
});

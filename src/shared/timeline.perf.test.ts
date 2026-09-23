import { describe, expect, it } from "vitest";
import { persistenceKey } from "./payload";
import { entriesToTimelines, periodBounds, snapshotFromEntries } from "./timeline";
import type { InsightsPeriod, ScreenTimeEntry } from "./types";

const ZONE = "Asia/Kolkata";
const ANCHOR = new Date("2026-09-10T08:00:00.000Z");
const APPS = ["Cursor", "Safari", "Slack", "Notes", "Terminal", "Mail", "Figma", "Music"];
const HOSTS = ["github.com", "youtube.com", "news.ycombinator.com", "docs.google.com", ""];

function syntheticYear(sessionsPerDay: number): ScreenTimeEntry[] {
  const entries: ScreenTimeEntry[] = [];
  const yearStart = Date.UTC(2026, 0, 1);
  for (let day = 0; day < 365; day += 1) {
    let cursor = yearStart + day * 86_400_000 + 3 * 3_600_000;
    for (let i = 0; i < sessionsPerDay; i += 1) {
      const length = 30_000 + ((i * 7919) % 240_000);
      const appName = APPS[(day + i) % APPS.length];
      const host = appName === "Safari" ? HOSTS[i % HOSTS.length] : "";
      const partial = {
        startTimeUTC: new Date(cursor).toISOString(),
        endTimeUTC: new Date(cursor + length).toISOString(),
        bundleID: appName,
        title: appName,
        url: host ? `https://${host}/page` : "",
      };
      entries.push({
        ...partial,
        id: persistenceKey(partial),
        appName,
        category: "Application",
        platform: i % 5 === 0 ? "ios" : "macos",
        deviceName: i % 5 === 0 ? "iPhone" : "Studio Mac",
        timeZoneIdentifier: ZONE,
        source: "sync",
      });
      cursor += length + ((i * 104_729) % 120_000);
    }
  }
  return entries;
}

function time(run: () => void) {
  const started = performance.now();
  run();
  return performance.now() - started;
}

describe("insights aggregation performance", () => {
  const entries = syntheticYear(300);

  it.each<InsightsPeriod>(["day", "week", "month", "year"])("builds a %s snapshot from a year of sessions quickly", (period) => {
    snapshotFromEntries(entries, period, ANCHOR, undefined, null, ZONE);
    const elapsed = time(() => {
      snapshotFromEntries(entries, period, ANCHOR, undefined, null, ZONE);
    });
    console.info(`[perf] snapshot ${period}: ${elapsed.toFixed(1)}ms for ${entries.length} entries`);
    expect(elapsed).toBeLessThan(period === "year" ? 750 : 200);
  });

  it("builds day timelines quickly", () => {
    const bounds = periodBounds("day", ANCHOR, ZONE);
    const elapsed = time(() => {
      entriesToTimelines(entries, ANCHOR, [], bounds);
    });
    console.info(`[perf] day timelines: ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(150);
  });
});

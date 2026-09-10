import { describe, expect, it } from "vitest";
import {
  blocklistEntriesFromText,
  formatRemaining,
  isAlwaysActive,
  isScheduleRunningNow,
  remainingUntilEnd,
  scheduleRowKind,
} from "./blocking";
import type { BlockingSchedule } from "./types";

function schedule(patch: Partial<BlockingSchedule> = {}): BlockingSchedule {
  return {
    schedule_id: "sched-1",
    name: "Work focus",
    start_time: "09:00:00",
    end_time: "17:00:00",
    days_of_week: [0, 1, 2, 3, 4],
    time_zone: "UTC",
    is_active: true,
    blocklists: [],
    devices: [],
    blocklist_count: 0,
    device_count: 0,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...patch,
  };
}

describe("blocking helpers", () => {
  it("parses website and app identifiers", () => {
    expect(blocklistEntriesFromText("twitter.com, reddit.com", "com.apple.Safari")).toEqual([
      { entry_type: "website", identifier: "twitter.com" },
      { entry_type: "website", identifier: "reddit.com" },
      { entry_type: "app", identifier: "com.apple.Safari" },
    ]);
  });

  it("detects a running weekday session", () => {
    const now = new Date("2026-09-10T10:30:00");
    expect(now.getDay()).toBe(4);
    expect(isScheduleRunningNow(schedule(), now)).toBe(true);
    expect(scheduleRowKind(schedule(), now)).toBe("current");
    expect(remainingUntilEnd(schedule(), now)).toBe(6 * 60 + 30);
    expect(formatRemaining(90)).toBe("1 hour 30 minutes left");
  });

  it("detects always-active schedules", () => {
    const always = schedule({
      start_time: "00:00:00",
      end_time: "23:59:00",
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(isAlwaysActive(always)).toBe(true);
    const sunday = new Date("2026-09-13T10:00:00");
    expect(scheduleRowKind(always, sunday)).toBe("current");
  });

  it("labels named sessions outside the window", () => {
    const now = new Date("2026-09-10T20:00:00");
    expect(scheduleRowKind(schedule(), now)).toBe("named");
  });
});

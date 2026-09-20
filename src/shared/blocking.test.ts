import { describe, expect, it } from "vitest";
import {
  blocklistEntriesFromText,
  collectBlocklistEntries,
  decomposeBlocklistEntries,
  formatRemaining,
  isAlwaysActive,
  isScheduleRunningNow,
  normalizeWebsite,
  parseWebsiteList,
  remainingUntilEnd,
  scheduleDeviceLabel,
  scheduleRowKind,
  scheduleStatusLabel,
  scheduleToComposerDraft,
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
    strict_mode: false,
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

  it("collects custom sites, common filters, and categories without duplicates", () => {
    expect(normalizeWebsite("https://www.CNN.com/world")).toBe("cnn.com");
    expect(parseWebsiteList("cnn.com\nreddit.com, bbc.com")).toEqual(["cnn.com", "reddit.com", "bbc.com"]);
    expect(collectBlocklistEntries({
      customWebsites: ["cnn.com"],
      commonFilterIds: ["instagram", "x"],
      categoryIds: ["social"],
    })).toEqual([
      { entry_type: "website", identifier: "cnn.com", label: "cnn.com" },
      { entry_type: "website", identifier: "instagram.com", label: "Instagram" },
      { entry_type: "website", identifier: "x.com", label: "X" },
      { entry_type: "website", identifier: "twitter.com", label: "X" },
      { entry_type: "website", identifier: "facebook.com", label: "Social" },
      { entry_type: "website", identifier: "tiktok.com", label: "Social" },
      { entry_type: "website", identifier: "snapchat.com", label: "Social" },
      { entry_type: "website", identifier: "reddit.com", label: "Social" },
      { entry_type: "website", identifier: "tumblr.com", label: "Social" },
      { entry_type: "website", identifier: "pinterest.com", label: "Social" },
      { entry_type: "website", identifier: "threads.net", label: "Social" },
    ]);
  });

  it("maps saved entries back onto custom sites and complete filters", () => {
    expect(decomposeBlocklistEntries([
      { entry_type: "website", identifier: "instagram.com", label: "Instagram" },
      { entry_type: "website", identifier: "x.com", label: "X" },
      { entry_type: "app", identifier: "com.apple.Safari", label: "Safari" },
    ])).toEqual({
      customWebsites: ["x.com"],
      commonFilterIds: ["instagram"],
      categoryIds: [],
      appEntries: [{ entry_type: "app", identifier: "com.apple.Safari", label: "Safari" }],
    });
    expect(decomposeBlocklistEntries([
      { entry_type: "website", identifier: "whatsapp.com" },
      { entry_type: "website", identifier: "web.whatsapp.com" },
    ]).commonFilterIds).toEqual(["whatsapp"]);
  });

  it("maps a schedule onto the session composer", () => {
    expect(scheduleToComposerDraft(schedule({
      start_time: "16:00:00",
      end_time: "18:00:00",
      time_zone: "UTC",
      blocklists: [{ blocklist_id: "list-1", name: "Social" }],
      devices: [{
        device_id: "d1",
        device_platform: "macos",
        device_name: "Studio Mac",
        label: "Mac",
      }],
    }))).toEqual({
      name: "Work focus",
      startTime: "16:00",
      endTime: "18:00",
      timeZone: "UTC",
      selectedDays: [0, 1, 2, 3, 4],
      selectedBlocklistIds: ["list-1"],
      selectedDeviceIds: ["d1"],
      isActive: true,
      strictMode: false,
    });
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

  it("names devices and session status", () => {
    expect(scheduleStatusLabel("current")).toBe("Running");
    expect(scheduleStatusLabel("schedule")).toBe("Always Active");
    expect(scheduleDeviceLabel({
      device_id: "d1",
      device_platform: "macos",
      device_name: "Studio Mac",
      label: "Mac",
    })).toBe("Mac");
    expect(scheduleDeviceLabel({
      device_id: "d1",
      device_platform: "macos",
      device_name: "Studio Mac",
      label: "",
    })).toBe("Studio Mac");
  });
});

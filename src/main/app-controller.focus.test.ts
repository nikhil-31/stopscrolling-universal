import { rmSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { productivityKey } from "@shared/jev-productivity";
import { appBreakdownKey } from "@shared/timeline";
import type { ScreenTimeEntry } from "@shared/types";
import { AppController } from "./app-controller";

const userData = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "focus-classification-"));
});

vi.mock("electron", () => ({
  app: {
    getPath: () => userData,
    isPackaged: false,
    setLoginItemSettings: () => {},
  },
  BrowserWindow: class {},
  powerMonitor: { on: () => {}, getSystemIdleTime: () => 0 },
  powerSaveBlocker: { start: () => 1, stop: () => {}, isStarted: () => false },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
  shell: { openExternal: async () => {} },
  systemPreferences: {},
}));

function entry(patch: Partial<ScreenTimeEntry> & Pick<ScreenTimeEntry, "id" | "startTimeUTC" | "endTimeUTC" | "appName">): ScreenTimeEntry {
  return {
    title: patch.appName,
    url: "",
    bundleID: patch.appName,
    category: "Application",
    platform: "macos",
    deviceName: "Mac",
    timeZoneIdentifier: "UTC",
    source: "local",
    ...patch,
  };
}

describe("focus classification", () => {
  afterAll(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("enqueues unrated titles when Today or Insights rebuilds", () => {
    const controller = new AppController();
    const enqueueBackground = vi.fn();
    controller.tracker.productivityAgent.enqueueBackground = enqueueBackground;
    controller.todayDay = new Date("2026-09-20T12:00:00.000Z");
    controller.insightsAnchor = new Date("2026-09-20T12:00:00.000Z");
    controller.tracker.serverEntries = [
      entry({
        id: "notes",
        appName: "Notes",
        title: "Scratch",
        startTimeUTC: "2026-09-20T08:00:00.000Z",
        endTimeUTC: "2026-09-20T09:00:00.000Z",
      }),
      entry({
        id: "chrome",
        appName: "Google Chrome",
        title: "Intro to Rust - YouTube",
        url: "https://www.youtube.com/watch?v=1",
        bundleID: "com.google.Chrome",
        category: "Video",
        startTimeUTC: "2026-09-20T10:00:00.000Z",
        endTimeUTC: "2026-09-20T11:00:00.000Z",
      }),
    ];
    const notesKey = productivityKey(appBreakdownKey({ url: "", appName: "Notes", label: "Scratch" }), "Scratch");
    controller.tracker.productivityAgent.cache = {
      [notesKey]: { verdict: "Productive", confidence: 1, model: "user", at: "2026-09-20T09:00:00.000Z", source: "user" },
    };

    controller.snapshot();
    expect(enqueueBackground).toHaveBeenCalledTimes(1);
    const inputs = enqueueBackground.mock.calls[0]?.[0];
    expect(inputs).toEqual([
      expect.objectContaining({
        key: "web|youtube.com#Intro to Rust",
        title: "Intro to Rust",
        appName: "Google Chrome",
        sendTitle: true,
      }),
    ]);

    enqueueBackground.mockClear();
    controller.navigation = "calendar";
    controller.snapshot();
    expect(enqueueBackground).not.toHaveBeenCalled();

    controller.navigation = "insights";
    controller.snapshot();
    expect(enqueueBackground).toHaveBeenCalledTimes(1);
  });

  it("rates each app once when titles are off", () => {
    const controller = new AppController();
    const enqueueBackground = vi.fn();
    controller.tracker.productivityAgent.enqueueBackground = enqueueBackground;
    controller.settings = { ...controller.settings, agentSendTitles: false };
    controller.todayDay = new Date("2026-09-20T12:00:00.000Z");
    controller.tracker.serverEntries = [
      entry({
        id: "one",
        appName: "Cursor",
        title: "main.ts",
        startTimeUTC: "2026-09-20T08:00:00.000Z",
        endTimeUTC: "2026-09-20T09:00:00.000Z",
      }),
      entry({
        id: "two",
        appName: "Cursor",
        title: "app.ts",
        startTimeUTC: "2026-09-20T10:00:00.000Z",
        endTimeUTC: "2026-09-20T11:00:00.000Z",
      }),
    ];

    controller.snapshot();
    expect(enqueueBackground.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ key: "app|Cursor", title: "", sendTitle: false }),
    ]);
  });
});

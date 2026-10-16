import { rmSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ActivitySnapshot } from "./collectors/types";
import type { BlockingPolicyResponse } from "@shared/types";
import { AppController } from "./app-controller";

const userData = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "distraction-nudge-"));
});

const nudgeWindow = vi.hoisted(() => ({
  showNudgeCard: vi.fn(),
  hideNudgeCard: vi.fn(),
}));

const freedomWindow = vi.hoisted(() => ({
  showFreedomScreen: vi.fn(),
  hideFreedomScreen: vi.fn(),
}));

const localActions = vi.hoisted(() => ({
  closeBlockedWebsite: vi.fn(async () => {}),
  quitBlockedApp: vi.fn(async () => {}),
}));

const axBrowser = vi.hoisted(() => ({
  readFocusedBrowserContext: vi.fn(() => ({ title: "", url: "", appName: "" })),
}));

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

vi.mock("./nudge-window", () => nudgeWindow);
vi.mock("./freedom-window", () => freedomWindow);
vi.mock("./collectors/ax-browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./collectors/ax-browser")>();
  return {
    ...actual,
    readFocusedBrowserContext: axBrowser.readFocusedBrowserContext,
  };
});
vi.mock("./blocking/local-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./blocking/local-actions")>();
  return {
    ...actual,
    closeBlockedWebsite: localActions.closeBlockedWebsite,
    quitBlockedApp: localActions.quitBlockedApp,
  };
});

const youtube: ActivitySnapshot = {
  appName: "Google Chrome",
  bundleID: "com.google.Chrome",
  title: "Funny Shorts",
  url: "https://www.youtube.com/watch?v=1",
};

const notes: ActivitySnapshot = {
  appName: "Notes",
  bundleID: "com.apple.Notes",
  title: "Plan",
  url: "",
};

function rate(controller: AppController, verdict: "Distracting" | "Productive") {
  const key = "web|youtube.com#Funny Shorts";
  controller.tracker.productivityAgent.cache = {
    ...controller.tracker.productivityAgent.cache,
    [key]: { verdict, confidence: 1, model: "user", at: "2026-10-15T00:00:00.000Z", source: "user" },
  };
}

function policy(now = Date.now()): BlockingPolicyResponse {
  return {
    policy_version: 1,
    device_id: "device-1",
    server_time: new Date(now - 1_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
    occurrences: [{
      occurrence_id: "occ-1",
      schedule_id: "sched-1",
      schedule_name: "Focus",
      strict_mode: false,
      start_at: new Date(now - 1_000).toISOString(),
      end_at: new Date(now + 60_000).toISOString(),
      entries: [{ entry_type: "website", identifier: "youtube.com", label: "YouTube" }],
    }],
    algorithm: "Ed25519",
    kid: "kid",
    signature: "sig",
  };
}

describe("distraction nudge wiring", () => {
  afterAll(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("shows on a known distracting window, stays dismissed, and returns next visit", () => {
    nudgeWindow.showNudgeCard.mockClear();
    nudgeWindow.hideNudgeCard.mockClear();
    const controller = new AppController();
    rate(controller, "Distracting");

    controller.tracker.onForeground?.(youtube);
    controller.tracker.onForeground?.(youtube);
    expect(nudgeWindow.showNudgeCard).toHaveBeenCalledTimes(1);
    expect(nudgeWindow.showNudgeCard).toHaveBeenCalledWith("Funny Shorts", "youtube.com", expect.any(Function));

    const dismiss = nudgeWindow.showNudgeCard.mock.calls[0]?.[2] as () => void;
    dismiss();
    expect(nudgeWindow.hideNudgeCard).toHaveBeenCalledTimes(1);

    controller.tracker.onForeground?.(youtube);
    expect(nudgeWindow.showNudgeCard).toHaveBeenCalledTimes(1);

    controller.tracker.onForeground?.(notes);
    controller.tracker.onForeground?.(youtube);
    expect(nudgeWindow.showNudgeCard).toHaveBeenCalledTimes(2);
  });

  it("shows when a rating arrives for the window already in front", () => {
    nudgeWindow.showNudgeCard.mockClear();
    const controller = new AppController();
    controller.tracker.onForeground?.(youtube);
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();

    rate(controller, "Distracting");
    controller.tracker.onProductivity?.();
    expect(nudgeWindow.showNudgeCard).toHaveBeenCalledWith("Funny Shorts", "youtube.com", expect.any(Function));
  });

  it("skips the card when the window is already blocked", () => {
    nudgeWindow.showNudgeCard.mockClear();
    const controller = new AppController();
    rate(controller, "Distracting");
    controller.localEnforcer.setPolicy(policy());
    controller.localEnforcer.enforce = async () => {};
    controller.tracker.onForeground?.(youtube);
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();
  });

  it("does not open for a verdict stored on a different title", () => {
    nudgeWindow.showNudgeCard.mockClear();
    const controller = new AppController();
    controller.tracker.productivityAgent.cache = {
      "web|youtube.com#Cat Videos": {
        verdict: "Distracting",
        confidence: 1,
        model: "user",
        at: "2026-10-15T00:00:00.000Z",
        source: "user",
      },
    };
    controller.tracker.onForeground?.(youtube);
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();
  });

  it("does nothing when blocking is turned off", async () => {
    nudgeWindow.showNudgeCard.mockClear();
    freedomWindow.showFreedomScreen.mockClear();
    localActions.closeBlockedWebsite.mockClear();
    localActions.quitBlockedApp.mockClear();
    const controller = new AppController();
    controller.settings = { ...controller.settings, distractionResponse: "off" };
    rate(controller, "Distracting");
    controller.tracker.onForeground?.(youtube);
    await Promise.resolve();
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();
    expect(freedomWindow.showFreedomScreen).not.toHaveBeenCalled();
    expect(localActions.closeBlockedWebsite).not.toHaveBeenCalled();
    expect(localActions.quitBlockedApp).not.toHaveBeenCalled();
  });

  it("sends a distracting site to the blocked screen and leaves the card closed", async () => {
    nudgeWindow.showNudgeCard.mockClear();
    localActions.closeBlockedWebsite.mockClear();
    localActions.quitBlockedApp.mockClear();
    const controller = new AppController();
    controller.settings = { ...controller.settings, distractionResponse: "block" };
    rate(controller, "Distracting");
    controller.tracker.onForeground?.(youtube);
    await vi.waitFor(() => {
      expect(localActions.closeBlockedWebsite).toHaveBeenCalledWith("Google Chrome", "com.google.Chrome", ["youtube.com"]);
    });
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();
    expect(localActions.quitBlockedApp).not.toHaveBeenCalled();
  });

  it("quits a distracting app and opens the freedom window", async () => {
    freedomWindow.showFreedomScreen.mockClear();
    nudgeWindow.showNudgeCard.mockClear();
    localActions.quitBlockedApp.mockClear();
    localActions.closeBlockedWebsite.mockClear();
    const controller = new AppController();
    controller.settings = { ...controller.settings, distractionResponse: "block" };
    controller.tracker.productivityAgent.cache = {
      "app|Notes#Plan": {
        verdict: "Distracting",
        confidence: 1,
        model: "user",
        at: "2026-10-15T00:00:00.000Z",
        source: "user",
      },
    };
    controller.tracker.onForeground?.(notes);
    await vi.waitFor(() => {
      expect(localActions.quitBlockedApp).toHaveBeenCalledWith("Notes", "com.apple.Notes");
    });
    expect(freedomWindow.showFreedomScreen).toHaveBeenCalledTimes(1);
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();
    expect(localActions.closeBlockedWebsite).not.toHaveBeenCalled();
  });

  it("blocks again when Back returns the focused tab to a distracting site", async () => {
    localActions.closeBlockedWebsite.mockClear();
    axBrowser.readFocusedBrowserContext.mockReset();
    axBrowser.readFocusedBrowserContext.mockReturnValue({
      title: "Funny Shorts",
      url: "https://www.youtube.com/watch?v=1",
      appName: "Google Chrome",
    });
    const controller = new AppController();
    rate(controller, "Distracting");
    controller.tracker.onForeground?.({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      title: "You are free",
      url: "http://127.0.0.1:49200/",
    });
    expect(localActions.closeBlockedWebsite).not.toHaveBeenCalled();
    vi.useFakeTimers();
    try {
      controller.updateSettings({ distractionResponse: "block" });
      await vi.advanceTimersByTimeAsync(250);
      expect(localActions.closeBlockedWebsite).toHaveBeenCalledTimes(1);
      expect(localActions.closeBlockedWebsite).toHaveBeenCalledWith("Google Chrome", "com.google.Chrome", ["youtube.com"]);
    } finally {
      vi.useRealTimers();
      controller.updateSettings({ distractionResponse: "popup" });
      await controller.shutdown();
    }
  });

  it("does not watch the focused tab for popup or don't block", async () => {
    axBrowser.readFocusedBrowserContext.mockClear();
    const controller = new AppController();
    controller.tracker.onForeground?.(youtube);
    vi.useFakeTimers();
    try {
      controller.updateSettings({ distractionResponse: "popup" });
      await vi.advanceTimersByTimeAsync(1000);
      controller.updateSettings({ distractionResponse: "off" });
      await vi.advanceTimersByTimeAsync(1000);
      expect(axBrowser.readFocusedBrowserContext).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      controller.updateSettings({ distractionResponse: "popup" });
      await controller.shutdown();
    }
  });

  it("leaves a scheduled block to that schedule", async () => {
    localActions.closeBlockedWebsite.mockClear();
    nudgeWindow.showNudgeCard.mockClear();
    const controller = new AppController();
    controller.settings = { ...controller.settings, distractionResponse: "block" };
    rate(controller, "Distracting");
    controller.localEnforcer.setPolicy(policy());
    controller.localEnforcer.enforce = async () => {};
    controller.tracker.onForeground?.(youtube);
    await Promise.resolve();
    expect(localActions.closeBlockedWebsite).not.toHaveBeenCalled();
    expect(nudgeWindow.showNudgeCard).not.toHaveBeenCalled();
  });
});

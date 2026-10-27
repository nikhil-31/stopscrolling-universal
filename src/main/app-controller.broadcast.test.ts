import { rmSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { IPC } from "@shared/ipc";
import { AppController } from "./app-controller";

const userData = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "broadcast-"));
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

let nextId = 1;

function fakeWindow(visible: boolean) {
  const listeners = new Map<string, () => void>();
  const send = vi.fn();
  const win = {
    visible,
    isDestroyed: () => false,
    isVisible: () => win.visible,
    isMinimized: () => false,
    on: (event: string, listener: () => void) => listeners.set(event, listener),
    webContents: { id: nextId++, send, once: () => {} },
    show() {
      win.visible = true;
      listeners.get("show")?.();
    },
  };
  return { win, send, asWindow: win as unknown as BrowserWindow };
}

describe("state broadcasts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("skips hidden windows and sends a full snapshot when one is shown", () => {
    vi.useFakeTimers();
    const controller = new AppController();
    const shown = fakeWindow(true);
    const hidden = fakeWindow(false);
    controller.addWindow(shown.asWindow);
    controller.addWindow(hidden.asWindow);

    controller.broadcast();
    vi.advanceTimersByTime(20);
    expect(shown.send).toHaveBeenCalledTimes(1);
    expect(hidden.send).not.toHaveBeenCalled();

    hidden.win.show();
    vi.advanceTimersByTime(20);
    expect(hidden.send).toHaveBeenCalledTimes(1);
    const [channel, state] = hidden.send.mock.calls[0];
    expect(channel).toBe(IPC.state);
    expect(state).toHaveProperty("timelines");
  });

  it("does not build a snapshot while every window is hidden", () => {
    vi.useFakeTimers();
    const controller = new AppController();
    const snapshot = vi.spyOn(controller, "snapshot");
    controller.addWindow(fakeWindow(false).asWindow);
    controller.broadcast();
    vi.advanceTimersByTime(20);
    // Only the first widget refresh builds one; later broadcasts in the same minute do not.
    controller.broadcast();
    vi.advanceTimersByTime(20);
    controller.broadcast();
    vi.advanceTimersByTime(20);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});

describe("sampling", () => {
  it("skips a tick while the previous sample is still running", async () => {
    const controller = new AppController();
    let finish = () => {};
    const slow = new Promise<void>((resolve) => (finish = resolve));
    const sample = vi.fn().mockReturnValueOnce(slow).mockResolvedValue(undefined);
    controller.tracker.sample = sample;
    const first = controller.tracker.sampleOnce();
    await controller.tracker.sampleOnce();
    expect(sample).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await controller.tracker.sampleOnce();
    expect(sample).toHaveBeenCalledTimes(2);
  });
});

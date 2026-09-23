import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({ logCrash: vi.fn() }));

import { logCrash } from "./logger";
import {
  installMainCrashHandlers,
  localCrashReporterOptions,
  logElectronChildProcessGone,
  logRendererProcessGone,
  logRendererUnresponsive,
  recordRendererCrash,
} from "./crash-reporting";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("local crash reporter", () => {
  it("keeps minidumps on disk", () => {
    expect(localCrashReporterOptions()).toEqual({ submitURL: "", uploadToServer: false });
  });
});

describe("main process crash handlers", () => {
  it("records an uncaught exception and exits", () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    installMainCrashHandlers(target, exit);
    const error = new Error("main boom");
    target.emit("uncaughtException", error);
    expect(logCrash).toHaveBeenCalledWith({
      kind: "uncaughtException",
      process: "main",
      reason: "main boom",
      stack: error.stack,
    });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("records an unhandled rejection and exits", () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    installMainCrashHandlers(target, exit);
    target.emit("unhandledRejection", "rejected");
    expect(logCrash).toHaveBeenCalledWith({
      kind: "unhandledRejection",
      process: "main",
      reason: "rejected",
      stack: undefined,
    });
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("renderer crash forwarding", () => {
  it("records a renderer report", () => {
    recordRendererCrash({ kind: "error", reason: "render boom", stack: "stack" });
    expect(logCrash).toHaveBeenCalledWith({
      kind: "error",
      process: "renderer",
      reason: "render boom",
      stack: "stack",
    });
  });

  it("ignores payloads that are not crash reports", () => {
    recordRendererCrash({ kind: "activity", reason: "https://example.com", title: "Inbox" });
    recordRendererCrash(null);
    expect(logCrash).not.toHaveBeenCalled();
  });

  it("records renderer process failures and skips clean exits", () => {
    logRendererProcessGone({ reason: "clean-exit", exitCode: 0 });
    logRendererProcessGone({ reason: "crashed", exitCode: 11 });
    logRendererUnresponsive();
    logElectronChildProcessGone({ type: "GPU", reason: "oom", exitCode: -1 });
    logElectronChildProcessGone({ type: "Utility", reason: "clean-exit", exitCode: 0 });
    expect(logCrash).toHaveBeenCalledTimes(3);
    expect(logCrash).toHaveBeenNthCalledWith(1, {
      kind: "render-process-gone",
      process: "renderer",
      reason: "crashed exitCode=11",
    });
    expect(logCrash).toHaveBeenNthCalledWith(2, {
      kind: "unresponsive",
      process: "renderer",
      reason: "unresponsive",
    });
    expect(logCrash).toHaveBeenNthCalledWith(3, {
      kind: "child-process-gone",
      process: "GPU",
      reason: "oom exitCode=-1",
    });
  });
});

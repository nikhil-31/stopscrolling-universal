// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { installRendererCrashReporting } from "./crash-reporting";

describe("renderer crash reporting", () => {
  it("forwards window errors without the source location", () => {
    const report = vi.fn();
    installRendererCrashReporting(report);
    const error = new Error("render failed");
    window.dispatchEvent(new ErrorEvent("error", {
      message: error.message,
      error,
      filename: "http://localhost:5173/src/App.tsx",
    }));
    expect(report).toHaveBeenCalledWith({
      kind: "error",
      reason: "render failed",
      stack: error.stack,
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain("http://");
  });

  it("forwards unhandled rejections", () => {
    const report = vi.fn();
    const target = new EventTarget() as Window;
    installRendererCrashReporting(report, target);
    const reason = new Error("rejected");
    target.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason,
    }));
    expect(report).toHaveBeenCalledWith({
      kind: "unhandledrejection",
      reason: "rejected",
      stack: reason.stack,
    });
  });
});

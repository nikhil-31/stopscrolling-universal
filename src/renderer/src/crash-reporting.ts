import type { RendererCrashReport } from "@shared/crash";

const installed = new WeakSet<object>();

function crashReason(value: unknown, fallback: string) {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

export function installRendererCrashReporting(
  report: (payload: RendererCrashReport) => void,
  target: Window = window,
) {
  if (installed.has(target)) return;
  installed.add(target);
  target.addEventListener("error", (event) => {
    const error = event.error;
    report({
      kind: "error",
      reason: crashReason(error, event.message || "error"),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });
  target.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    report({
      kind: "unhandledrejection",
      reason: crashReason(reason, "unhandledrejection"),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

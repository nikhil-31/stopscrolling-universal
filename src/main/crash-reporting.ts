import type { RendererCrashReport } from "@shared/crash";
import { isRendererCrashReport } from "@shared/crash";
import { logCrash } from "./logger";

type CrashProcess = {
  on(event: "uncaughtException", listener: (error: unknown) => void): void;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

export function localCrashReporterOptions() {
  return { submitURL: "", uploadToServer: false as const };
}

function reasonText(value: unknown) {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string") return value;
  return "unknown";
}

function stackText(value: unknown) {
  return value instanceof Error ? value.stack : undefined;
}

export function installMainCrashHandlers(
  target: CrashProcess = process,
  exit: (code: number) => void = (code) => process.exit(code),
) {
  target.on("uncaughtException", (error) => {
    try {
      logCrash({
        kind: "uncaughtException",
        process: "main",
        reason: reasonText(error),
        stack: stackText(error),
      });
    } finally {
      exit(1);
    }
  });
  target.on("unhandledRejection", (reason) => {
    try {
      logCrash({
        kind: "unhandledRejection",
        process: "main",
        reason: reasonText(reason),
        stack: stackText(reason),
      });
    } finally {
      exit(1);
    }
  });
}

export function logRendererProcessGone(details: { reason: string; exitCode: number }) {
  if (details.reason === "clean-exit") return;
  logCrash({
    kind: "render-process-gone",
    process: "renderer",
    reason: `${details.reason} exitCode=${details.exitCode}`,
  });
}

export function logRendererUnresponsive() {
  logCrash({
    kind: "unresponsive",
    process: "renderer",
    reason: "unresponsive",
  });
}

export function logElectronChildProcessGone(details: { type: string; reason: string; exitCode: number }) {
  if (details.reason === "clean-exit") return;
  logCrash({
    kind: "child-process-gone",
    process: details.type,
    reason: `${details.reason} exitCode=${details.exitCode}`,
  });
}

export function recordRendererCrash(payload: unknown) {
  if (!isRendererCrashReport(payload)) return;
  const report: RendererCrashReport = payload;
  logCrash({
    kind: report.kind,
    process: "renderer",
    reason: report.reason,
    stack: report.stack,
  });
}

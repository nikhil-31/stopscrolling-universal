export const RENDERER_CRASH_KINDS = ["error", "unhandledrejection"] as const;

export type RendererCrashKind = (typeof RENDERER_CRASH_KINDS)[number];

export type RendererCrashReport = {
  kind: RendererCrashKind;
  reason: string;
  stack?: string;
};

export function isRendererCrashReport(value: unknown): value is RendererCrashReport {
  if (!value || typeof value !== "object") return false;
  const report = value as RendererCrashReport;
  return (report.kind === "error" || report.kind === "unhandledrejection")
    && typeof report.reason === "string"
    && (report.stack === undefined || typeof report.stack === "string");
}

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { crashLogPath, networkLogPath, observabilityLogPath } from "./paths";

function append(file: string, line: string) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${new Date().toISOString()} ${line}\n`, "utf8");
}

export function logNetwork(message: string) {
  append(networkLogPath(), message);
}

export function logObservability(message: string) {
  append(observabilityLogPath(), message);
}

export function sanitizeCrashText(value: string, max = 500) {
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [token]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[token]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function crashToken(value: string) {
  const token = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return token.slice(0, 64) || "unknown";
}

export function logCrash(report: { kind: string; process: string; reason: string; stack?: string }) {
  const reason = sanitizeCrashText(report.reason, 500);
  const stack = report.stack ? sanitizeCrashText(report.stack, 1500) : "";
  const stackPart = stack ? ` stack=${stack}` : "";
  append(
    crashLogPath(),
    `kind=${crashToken(report.kind)} process=${crashToken(report.process)} reason=${reason}${stackPart}`,
  );
}

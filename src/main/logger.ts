import { closeSync, fstatSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { crashLogPath, networkLogPath, observabilityLogPath } from "./paths";

/** A log past this size moves to `<name>.1`, replacing the previous one. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

/** Open descriptors by path, so a line costs one write instead of mkdir + open + close. */
const openLogs = new Map<string, { fd: number; size: number }>();

function openLog(file: string) {
  const existing = openLogs.get(file);
  if (existing) return existing;
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "a");
  const log = { fd, size: fstatSync(fd).size };
  openLogs.set(file, log);
  return log;
}

function rotate(file: string, fd: number) {
  closeSync(fd);
  openLogs.delete(file);
  try {
    renameSync(file, `${file}.1`);
  } catch {
    // Keep appending to the same file if it cannot be moved.
  }
}

// Writes stay synchronous so a crash line is on disk before the process exits.
function append(file: string, line: string) {
  try {
    let log = openLog(file);
    if (log.size >= MAX_LOG_BYTES) {
      rotate(file, log.fd);
      log = openLog(file);
    }
    log.size += writeSync(log.fd, `${new Date().toISOString()} ${line}\n`, null, "utf8");
  } catch {
    const broken = openLogs.get(file);
    openLogs.delete(file);
    try {
      if (broken) closeSync(broken.fd);
    } catch {
      // Already closed.
    }
  }
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

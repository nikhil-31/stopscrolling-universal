import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { networkLogPath, observabilityLogPath } from "./paths";

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

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ForegroundContext } from "@shared/types";
import { checkpointPath } from "./paths";

export interface OpenSessionCheckpoint {
  start: string;
  /** Last input while this session was open. Absent on checkpoints written before idle trimming. */
  lastActive?: string;
  context: ForegroundContext;
  timeZoneIdentifier: string;
}

export function saveCheckpoint(session: OpenSessionCheckpoint | null) {
  mkdirSync(dirname(checkpointPath()), { recursive: true });
  if (!session) {
    if (existsSync(checkpointPath())) unlinkSync(checkpointPath());
    return;
  }
  writeFileSync(checkpointPath(), JSON.stringify(session), "utf8");
}

export function loadCheckpoint(): OpenSessionCheckpoint | null {
  try {
    if (!existsSync(checkpointPath())) return null;
    return JSON.parse(readFileSync(checkpointPath(), "utf8")) as OpenSessionCheckpoint;
  } catch {
    return null;
  }
}

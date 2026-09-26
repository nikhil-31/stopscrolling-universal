import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TimesheetSummaries } from "@shared/timesheet";
import { timesheetSummariesPath } from "./paths";

const MAX_STORED_SUMMARIES = 2000;

/** Only finished summaries are kept; pending ones are requested again after a restart. */
export function loadTimesheetSummaries(): TimesheetSummaries {
  try {
    if (!existsSync(timesheetSummariesPath())) return {};
    const parsed = JSON.parse(readFileSync(timesheetSummariesPath(), "utf8")) as Record<string, string>;
    const summaries: TimesheetSummaries = {};
    for (const [id, summary] of Object.entries(parsed)) {
      if (typeof summary === "string" && summary) summaries[id] = { status: "ready", summary };
    }
    return summaries;
  } catch {
    return {};
  }
}

export function saveTimesheetSummaries(summaries: TimesheetSummaries) {
  const ready = Object.entries(summaries)
    .filter(([, value]) => value.status === "ready" && value.summary)
    .slice(-MAX_STORED_SUMMARIES);
  mkdirSync(dirname(timesheetSummariesPath()), { recursive: true });
  writeFileSync(
    timesheetSummariesPath(),
    JSON.stringify(Object.fromEntries(ready.map(([id, value]) => [id, value.summary]))),
    "utf8",
  );
}

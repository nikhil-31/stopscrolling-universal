import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultWorkspace, normalizeWorkspace, type CalendarWorkspace } from "@shared/calendar-workspace";
import { calendarWorkspacePath } from "./paths";

export function loadCalendarWorkspace(): CalendarWorkspace {
  try {
    if (!existsSync(calendarWorkspacePath())) return defaultWorkspace();
    const parsed = JSON.parse(readFileSync(calendarWorkspacePath(), "utf8")) as Partial<CalendarWorkspace>;
    return normalizeWorkspace(parsed);
  } catch {
    return defaultWorkspace();
  }
}

export function saveCalendarWorkspace(workspace: CalendarWorkspace) {
  mkdirSync(dirname(calendarWorkspacePath()), { recursive: true });
  writeFileSync(calendarWorkspacePath(), JSON.stringify(workspace, null, 2), "utf8");
}

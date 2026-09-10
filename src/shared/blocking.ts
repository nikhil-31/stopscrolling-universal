import type { BlockingSchedule } from "./types";

export const WEEKDAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

export function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function parseCommaSeparated(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function blocklistEntriesFromText(websites: string, apps: string) {
  return [
    ...parseCommaSeparated(websites).map((identifier) => ({
      entry_type: "website" as const,
      identifier,
    })),
    ...parseCommaSeparated(apps).map((identifier) => ({
      entry_type: "app" as const,
      identifier,
    })),
  ];
}

export function clockLabel(time: string) {
  return time.slice(0, 5);
}

export function parseMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function isScheduleRunningNow(
  schedule: Pick<BlockingSchedule, "is_active" | "days_of_week" | "start_time" | "end_time">,
  now = new Date(),
) {
  if (!schedule.is_active) return false;
  const jsDay = now.getDay();
  const mondayBased = jsDay === 0 ? 6 : jsDay - 1;
  if (!schedule.days_of_week.includes(mondayBased)) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseMinutes(schedule.start_time);
  const endMinutes = parseMinutes(schedule.end_time);
  return minutes >= startMinutes && minutes < endMinutes;
}

export function isAlwaysActive(
  schedule: Pick<BlockingSchedule, "days_of_week" | "start_time" | "end_time">,
) {
  if (new Set(schedule.days_of_week).size < 7) return false;
  const start = clockLabel(schedule.start_time);
  const end = clockLabel(schedule.end_time);
  return start === "00:00" && (end === "23:59" || end === "24:00");
}

export function remainingUntilEnd(
  schedule: Pick<BlockingSchedule, "end_time">,
  now = new Date(),
) {
  const endMinutes = parseMinutes(schedule.end_time);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, endMinutes - nowMinutes);
}

export function formatRemaining(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
  const minuteLabel = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (hours === 0) return `${minuteLabel} left`;
  if (minutes === 0) return `${hourLabel} left`;
  return `${hourLabel} ${minuteLabel} left`;
}

export function formatWeekdays(days: number[]) {
  const labels = new Map<number, string>(WEEKDAYS.map((day) => [day.value, day.label]));
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => labels.get(day) ?? String(day))
    .join(", ");
}

export function scheduleWhen(
  schedule: Pick<BlockingSchedule, "start_time" | "end_time" | "days_of_week">,
  options?: { today?: boolean },
) {
  const range = `${clockLabel(schedule.start_time)} – ${clockLabel(schedule.end_time)}`;
  if (options?.today) return `${range} · Today`;
  if (schedule.days_of_week.length === 7) return `${range} · Every day`;
  return `${range} · ${formatWeekdays(schedule.days_of_week)}`;
}

export function scheduleRowKind(
  schedule: Pick<BlockingSchedule, "is_active" | "days_of_week" | "start_time" | "end_time">,
  now = new Date(),
): "current" | "schedule" | "named" {
  if (isScheduleRunningNow(schedule, now)) return "current";
  if (isAlwaysActive(schedule)) return "schedule";
  return "named";
}

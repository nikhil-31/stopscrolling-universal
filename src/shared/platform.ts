import type { DevicePlatform } from "./types";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function currentDevicePlatform(): DevicePlatform {
  switch (process.platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function effectiveTimeZone(preferred?: string | null): string {
  const zone = preferred?.trim();
  if (!zone) return localTimeZone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
    return zone;
  } catch {
    return localTimeZone();
  }
}

export function localTimeZoneLabel(timeZone = localTimeZone()): string {
  try {
    const zoneName = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return zoneName || timeZone;
  } catch {
    return timeZone || "Local";
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string) {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    zonedFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function zonedParts(date: Date, timeZone = localTimeZone()): ZonedParts {
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let weekday = "";
  for (const part of zonedFormatter(timeZone).formatToParts(date)) {
    switch (part.type) {
      case "year": year = Number(part.value); break;
      case "month": month = Number(part.value); break;
      case "day": day = Number(part.value); break;
      case "hour": hour = Number(part.value); break;
      case "minute": minute = Number(part.value); break;
      case "second": second = Number(part.value); break;
      case "weekday": weekday = part.value; break;
    }
  }
  if (hour === 24) {
    hour = 0;
    const next = shiftCalendarDate(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: WEEKDAY_INDEX[weekday] ?? 0,
  };
}

function offsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function zonedDateTime(
  year: number,
  month: number,
  day: number,
  timeZone = localTimeZone(),
  hour = 0,
  minute = 0,
  second = 0,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = utcGuess - offsetMs(new Date(utcGuess), timeZone);
  const secondPass = utcGuess - offsetMs(new Date(first), timeZone);
  return new Date(secondPass);
}

export function shiftCalendarDate(year: number, month: number, day: number, days: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function addCalendarDays(date: Date, days: number, timeZone = localTimeZone()) {
  const parts = zonedParts(date, timeZone);
  const next = shiftCalendarDate(parts.year, parts.month, parts.day, days);
  return zonedDateTime(next.year, next.month, next.day, timeZone);
}

export function toDateInput(date: Date, timeZone = localTimeZone()): string {
  const parts = zonedParts(date, timeZone);
  const month = `${parts.month}`.padStart(2, "0");
  const day = `${parts.day}`.padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function startOfDay(date: Date, timeZone = localTimeZone()): Date {
  const parts = zonedParts(date, timeZone);
  return zonedDateTime(parts.year, parts.month, parts.day, timeZone);
}

export function endOfDay(date: Date, timeZone = localTimeZone()): Date {
  const parts = zonedParts(date, timeZone);
  const next = shiftCalendarDate(parts.year, parts.month, parts.day, 1);
  return zonedDateTime(next.year, next.month, next.day, timeZone);
}

export function startOfMonth(date: Date, timeZone = localTimeZone()): Date {
  const parts = zonedParts(date, timeZone);
  return zonedDateTime(parts.year, parts.month, 1, timeZone);
}

export function endOfMonth(date: Date, timeZone = localTimeZone()): Date {
  const parts = zonedParts(date, timeZone);
  const next = parts.month === 12
    ? { year: parts.year + 1, month: 1 }
    : { year: parts.year, month: parts.month + 1 };
  return zonedDateTime(next.year, next.month, 1, timeZone);
}

export function weekdayIndex(date: Date, timeZone = localTimeZone()) {
  return zonedParts(date, timeZone).weekday;
}

export function clip(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

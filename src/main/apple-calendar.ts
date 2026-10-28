import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import koffi from "koffi";
import type { AppleCalendarAccess } from "@shared/types";

const LIBRARY = "StopScrollingCalendar.dylib";

export interface AppleCalendar {
  id: string;
  title: string;
  /** The account in Calendar.app (iCloud, an email address, "On My Mac"…). */
  sourceTitle: string;
  colorHex: string | null;
  isGoogleSourced: boolean;
}

export interface AppleCalendarEvent {
  id: string;
  icalUid: string | null;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarId: string;
  calendarName: string;
  colorHex: string | null;
}

type RequestFn = ((operation: string, body: string, result: unknown[], error: unknown[]) => number) & {
  async: (
    operation: string,
    body: string,
    result: unknown[],
    error: unknown[],
    done: (error: unknown, status: number) => void,
  ) => void;
};

interface CalendarLibrary {
  request: RequestFn;
  free: (pointer: unknown) => void;
}

export function appleCalendarLibraryCandidates(
  execPath = process.execPath,
  resourcesPath = process.resourcesPath ?? "",
  cwd = process.cwd(),
) {
  return [
    join(dirname(execPath), "../Frameworks", LIBRARY),
    join(resourcesPath, "native/macos", LIBRARY),
    join(cwd, "release-native/macos", LIBRARY),
    join(cwd, "native/macos/.derivedData/widget-pack", LIBRARY),
  ];
}

/**
 * Reads Calendar.app through EventKit in this process, so macOS asks for calendar access on
 * behalf of Stop Scrolling. Everything reports `unsupported` / empty off macOS or without the library.
 */
export class AppleCalendarBridge {
  private library: CalendarLibrary | null | undefined;

  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly findLibrary: () => string | null = () =>
      appleCalendarLibraryCandidates().find((path) => path && existsSync(path)) ?? null,
  ) {}

  supported() {
    return this.load() !== null;
  }

  async access(): Promise<AppleCalendarAccess> {
    if (!this.supported()) return "unsupported";
    return (await this.call<{ access: AppleCalendarAccess }>("authorizationStatus")).access;
  }

  /** Shows the macOS permission prompt if the user hasn't decided yet. */
  async requestAccess(): Promise<AppleCalendarAccess> {
    if (!this.supported()) return "unsupported";
    return (await this.call<{ access: AppleCalendarAccess }>("requestAccess")).access;
  }

  async calendars(): Promise<AppleCalendar[]> {
    if (!this.supported()) return [];
    return this.call<AppleCalendar[]>("listCalendars");
  }

  async events(start: Date, end: Date, calendarIds: string[]): Promise<AppleCalendarEvent[]> {
    if (!this.supported() || !calendarIds.length) return [];
    return this.call<AppleCalendarEvent[]>("events", {
      start: start.toISOString(),
      end: end.toISOString(),
      calendarIds,
    });
  }

  private load(): CalendarLibrary | null {
    if (this.library !== undefined) return this.library;
    this.library = null;
    if (this.platform !== "darwin") return null;
    const path = this.findLibrary();
    if (!path) return null;
    try {
      const lib = koffi.load(path);
      this.library = {
        request: lib.func(
          "int ss_calendar_request(const char *operation, const char *body, _Out_ char **result, _Out_ char **error)",
        ) as RequestFn,
        free: lib.func("void ss_calendar_free(void *pointer)"),
      };
    } catch {
      this.library = null;
    }
    return this.library;
  }

  /** Runs on a worker thread: EventKit calls block, and the permission prompt waits for the user. */
  private call<T>(operation: string, body: object = {}): Promise<T> {
    const lib = this.load();
    if (!lib) return Promise.reject(new Error("Apple Calendar isn't available."));
    const result: unknown[] = [null];
    const error: unknown[] = [null];
    return new Promise<T>((resolve, reject) => {
      lib.request.async(operation, JSON.stringify(body), result, error, (failure, status) => {
        const payload = takeString(lib, result);
        const message = takeString(lib, error);
        if (failure) reject(failure instanceof Error ? failure : new Error(String(failure)));
        else if (status !== 0) reject(new Error(message || "Apple Calendar request failed."));
        else resolve(JSON.parse(payload || "null") as T);
      });
    });
  }
}

function takeString(lib: CalendarLibrary, slot: unknown[]) {
  const pointer = slot[0];
  if (!pointer) return "";
  if (typeof pointer === "string") return pointer;
  const text = koffi.decode(pointer, "str") as string;
  lib.free(pointer);
  return text;
}

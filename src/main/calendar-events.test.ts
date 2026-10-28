import { describe, expect, it, vi } from "vitest";
import type { CalendarConnectionRow, CalendarErrorRow, CalendarEventRow, CalendarSourceRow } from "@shared/types";
import type { AppleCalendar, AppleCalendarEvent } from "./apple-calendar";
import { CalendarEventsService, dedupeEvents, type CalendarEventsApi } from "./calendar-events";

vi.mock("./logger", () => ({ logNetwork: vi.fn(), logObservability: vi.fn() }));

const start = new Date("2026-09-07T07:00:00.000Z");
const end = new Date("2026-09-14T07:00:00.000Z");

function connection(patch: Partial<CalendarConnectionRow> = {}): CalendarConnectionRow {
  return {
    id: 1,
    provider: "google",
    account_email: "ada@example.com",
    status: "active",
    last_error: "",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...patch,
  };
}

function source(patch: Partial<CalendarSourceRow> = {}): CalendarSourceRow {
  return {
    id: 10,
    connection_id: 1,
    account_email: "ada@example.com",
    provider: "google",
    name: "Ada",
    color_hex: "#4285f4",
    is_primary: true,
    selected: true,
    ...patch,
  };
}

function googleEvent(patch: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "google:ada:1",
    ical_uid: "standup@google.com",
    title: "Standup",
    start: "2026-09-08T09:00:00-07:00",
    end: "2026-09-08T09:15:00-07:00",
    is_all_day: false,
    calendar_id: "10",
    calendar_name: "Ada",
    color_hex: "#4285f4",
    provider: "google",
    ...patch,
  };
}

function appleCalendar(patch: Partial<AppleCalendar> = {}): AppleCalendar {
  return { id: "home", title: "Home", sourceTitle: "iCloud", colorHex: "#FF0000", isGoogleSourced: false, ...patch };
}

function appleEvent(patch: Partial<AppleCalendarEvent> = {}): AppleCalendarEvent {
  return {
    id: "apple:1:0",
    icalUid: null,
    title: "Dentist",
    start: "2026-09-09T17:00:00Z",
    end: "2026-09-09T18:00:00Z",
    isAllDay: false,
    calendarId: "home",
    calendarName: "Home",
    colorHex: "#FF0000",
    ...patch,
  };
}

function setup(options: {
  connections?: CalendarConnectionRow[];
  sources?: CalendarSourceRow[];
  appleAccess?: "fullAccess" | "unsupported" | "notDetermined";
  appleCalendars?: AppleCalendar[];
  appleEvents?: AppleCalendarEvent[];
  appleIds?: string[] | null;
  signedIn?: boolean;
} = {}) {
  const api = {
    calendarConnections: vi.fn(async () => options.connections ?? []),
    startGoogleCalendarConnect: vi.fn(async () => ({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" })),
    deleteCalendarConnection: vi.fn(async () => undefined),
    calendarSources: vi.fn(async () => ({ calendars: options.sources ?? [], errors: [] })),
    setCalendarSourceSelected: vi.fn(async (id: number, selected: boolean) => source({ id, selected })),
    calendarEvents: vi.fn(async (): Promise<{ events: CalendarEventRow[]; errors: CalendarErrorRow[] }> => ({
      events: [googleEvent()],
      errors: [],
    })),
  } satisfies CalendarEventsApi;
  const apple = {
    supported: vi.fn(() => options.appleAccess !== "unsupported"),
    access: vi.fn(async () => options.appleAccess ?? "unsupported"),
    requestAccess: vi.fn(async () => "fullAccess" as const),
    calendars: vi.fn(async () => options.appleCalendars ?? []),
    events: vi.fn(async () => options.appleEvents ?? []),
  };
  let appleIds = options.appleIds ?? null;
  const host = {
    signedIn: () => options.signedIn ?? true,
    appleCalendarIds: () => appleIds,
    setAppleCalendarIds: vi.fn((ids: string[] | null) => {
      appleIds = ids;
    }),
    openExternal: vi.fn(async () => undefined),
    changed: vi.fn(),
  };
  const service = new CalendarEventsService(api, apple, host, 1);
  return { api, apple, host, service };
}

describe("CalendarEventsService", () => {
  it("asks the server for the whole visible range in the viewer's zone", async () => {
    const { api, service } = setup({ connections: [connection()], sources: [source()] });
    await service.refresh();
    const events = await service.events(start, end, "America/Los_Angeles");
    expect(api.calendarEvents).toHaveBeenCalledWith({
      start: "2026-09-07T07:00:00.000Z",
      end: "2026-09-14T07:00:00.000Z",
      tz: "America/Los_Angeles",
    });
    expect(events).toEqual([expect.objectContaining({ title: "Standup", provider: "google", calendarId: "10", icalUid: "standup@google.com" })]);
  });

  it("skips the server when no Google calendar is linked or selected", async () => {
    const { api, service } = setup({ connections: [connection()], sources: [source({ selected: false })] });
    await service.refresh();
    expect(await service.events(start, end, "UTC")).toEqual([]);
    expect(api.calendarEvents).not.toHaveBeenCalled();
  });

  it("leaves out Apple calendars that come from a linked Google account", async () => {
    const { apple, service } = setup({
      connections: [connection()],
      sources: [source()],
      appleAccess: "fullAccess",
      appleCalendars: [
        appleCalendar(),
        appleCalendar({ id: "gmail", title: "Ada", sourceTitle: "Google", isGoogleSourced: true }),
        appleCalendar({ id: "workspace", title: "Work", sourceTitle: "ADA@example.com" }),
      ],
      appleEvents: [appleEvent()],
    });
    await service.refresh();
    const events = await service.events(start, end, "UTC");
    expect(apple.events).toHaveBeenCalledWith(start, end, ["home"]);
    expect(events.map((event) => event.title)).toEqual(["Standup", "Dentist"]);
    expect(service.state().calendars.filter((calendar) => calendar.coveredByGoogle).map((calendar) => calendar.id))
      .toEqual(["gmail", "workspace"]);
  });

  it("shows every Apple calendar when Google isn't linked, signed out included", async () => {
    const { apple, service } = setup({
      signedIn: false,
      appleAccess: "fullAccess",
      appleCalendars: [appleCalendar(), appleCalendar({ id: "gmail", sourceTitle: "Google", isGoogleSourced: true })],
    });
    await service.refresh();
    await service.events(start, end, "UTC");
    expect(apple.events).toHaveBeenCalledWith(start, end, ["home", "gmail"]);
  });

  it("still returns Apple events when Google fails, and says what failed", async () => {
    const { api, service } = setup({
      connections: [connection()],
      sources: [source()],
      appleAccess: "fullAccess",
      appleCalendars: [appleCalendar()],
      appleEvents: [appleEvent()],
    });
    api.calendarEvents.mockRejectedValueOnce(new TypeError("fetch failed"));
    await service.refresh();
    const events = await service.events(start, end, "UTC");
    expect(events.map((event) => event.title)).toEqual(["Dentist"]);
    expect(service.state().errors).toEqual(["Couldn't load Google Calendar events."]);
  });

  it("marks an account for reconnecting when the server says its access expired", async () => {
    const { api, service } = setup({ connections: [connection()], sources: [source()] });
    api.calendarEvents.mockResolvedValueOnce({
      events: [],
      errors: [{ connection_id: 1, account_email: "ada@example.com", calendar_name: null, needs_reauth: true, detail: "Reconnect this Google account." }],
    });
    await service.refresh();
    await service.events(start, end, "UTC");
    expect(service.state().google.accounts).toEqual([{ id: 1, email: "ada@example.com", needsReauth: true }]);
    expect(service.state().errors).toEqual(["ada@example.com: Reconnect this Google account."]);
  });

  it("stores Apple choices as an explicit list once the user changes one", async () => {
    const { host, service } = setup({
      appleAccess: "fullAccess",
      appleCalendars: [appleCalendar(), appleCalendar({ id: "birthdays", title: "Birthdays" })],
    });
    await service.refresh();
    await service.setSelected("apple", "birthdays", false);
    expect(host.setAppleCalendarIds).toHaveBeenCalledWith(["home"]);
  });

  it("opens Google in the browser and finishes when the server lists the new account", async () => {
    const { api, host, service } = setup({ sources: [source()] });
    api.calendarConnections
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([connection()]);
    const linked = service.connectGoogle();
    expect(service.state().google.connecting).toBe(true);
    await expect(linked).resolves.toBe(true);
    expect(host.openExternal).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    expect(service.state().google).toMatchObject({ connecting: false, accounts: [{ id: 1, email: "ada@example.com", needsReauth: false }] });
  });

  it("finishes a reconnect when the expired account becomes active again", async () => {
    const { api, service } = setup();
    api.calendarConnections
      .mockResolvedValueOnce([connection({ status: "needs_reauth" })])
      .mockResolvedValue([connection({ updated_at: "2026-09-08T00:00:00Z" })]);
    await expect(service.connectGoogle()).resolves.toBe(true);
  });

  it("stops waiting for Google when the user signs out", async () => {
    const { api, service } = setup();
    api.calendarConnections.mockResolvedValue([]);
    const linked = service.connectGoogle();
    await vi.waitFor(() => expect(api.startGoogleCalendarConnect).toHaveBeenCalled());
    service.reset();
    await expect(linked).resolves.toBe(false);
  });
});

describe("dedupeEvents", () => {
  it("keeps the Google copy of a meeting that also comes through Calendar.app", () => {
    const google = [{
      id: "google:1",
      title: "Standup",
      start: "2026-09-08T09:00:00-07:00",
      end: "2026-09-08T09:15:00-07:00",
      calendarId: "10",
      calendarName: "Ada",
      isAllDay: false,
      colorHex: null,
      provider: "google" as const,
      icalUid: "standup@google.com",
    }];
    const apple = [
      { ...google[0], id: "apple:1", provider: "apple" as const, start: "2026-09-08T16:00:00Z" },
      { ...google[0], id: "apple:2", provider: "apple" as const, start: "2026-09-09T16:00:00Z", title: "Next standup" },
    ];
    expect(dedupeEvents(google, apple).map((event) => event.id)).toEqual(["google:1", "apple:2"]);
  });
});

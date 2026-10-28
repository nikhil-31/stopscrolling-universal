import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "@shared/calendar-workspace";
import { APIError, StopScrollingAPI } from "./api-client";

vi.mock("./logger", () => ({ logNetwork: vi.fn(), logObservability: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

function api() {
  return new StopScrollingAPI("https://example.test/", { access: "access", refresh: "refresh" }, () => undefined);
}

describe("calendar API", () => {
  it("reads linked accounts, calendars, and events from the server", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ calendars: [], errors: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [], errors: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 4, selected: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const client = api();

    await client.calendarConnections();
    await client.calendarSources(true);
    await client.calendarEvents({ start: "2026-09-07T07:00:00.000Z", end: "2026-09-14T07:00:00.000Z", tz: "America/Los_Angeles" });
    await client.setCalendarSourceSelected(4, false);
    await client.deleteCalendarConnection(2);

    expect(fetch.mock.calls.map(([url, init]) => [init?.method ?? "GET", url])).toEqual([
      ["GET", "https://example.test/api/calendars/connections/"],
      ["GET", "https://example.test/api/calendars/calendars/?refresh=1"],
      ["GET", "https://example.test/api/calendars/events/?start=2026-09-07T07%3A00%3A00.000Z&end=2026-09-14T07%3A00%3A00.000Z&tz=America%2FLos_Angeles"],
      ["PATCH", "https://example.test/api/calendars/calendars/4/"],
      ["DELETE", "https://example.test/api/calendars/connections/2/"],
    ]);
    expect(fetch.mock.calls[3][1].body).toBe(JSON.stringify({ selected: false }));
  });

  it("sends the workspace with the version it was based on and surfaces conflicts", async () => {
    const newer = { version: 5, data: defaultWorkspace(), updated_at: "2026-09-08T00:00:00Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(newer), { status: 409 })));

    const error = await api().putCalendarWorkspace(4, defaultWorkspace(), "macos|Studio Mac").catch((caught) => caught);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ status: 409, body: newer });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ base_version: 4, data: defaultWorkspace(), device_key: "macos|Studio Mac" });
  });
});

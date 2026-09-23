import { afterEach, describe, expect, it, vi } from "vitest";
import { StopScrollingAPI } from "./api-client";

vi.mock("./logger", () => ({ logNetwork: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe("blocking API client", () => {
  it("ends a normal occurrence using the backend contract", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      occurrence_id: "occurrence",
      schedule_id: "schedule",
      device_id: "device",
      occurrence_start: "2026-09-14T00:00:00Z",
      occurrence_end: "2026-09-14T01:00:00Z",
      canceled_at: "2026-09-14T00:30:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI(
      "https://example.test/",
      { access: "access", refresh: "refresh" },
      () => undefined,
    );

    const result = await api.endNormalOccurrence("schedule", "device");

    expect(result.occurrence_id).toBe("occurrence");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/api/blocking-schedules/schedule/end/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ device_id: "device" }) }),
    );
  });

  it("keeps the saved session when refreshing the access token fails offline", async () => {
    const onTokens = vi.fn();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI(
      "https://example.test/",
      { access: "access", refresh: "refresh" },
      onTokens,
    );

    await expect(api.me()).rejects.toThrow("unauthorized");
    expect(onTokens).not.toHaveBeenCalledWith(null);
    expect(api.getTokens()).toEqual({ access: "access", refresh: "refresh" });
  });

  it("deletes a registered device", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI(
      "https://example.test/",
      { access: "access", refresh: "refresh" },
      () => undefined,
    );

    await api.deleteDevice("device-id");

    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/api/devices/device-id/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deletes a blocking schedule", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI(
      "https://example.test/",
      { access: "access", refresh: "refresh" },
      () => undefined,
    );

    await api.deleteBlockingSchedule("schedule");

    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/api/blocking-schedules/schedule/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("saves the account time zone and queries insights in that zone", async () => {
    const user = {
      id: 1,
      email: "ada@example.com",
      tracking_id: "tracking",
      totp_enabled: false,
      phone_number: "",
      phone_verified: false,
      mfa_delivery: "email",
      social_providers: [],
      time_zone: "America/Los_Angeles",
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(user), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total_seconds: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI(
      "https://example.test/",
      { access: "access", refresh: "refresh" },
      () => undefined,
    );

    const saved = await api.setTimeZone("America/Los_Angeles");
    await api.sessions({
      start: "2026-06-17T07:00:00.000Z",
      end: "2026-06-18T07:00:00.000Z",
      time_zone: saved.time_zone,
    });
    await api.periodSummary({
      start: "2026-06-17T07:00:00.000Z",
      end: "2026-06-18T07:00:00.000Z",
      time_zone: saved.time_zone,
      include_daily_totals: true,
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://example.test/api/auth/time-zone/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ time_zone: "America/Los_Angeles" }),
      }),
    );
    expect(fetch.mock.calls[1][0]).toContain("time_zone=America%2FLos_Angeles");
    expect(fetch.mock.calls[2][0]).toContain("time_zone=America%2FLos_Angeles");
  });

  it("does not surface HTML error pages as the API message", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<!DOCTYPE html><html><body>column missing</body></html>", {
      status: 500,
      headers: { "Content-Type": "text/html" },
    }));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI("https://example.test/", { access: "access", refresh: "refresh" }, () => undefined);

    await expect(api.deviceBlockingPolicy("device")).rejects.toMatchObject({
      status: 500,
      message: "Request failed (500).",
    });
  });
});

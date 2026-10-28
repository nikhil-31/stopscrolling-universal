import { afterEach, describe, expect, it, vi } from "vitest";
import { StopScrollingAPI } from "./api-client";

vi.mock("./logger", () => ({ logNetwork: vi.fn(), logObservability: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

function api() {
  return new StopScrollingAPI("https://example.test/", { access: "access", refresh: "refresh" }, () => undefined);
}

describe("Tempus API", () => {
  it("calls each Tempus endpoint with the expected method and body", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })));
    vi.stubGlobal("fetch", fetch);
    const client = api();

    await client.tempusConversations();
    await client.tempusConversation("c1");
    await client.createTempusConversation();
    await client.sendTempusMessage("c1", "How did I spend this week?");
    await client.planTempusDay("2026-10-28");
    await client.resolveTempusAction("a1", "confirm");
    await client.resolveTempusAction("a1", "reject");
    await client.tempusDigests("weekly");
    await client.requestTempusDigest("daily");

    expect(fetch.mock.calls.map(([url, init]) => [init?.method ?? "GET", url, init?.body])).toEqual([
      ["GET", "https://example.test/api/tempus/conversations/", undefined],
      ["GET", "https://example.test/api/tempus/conversations/c1/", undefined],
      ["POST", "https://example.test/api/tempus/conversations/", JSON.stringify({ title: "" })],
      ["POST", "https://example.test/api/tempus/conversations/c1/messages/", JSON.stringify({ content: "How did I spend this week?" })],
      ["POST", "https://example.test/api/tempus/plan/", JSON.stringify({ date: "2026-10-28" })],
      ["POST", "https://example.test/api/tempus/actions/a1/confirm/", undefined],
      ["POST", "https://example.test/api/tempus/actions/a1/reject/", undefined],
      ["GET", "https://example.test/api/tempus/digests/?period=weekly", undefined],
      ["POST", "https://example.test/api/tempus/digests/request/", JSON.stringify({ period: "daily" })],
    ]);
    expect(new Headers(fetch.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer access");
    expect(fetch.mock.calls[3][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the status of a refused turn", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Tempus is not enabled on this server." }), { status: 503 })));

    const error = await api().sendTempusMessage("c1", "hi").catch((caught) => caught);

    expect(error).toMatchObject({ status: 503, message: "Tempus is not enabled on this server." });
  });
});

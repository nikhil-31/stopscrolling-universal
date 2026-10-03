import { afterEach, describe, expect, it, vi } from "vitest";
import { StopScrollingAPI } from "./api-client";

vi.mock("./logger", () => ({ logNetwork: vi.fn(), logObservability: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe("game match API", () => {
  it("posts matches and asks the backend for Riot and Steam data", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ inserted: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ matches: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ match: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const api = new StopScrollingAPI("https://example.test/", { access: "access", refresh: "refresh" }, () => undefined);

    await api.postMatchesBulk([]);
    await api.riotMatches("2026-10-02T15:00:00.000Z");
    await api.steamPlaytime("730", "2026-10-02T16:00:00.000Z");

    expect(fetch).toHaveBeenNthCalledWith(1, "https://example.test/api/matches/bulk/", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ matches: [] }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://example.test/api/games/riot/matches/?since=2026-10-02T15%3A00%3A00.000Z",
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "https://example.test/api/games/steam/playtime/?app_id=730&ended_at=2026-10-02T16%3A00%3A00.000Z",
      expect.any(Object),
    );
  });
});

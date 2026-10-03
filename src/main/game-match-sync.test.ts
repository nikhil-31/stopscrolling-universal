import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameMatchPayload, ScreenTimeEntry } from "@shared/types";
import type { StopScrollingAPI } from "./api-client";
import { GameMatchSync } from "./game-match-sync";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn(async () => {}) },
}));

vi.mock("./logger", () => ({ logObservability: vi.fn() }));

const leagueMatch: GameMatchPayload = {
  platform: "riot",
  match_id: "NA1_1",
  game: "League of Legends",
  started_at: "2026-10-02T15:00:00.000Z",
  ended_at: "2026-10-02T15:32:00.000Z",
  duration_seconds: 1920,
  result: "win",
  queue: "Ranked Solo",
  map: "Summoner's Rift",
  player: { id: "puuid-1", champion_or_agent: "Ahri", kda: "8/2/11" },
};

function entry(appName: string, end = "2026-10-02T15:32:00.000Z"): ScreenTimeEntry {
  return {
    id: `${appName}-${end}`,
    startTimeUTC: "2026-10-02T15:00:00.000Z",
    endTimeUTC: end,
    title: appName,
    url: "",
    bundleID: appName,
    appName,
    category: "Gaming",
    platform: "macos",
    deviceName: "Mac",
    timeZoneIdentifier: "UTC",
    source: "local",
  };
}

describe("game match sync", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function syncWith(api: Partial<StopScrollingAPI> = {}, ready = true) {
    const dir = mkdtempSync(join(tmpdir(), "game-matches-"));
    dirs.push(dir);
    const riotMatches = api.riotMatches ? vi.fn(api.riotMatches) : vi.fn(async () => [] as GameMatchPayload[]);
    const steamPlaytime = api.steamPlaytime ? vi.fn(api.steamPlaytime) : vi.fn(async () => null);
    const postMatchesBulk = api.postMatchesBulk ? vi.fn(api.postMatchesBulk) : vi.fn(async () => ({ inserted: 1 }));
    const linkRiotAccount = api.linkRiotAccount
      ? vi.fn(api.linkRiotAccount)
      : vi.fn(async () => ({ puuid: "puuid-1", game_name: "Player", tag_line: "NA1" }));
    const client = {
      getTokens: () => (ready ? { access: "access", refresh: "refresh" } : null),
      linkRiotAccount,
      verifySteamOpenId: vi.fn(),
      riotMatches,
      steamPlaytime,
      postMatchesBulk,
    };
    const gameSync = new GameMatchSync(
      client as unknown as StopScrollingAPI,
      join(dir, "game-matches.json"),
      () => undefined,
      () => ready,
      120_000,
    );
    return { gameSync, client, riotMatches, steamPlaytime, postMatchesBulk };
  }

  it("uploads a League match two minutes after the game closes, once", async () => {
    vi.useFakeTimers();
    const { gameSync, postMatchesBulk, riotMatches } = syncWith({
      riotMatches: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([leagueMatch]),
    });
    await gameSync.linkRiot("Player#NA1");
    expect(postMatchesBulk).not.toHaveBeenCalled();

    gameSync.noteSession(entry("League of Legends.exe"));
    await vi.advanceTimersByTimeAsync(119_000);
    expect(riotMatches).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(postMatchesBulk).toHaveBeenCalledTimes(1);
    expect(postMatchesBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        platform: "riot",
        match_id: "NA1_1",
        player: { id: "puuid-1", champion_or_agent: "Ahri", kda: "8/2/11" },
      }),
    ]);

    await gameSync.catchUp();
    expect(postMatchesBulk).toHaveBeenCalledTimes(1);
    expect(riotMatches).toHaveBeenLastCalledWith("2026-10-02T15:32:00.000Z");
  });

  it("keeps a match queued when the upload fails", async () => {
    const { gameSync, postMatchesBulk } = syncWith({
      riotMatches: vi.fn(async () => [leagueMatch]),
      postMatchesBulk: vi.fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue({ inserted: 1 }),
    });
    await gameSync.linkRiot("Player#NA1");
    expect(gameSync.store.pending()).toHaveLength(1);
    await gameSync.flush();
    expect(gameSync.store.pending()).toHaveLength(0);
    expect(postMatchesBulk).toHaveBeenCalledTimes(2);
  });

  it("uploads a CS2 play session without a made-up result", async () => {
    const endedAt = "2026-10-02T16:00:00.000Z";
    const { gameSync, steamPlaytime, postMatchesBulk } = syncWith({
      steamPlaytime: vi.fn(async () => ({
        platform: "steam" as const,
        match_id: "",
        game: "Counter-Strike 2",
        started_at: "2026-10-02T15:10:00.000Z",
        ended_at: endedAt,
        duration_seconds: 3000,
      })),
    });
    await gameSync.linkRiot("Player#NA1");
    gameSync.store.setSteam({ steamId64: "76561198000000000", personaName: "ada" });
    gameSync.noteSession(entry("cs2.exe", endedAt));
    await gameSync.flush();
    expect(steamPlaytime).toHaveBeenCalledWith("730", endedAt);
    expect(postMatchesBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        platform: "steam",
        match_id: `steam:730:${endedAt}`,
        result: undefined,
        queue: undefined,
        map: undefined,
      }),
    ]);
  });

  it("does not fetch after Riot is disconnected", async () => {
    vi.useFakeTimers();
    const { gameSync, riotMatches } = syncWith({});
    await gameSync.linkRiot("Player#NA1");
    riotMatches.mockClear();
    await gameSync.disconnectRiot();
    gameSync.noteSession(entry("League of Legends.exe"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(riotMatches).not.toHaveBeenCalled();
    expect(gameSync.matches()).toEqual([]);
  });

  it("ignores an Unreal game process", async () => {
    const { gameSync, riotMatches, steamPlaytime } = syncWith({});
    await gameSync.linkRiot("Player#NA1");
    gameSync.store.setSteam({ steamId64: "76561198000000000" });
    riotMatches.mockClear();
    gameSync.noteSession(entry("FortniteClient-Win64-Shipping.exe"));
    await gameSync.flush();
    expect(steamPlaytime).not.toHaveBeenCalled();
    expect(riotMatches).not.toHaveBeenCalled();
  });
});

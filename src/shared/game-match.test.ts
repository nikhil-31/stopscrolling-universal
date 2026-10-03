import { describe, expect, it } from "vitest";
import { matchFromPayload, matchLine, matchToPayload, withMatchLines, withMatchSnapshot } from "./game-match";
import { knownGame, parseRiotId, steamOpenIdUrl, steamPlaySessionId } from "./game-platforms";
import type { GameMatch, ScreenTimeDeviceTimeline, ScreenTimeSnapshot, ScreenTimeTimelineSegment } from "./types";

const league: GameMatch = {
  platform: "riot",
  matchId: "NA1_1",
  game: "League of Legends",
  startedAt: "2026-10-02T15:00:00.000Z",
  endedAt: "2026-10-02T15:32:00.000Z",
  durationSeconds: 32 * 60,
  result: "win",
  queue: "Ranked Solo",
  map: "Summoner's Rift",
  player: { id: "puuid-1", champion: "Ahri", kda: "8/2/11" },
};

function segment(patch: Partial<ScreenTimeTimelineSegment> = {}): ScreenTimeTimelineSegment {
  return {
    id: "seg",
    start: "2026-10-02T15:01:00.000Z",
    end: "2026-10-02T15:30:00.000Z",
    label: "League of Legends",
    subtitle: "League of Legends",
    url: "",
    bundleID: "League of Legends",
    category: "Gaming",
    appName: "League of Legends",
    devicePlatform: "macos",
    deviceName: "Mac",
    timeZoneIdentifier: "UTC",
    isLive: false,
    ...patch,
  };
}

describe("game platforms", () => {
  it("recognizes League and CS2 and ignores Unreal titles", () => {
    expect(knownGame("League of Legends.exe")?.platform).toBe("riot");
    expect(knownGame("cs2.exe")?.steamAppId).toBe("730");
    expect(knownGame("FortniteClient-Win64-Shipping.exe")).toBeNull();
  });

  it("parses a Riot ID", () => {
    expect(parseRiotId(" Player#NA1 ")).toEqual({ gameName: "Player", tagLine: "NA1" });
    expect(parseRiotId("Player")).toBeNull();
    expect(parseRiotId("Player#NA 1")).toBeNull();
  });

  it("builds a Steam OpenID url for the loopback port", () => {
    const url = new URL(steamOpenIdUrl(43123));
    expect(url.origin).toBe("https://steamcommunity.com");
    expect(url.searchParams.get("openid.return_to")).toBe("http://127.0.0.1:43123/callback");
    expect(steamPlaySessionId("730", "2026-10-02T15:30:00.000Z")).toBe("steam:730:2026-10-02T15:30:00.000Z");
  });
});

describe("match lines", () => {
  it("joins queue, map, and result", () => {
    expect(matchLine(league)).toBe("Ranked Solo · Summoner's Rift · Win");
    expect(matchLine({ ...league, queue: undefined, map: undefined, result: undefined })).toBe("");
  });

  it("puts the match line on an overlapping Gaming block", () => {
    const seg = segment();
    const timeline: ScreenTimeDeviceTimeline = {
      id: "macos|Mac",
      deviceName: "Mac",
      devicePlatform: "macos",
      timeZoneIdentifier: "UTC",
      dayStart: "2026-10-02T00:00:00.000Z",
      dayEnd: "2026-10-03T00:00:00.000Z",
      segments: [seg],
      blocks: [{
        id: "block",
        start: seg.start,
        end: seg.end,
        title: seg.label,
        subtitle: seg.subtitle,
        category: "Gaming",
        devicePlatform: "macos",
        deviceName: "Mac",
        durationSeconds: 29 * 60,
        items: [{
          id: seg.id,
          title: seg.label,
          subtitle: seg.subtitle,
          url: "",
          category: "Gaming",
          appName: seg.appName,
          start: seg.start,
          end: seg.end,
          durationSeconds: 29 * 60,
        }],
      }],
    };
    const [next] = withMatchLines([timeline], [league]);
    expect(next.blocks[0].subtitle).toBe("Ranked Solo · Summoner's Rift · Win");
    expect(next.blocks[0].assetId).toBe("riot/Ahri");
    expect(next.segments[0].subtitle).toBe("Ranked Solo · Summoner's Rift · Win");
    expect(next.segments[0].assetId).toBe("riot/Ahri");
  });

  it("leaves a Steam play session subtitle unchanged when the match has no score", () => {
    const snapshot: ScreenTimeSnapshot = {
      totalSeconds: 1,
      sessionCount: 1,
      timelineSegments: [segment({ label: "cs2", subtitle: "cs2", appName: "cs2", bundleID: "cs2", category: "Gaming" })],
      listSegments: [],
      categories: [],
      apps: [],
      buckets: [],
      trackedSecondsByDay: {},
    };
    const steam: GameMatch = {
      platform: "steam",
      matchId: "steam:730:2026-10-02T15:30:00.000Z",
      game: "Counter-Strike 2",
      startedAt: "2026-10-02T15:00:00.000Z",
      endedAt: "2026-10-02T15:40:00.000Z",
      durationSeconds: 2400,
    };
    const next = withMatchSnapshot(snapshot, [steam]);
    expect(next.timelineSegments[0].subtitle).toBe("cs2");
    expect(next.timelineSegments[0].assetId).toBe("steam/730");
    expect(withMatchSnapshot({ ...snapshot, timelineSegments: [segment({ label: "Fortnite", subtitle: "Fortnite", appName: "Fortnite", bundleID: "Fortnite", category: "Gaming" })] }, []).timelineSegments[0].assetId).toBeUndefined();
  });

  it("round-trips the local player onto the upload payload", () => {
    const payload = matchToPayload(league);
    expect(payload.player).toEqual({ id: "puuid-1", champion_or_agent: "Ahri", kda: "8/2/11" });
    expect(matchFromPayload(payload)).toMatchObject({ matchId: "NA1_1", player: { champion: "Ahri" } });
    expect(matchFromPayload({ ...payload, match_id: "", platform: "steam" }, { steamAppId: "730", endedAt: payload.ended_at })?.matchId)
      .toBe(`steam:730:${payload.ended_at}`);
  });
});

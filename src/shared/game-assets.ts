import type { ScreenTimeAppBreakdown, ScreenTimeDeviceTimeline, ScreenTimeSnapshot } from "./types";
import { knownGame } from "./game-platforms";

/** Display names that do not match Data Dragon's file name. */
const CHAMPION_ALIASES: Record<string, string> = {
  wukong: "MonkeyKing",
  "renata glasc": "Renata",
  "nunu & willump": "Nunu",
  "nunu and willump": "Nunu",
  "cho'gath": "Chogath",
  "kai'sa": "Kaisa",
  "kha'zix": "Khazix",
  leblanc: "Leblanc",
  "vel'koz": "Velkoz",
  "bel'veth": "Belveth",
  "dr. mundo": "DrMundo",
  "dr mundo": "DrMundo",
  "jarvan iv": "JarvanIV",
  "lee sin": "LeeSin",
  "master yi": "MasterYi",
  "miss fortune": "MissFortune",
  "tahm kench": "TahmKench",
  "twisted fate": "TwistedFate",
  "xin zhao": "XinZhao",
  "aurelion sol": "AurelionSol",
  "rek'sai": "RekSai",
  "k'sante": "KSante",
  "kog'maw": "KogMaw",
};

const ASSET_ID = /^(steam\/\d{1,10}|riot\/[A-Za-z][A-Za-z0-9]{0,39})$/;

export function championKey(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const alias = CHAMPION_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(trimmed)) return trimmed;
  const words = trimmed.replace(/[.']/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  const key = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return /^[A-Za-z][A-Za-z0-9]*$/.test(key) ? key : null;
}

export function isGameAssetId(assetId: string) {
  return ASSET_ID.test(assetId);
}

export function gameAssetFileName(assetId: string) {
  if (!isGameAssetId(assetId)) return null;
  return `${assetId}.${assetId.startsWith("steam/") ? "jpg" : "png"}`;
}

/** Steam capsule, or a League champion square. Other games stay on the color swatch. */
export function activityAssetId(input: { appName: string; bundleID?: string; label?: string; champion?: string }): string | null {
  const champion = input.champion ? championKey(input.champion) : null;
  if (champion) return `riot/${champion}`;
  const game = knownGame(input.appName, input.bundleID ?? "", input.label ?? "");
  if (game?.steamAppId) return `steam/${game.steamAppId}`;
  return null;
}

export function steamCapsuleUrls(appId: string) {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ];
}

export function championImageUrl(version: string, key: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}

export function gameAssetUrl(assetId: string) {
  return `game-asset://cache/${assetId}`;
}

export function stampAppAsset(app: ScreenTimeAppBreakdown): ScreenTimeAppBreakdown {
  const assetId = activityAssetId({ appName: app.label, label: app.label }) ?? undefined;
  if (assetId === app.assetId) return app;
  return { ...app, assetId };
}

/** Drops asset ids whose files are not cached yet, and reports those ids so they can be downloaded. */
export function publishGameAssets(
  snapshot: ScreenTimeSnapshot,
  timelines: ScreenTimeDeviceTimeline[],
  ready: (assetId: string) => boolean,
  missing: (assetId: string) => void,
): { snapshot: ScreenTimeSnapshot; timelines: ScreenTimeDeviceTimeline[] } {
  const requested = new Set<string>();
  const want = (assetId: string) => {
    if (ready(assetId)) return true;
    if (!requested.has(assetId)) {
      requested.add(assetId);
      missing(assetId);
    }
    return false;
  };
  const reveal = <T extends { assetId?: string }>(row: T): T => {
    if (!row.assetId || want(row.assetId)) return row;
    const next = { ...row };
    delete next.assetId;
    return next;
  };
  const apps = snapshot.apps.map((app) => reveal(stampAppAsset(app)));
  const timelineSegments = snapshot.timelineSegments.map(reveal);
  const listSegments = snapshot.listSegments.map(reveal);
  const nextTimelines = timelines.map((timeline) => ({
    ...timeline,
    segments: timeline.segments.map(reveal),
    blocks: timeline.blocks.map((block) => {
      const items = block.items.map(reveal);
      const revealed = reveal(block);
      if (revealed === block && items.every((item, index) => item === block.items[index])) return block;
      return { ...revealed, items };
    }),
  }));
  const appsSame = apps.every((app, index) => app === snapshot.apps[index]);
  const segmentsSame = timelineSegments.every((segment, index) => segment === snapshot.timelineSegments[index]);
  const listSame = listSegments.every((segment, index) => segment === snapshot.listSegments[index]);
  const timelinesSame = nextTimelines.every((timeline, index) => (
    timeline.segments === timelines[index]?.segments && timeline.blocks === timelines[index]?.blocks
  ));
  return {
    snapshot: appsSame && segmentsSame && listSame
      ? snapshot
      : { ...snapshot, apps, timelineSegments, listSegments },
    timelines: timelinesSame ? timelines : nextTimelines,
  };
}

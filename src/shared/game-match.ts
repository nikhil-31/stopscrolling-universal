import type {
  GameMatch,
  GameMatchPayload,
  GameMatchResult,
  ScreenTimeAppBreakdown,
  ScreenTimeDeviceTimeline,
  ScreenTimeSessionBlock,
  ScreenTimeSnapshot,
  ScreenTimeTimelineSegment,
} from "./types";
import { activityAssetId } from "./game-assets";
import { knownGame, steamPlaySessionId, type KnownGame } from "./game-platforms";

const RESULTS = new Set<GameMatchResult>(["win", "loss", "draw", "unknown"]);

export function matchKey(match: Pick<GameMatch, "platform" | "matchId">) {
  return `${match.platform}:${match.matchId}`;
}

export function matchLine(match: GameMatch) {
  const result = match.result && match.result !== "unknown"
    ? match.result.charAt(0).toUpperCase() + match.result.slice(1)
    : "";
  return [match.queue, match.map, result].filter(Boolean).join(" · ");
}

export function matchToPayload(match: GameMatch): GameMatchPayload {
  return {
    platform: match.platform,
    match_id: match.matchId,
    game: match.game,
    started_at: match.startedAt,
    ended_at: match.endedAt,
    duration_seconds: match.durationSeconds,
    result: match.result,
    queue: match.queue,
    map: match.map,
    player: match.player
      ? { id: match.player.id, champion_or_agent: match.player.champion, kda: match.player.kda }
      : undefined,
  };
}

export function matchFromPayload(
  payload: GameMatchPayload,
  fallback?: { steamAppId?: string; endedAt?: string; game?: string },
): GameMatch | null {
  if (payload.platform !== "riot" && payload.platform !== "steam") return null;
  const endedAt = payload.ended_at || fallback?.endedAt || "";
  const startedAt = payload.started_at || "";
  if (!startedAt || !endedAt) return null;
  let matchId = payload.match_id?.trim() ?? "";
  if (!matchId && payload.platform === "steam" && fallback?.steamAppId) {
    matchId = steamPlaySessionId(fallback.steamAppId, endedAt);
  }
  if (!matchId) return null;
  const span = Date.parse(endedAt) - Date.parse(startedAt);
  const duration = Number.isFinite(payload.duration_seconds)
    ? Math.max(0, Math.round(payload.duration_seconds))
    : Number.isFinite(span)
      ? Math.max(0, Math.round(span / 1000))
      : 0;
  return {
    platform: payload.platform,
    matchId,
    game: payload.game || fallback?.game || "",
    startedAt,
    endedAt,
    durationSeconds: duration,
    result: RESULTS.has(payload.result as GameMatchResult) ? payload.result : undefined,
    queue: text(payload.queue),
    map: text(payload.map),
    player: payload.player?.id
      ? {
          id: payload.player.id,
          champion: text(payload.player.champion_or_agent),
          kda: text(payload.player.kda),
        }
      : undefined,
  };
}

function text(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

interface MatchTarget {
  start: string;
  end: string;
  appName: string;
  bundleID: string;
  category: string;
  label: string;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const a0 = Date.parse(startA);
  const a1 = Date.parse(endA);
  const b0 = Date.parse(startB);
  const b1 = Date.parse(endB);
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 < b1 && b0 < a1;
}

function sameGame(known: KnownGame, match: GameMatch) {
  if (known.platform !== match.platform) return false;
  if (known.game.toLowerCase() === match.game.toLowerCase()) return true;
  const normalized = match.game.trim().toLowerCase().replace(/\.exe$/, "");
  return known.names.some((name) => name.replace(/\.exe$/, "") === normalized);
}

function accepts(target: MatchTarget, match: GameMatch) {
  const known = knownGame(target.appName, target.bundleID, target.label);
  if (known) return sameGame(known, match);
  if (target.category !== "Gaming") return false;
  const name = `${target.appName} ${target.label}`.toLowerCase();
  return Boolean(match.game) && name.includes(match.game.toLowerCase());
}

function bestMatch(target: MatchTarget, matches: GameMatch[]): GameMatch | null {
  let best: GameMatch | null = null;
  let bestOverlap = 0;
  const startMs = Date.parse(target.start);
  const endMs = Date.parse(target.end);
  for (const match of matches) {
    if (!accepts(target, match) || !rangesOverlap(target.start, target.end, match.startedAt, match.endedAt)) continue;
    const overlap = Math.min(endMs, Date.parse(match.endedAt)) - Math.max(startMs, Date.parse(match.startedAt));
    if (overlap > bestOverlap) {
      best = match;
      bestOverlap = overlap;
    }
  }
  return best;
}

function applyActivity<T extends { subtitle: string; assetId?: string }>(
  row: T,
  target: MatchTarget,
  matches: GameMatch[],
  names: { appName: string; bundleID: string; label: string },
  subtitle: string,
): T {
  const assetId = activityAssetId({ ...names, champion: bestMatch(target, matches)?.player?.champion }) ?? undefined;
  if (subtitle === row.subtitle && assetId === row.assetId) return row;
  return { ...row, subtitle, assetId };
}

export function withMatchSegments<T extends ScreenTimeTimelineSegment>(segments: T[], matches: GameMatch[]): T[] {
  let changed = false;
  const next = segments.map((segment) => {
    const line = bestMatch(segment, matches);
    const subtitle = line ? matchLine(line) || segment.subtitle : segment.subtitle;
    const updated = applyActivity(segment, segment, matches, {
      appName: segment.appName,
      bundleID: segment.bundleID,
      label: segment.label,
    }, subtitle);
    if (updated !== segment) changed = true;
    return updated;
  });
  return changed ? next : segments;
}

function annotateBlock(block: ScreenTimeSessionBlock, matches: GameMatch[]): ScreenTimeSessionBlock {
  let itemsChanged = false;
  const items = block.items.map((item) => {
    const target: MatchTarget = {
      start: item.start,
      end: item.end,
      appName: item.appName,
      bundleID: "",
      category: item.category,
      label: item.title,
    };
    const line = bestMatch(target, matches);
    const subtitle = line && matchLine(line) ? matchLine(line) : item.subtitle;
    const updated = applyActivity(item, target, matches, {
      appName: item.appName,
      bundleID: "",
      label: item.title,
    }, subtitle);
    if (updated !== item) itemsChanged = true;
    return updated;
  });
  const target: MatchTarget = {
    start: block.start,
    end: block.end,
    appName: items[0]?.appName ?? "",
    bundleID: "",
    category: block.category,
    label: block.title,
  };
  const line = bestMatch(target, matches);
  const text = line ? matchLine(line) : "";
  const subtitle = text && (items.length === 1 || block.category === "Gaming") ? text : block.subtitle;
  const updated = applyActivity(block, target, matches, {
    appName: target.appName,
    bundleID: "",
    label: block.title,
  }, subtitle);
  if (!itemsChanged && updated === block) return block;
  return { ...updated, items };
}

export function withMatchLines(timelines: ScreenTimeDeviceTimeline[], matches: GameMatch[]): ScreenTimeDeviceTimeline[] {
  let changed = false;
  const next = timelines.map((timeline) => {
    const segments = withMatchSegments(timeline.segments, matches);
    const blocks = timeline.blocks.map((block) => annotateBlock(block, matches));
    const blocksChanged = blocks.some((block, index) => block !== timeline.blocks[index]);
    if (segments === timeline.segments && !blocksChanged) return timeline;
    changed = true;
    return { ...timeline, segments, blocks };
  });
  return changed ? next : timelines;
}

function stampApp(app: ScreenTimeAppBreakdown): ScreenTimeAppBreakdown {
  const assetId = activityAssetId({ appName: app.label, label: app.label }) ?? undefined;
  if (assetId === app.assetId) return app;
  return { ...app, assetId };
}

export function withMatchSnapshot(snapshot: ScreenTimeSnapshot, matches: GameMatch[]): ScreenTimeSnapshot {
  const timelineSegments = withMatchSegments(snapshot.timelineSegments, matches);
  const listSegments = withMatchSegments(snapshot.listSegments, matches);
  const apps = snapshot.apps.map(stampApp);
  const appsSame = apps.every((app, index) => app === snapshot.apps[index]);
  if (timelineSegments === snapshot.timelineSegments && listSegments === snapshot.listSegments && appsSame) return snapshot;
  return { ...snapshot, timelineSegments, listSegments, apps };
}

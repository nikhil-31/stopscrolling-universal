export interface KnownGame {
  platform: "riot" | "steam";
  game: string;
  steamAppId?: string;
  names: string[];
}

/** Processes whose close should pull a match. Epic and Unreal titles are intentionally absent. */
const KNOWN_GAMES: KnownGame[] = [
  {
    platform: "riot",
    game: "League of Legends",
    names: ["league of legends", "leagueclient", "com.riotgames.leagueoflegends"],
  },
  {
    platform: "steam",
    game: "Counter-Strike 2",
    steamAppId: "730",
    names: ["cs2", "counter-strike 2"],
  },
  {
    platform: "steam",
    game: "Dota 2",
    steamAppId: "570",
    names: ["dota2", "dota 2"],
  },
];

function normalizeProcessName(value: string) {
  return value.trim().toLowerCase().replace(/\.exe$/, "");
}

export function knownGame(appName: string, bundleID = "", title = ""): KnownGame | null {
  const candidates = new Set([appName, bundleID, title].map(normalizeProcessName).filter(Boolean));
  for (const game of KNOWN_GAMES) {
    if (game.names.some((name) => candidates.has(normalizeProcessName(name)))) return game;
  }
  return null;
}

export function parseRiotId(value: string): { gameName: string; tagLine: string } | null {
  const trimmed = value.trim();
  const hash = trimmed.lastIndexOf("#");
  if (hash <= 0 || hash === trimmed.length - 1) return null;
  const gameName = trimmed.slice(0, hash).trim();
  const tagLine = trimmed.slice(hash + 1).trim();
  if (!gameName || !tagLine || /\s/.test(tagLine)) return null;
  return { gameName, tagLine };
}

export function steamPlaySessionId(appId: string, endedAt: string) {
  return `steam:${appId}:${endedAt}`;
}

export function steamOpenIdUrl(port: number) {
  const realm = `http://127.0.0.1:${port}`;
  const auth = new URL("https://steamcommunity.com/openid/login");
  auth.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  auth.searchParams.set("openid.mode", "checkid_setup");
  auth.searchParams.set("openid.return_to", `${realm}/callback`);
  auth.searchParams.set("openid.realm", realm);
  auth.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select");
  auth.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");
  return auth.toString();
}

export function openIdParams(search: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of search) {
    if (key.startsWith("openid.")) params[key] = value;
  }
  return params;
}

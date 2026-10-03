import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { matchKey } from "@shared/game-match";
import type { GameAccountView, GameMatch } from "@shared/types";

const MATCH_CAP = 400;
const INTENT_CAP = 20;
const INTENT_ATTEMPT_CAP = 3;

export interface SteamPlayIntent {
  appId: string;
  game: string;
  endedAt: string;
  attempts: number;
}

interface StoredMatch extends GameMatch {
  uploaded: boolean;
}

interface LinkedRiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

interface LinkedSteamAccount {
  steamId64: string;
  personaName?: string;
}

interface GameMatchFile {
  riot?: LinkedRiotAccount;
  steam?: LinkedSteamAccount;
  riotSince?: string;
  matches: StoredMatch[];
  steamIntents: SteamPlayIntent[];
}

const EMPTY: GameMatchFile = { matches: [], steamIntents: [] };

export class GameMatchStore {
  revision = 0;
  private cached: GameMatchFile | null = null;

  constructor(private readonly filePath: string) {}

  accountView(): GameAccountView {
    const file = this.load();
    return {
      riot: file.riot ? { gameName: file.riot.gameName, tagLine: file.riot.tagLine } : null,
      steam: file.steam ? { steamId64: file.steam.steamId64, personaName: file.steam.personaName ?? "" } : null,
    };
  }

  riot() {
    return this.load().riot ?? null;
  }

  steam() {
    return this.load().steam ?? null;
  }

  setRiot(account: LinkedRiotAccount | null) {
    const file = this.load();
    if (account) file.riot = account;
    else {
      delete file.riot;
      delete file.riotSince;
    }
    this.write(file);
  }

  setSteam(account: LinkedSteamAccount | null) {
    const file = this.load();
    if (account) file.steam = account;
    else delete file.steam;
    this.write(file);
  }

  riotSince() {
    return this.load().riotSince;
  }

  setRiotSince(iso: string) {
    const file = this.load();
    if (file.riotSince === iso) return;
    file.riotSince = iso;
    this.write(file);
  }

  matches(): GameMatch[] {
    return this.load().matches;
  }

  pending(): GameMatch[] {
    return this.load().matches.filter((match) => !match.uploaded);
  }

  /** Returns true when a match was added or its display fields changed. */
  upsert(incoming: GameMatch[]) {
    if (!incoming.length) return false;
    const file = this.load();
    const byKey = new Map(file.matches.map((match) => [matchKey(match), match]));
    let changed = false;
    for (const match of incoming) {
      const key = matchKey(match);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...match, uploaded: false });
        changed = true;
        continue;
      }
      const next = { ...existing, ...match, uploaded: existing.uploaded };
      if (JSON.stringify(existing) !== JSON.stringify(next)) {
        byKey.set(key, next);
        changed = true;
      }
    }
    if (!changed) return false;
    let matches = [...byKey.values()].sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));
    if (matches.length > MATCH_CAP) {
      const pending = matches.filter((match) => !match.uploaded);
      const room = Math.max(0, MATCH_CAP - pending.length);
      const uploaded = matches.filter((match) => match.uploaded).slice(-room);
      matches = [...uploaded, ...pending].sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));
    }
    file.matches = matches;
    this.revision += 1;
    this.write(file);
    return true;
  }

  markUploaded(keys: Set<string>) {
    if (!keys.size) return;
    const file = this.load();
    let changed = false;
    for (const match of file.matches) {
      if (!match.uploaded && keys.has(matchKey(match))) {
        match.uploaded = true;
        changed = true;
      }
    }
    if (changed) this.write(file);
  }

  steamIntents() {
    return this.load().steamIntents;
  }

  addSteamIntent(intent: SteamPlayIntent) {
    const file = this.load();
    const key = `${intent.appId}:${intent.endedAt}`;
    if (file.steamIntents.some((item) => `${item.appId}:${item.endedAt}` === key)) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const intents = file.steamIntents.filter((item) => Date.parse(item.endedAt) >= cutoff);
    intents.push(intent);
    file.steamIntents = intents.slice(-INTENT_CAP);
    this.write(file);
  }

  /** Drops the intent after repeated empty answers from Steam. */
  missSteamIntent(intent: SteamPlayIntent) {
    const file = this.load();
    const attempts = intent.attempts + 1;
    file.steamIntents = attempts >= INTENT_ATTEMPT_CAP
      ? file.steamIntents.filter((item) => item !== intent && `${item.appId}:${item.endedAt}` !== `${intent.appId}:${intent.endedAt}`)
      : file.steamIntents.map((item) => (
          `${item.appId}:${item.endedAt}` === `${intent.appId}:${intent.endedAt}` ? { ...item, attempts } : item
        ));
    this.write(file);
  }

  removeSteamIntent(intent: SteamPlayIntent) {
    const file = this.load();
    const next = file.steamIntents.filter((item) => `${item.appId}:${item.endedAt}` !== `${intent.appId}:${intent.endedAt}`);
    if (next.length === file.steamIntents.length) return;
    file.steamIntents = next;
    this.write(file);
  }

  private load(): GameMatchFile {
    if (this.cached) return this.cached;
    try {
      if (!existsSync(this.filePath)) {
        this.cached = { ...EMPTY, matches: [], steamIntents: [] };
        return this.cached;
      }
      this.cached = sanitize(JSON.parse(readFileSync(this.filePath, "utf8")));
      return this.cached;
    } catch {
      this.cached = { ...EMPTY, matches: [], steamIntents: [] };
      return this.cached;
    }
  }

  private write(file: GameMatchFile) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(file), "utf8");
    this.cached = file;
  }
}

function sanitize(raw: unknown): GameMatchFile {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    riot: isRiot(record.riot) ? record.riot : undefined,
    steam: isSteam(record.steam) ? record.steam : undefined,
    riotSince: typeof record.riotSince === "string" ? record.riotSince : undefined,
    matches: Array.isArray(record.matches) ? record.matches.filter(isStoredMatch) : [],
    steamIntents: Array.isArray(record.steamIntents) ? record.steamIntents.filter(isIntent) : [],
  };
}

function isRiot(value: unknown): value is LinkedRiotAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as LinkedRiotAccount;
  return Boolean(account.puuid && account.gameName && account.tagLine);
}

function isSteam(value: unknown): value is LinkedSteamAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as LinkedSteamAccount;
  return Boolean(account.steamId64);
}

function isStoredMatch(value: unknown): value is StoredMatch {
  if (!value || typeof value !== "object") return false;
  const match = value as StoredMatch;
  return (match.platform === "riot" || match.platform === "steam")
    && typeof match.matchId === "string"
    && typeof match.startedAt === "string"
    && typeof match.endedAt === "string";
}

function isIntent(value: unknown): value is SteamPlayIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as SteamPlayIntent;
  return Boolean(intent.appId && intent.game && intent.endedAt) && Number.isFinite(intent.attempts);
}

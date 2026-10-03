import { createServer } from "node:http";
import { shell } from "electron";
import { activityAssetId } from "@shared/game-assets";
import { matchFromPayload, matchKey, matchToPayload } from "@shared/game-match";
import { knownGame, openIdParams, parseRiotId, steamOpenIdUrl } from "@shared/game-platforms";
import type { GameMatch, GameMatchPayload, ScreenTimeEntry } from "@shared/types";
import type { StopScrollingAPI } from "./api-client";
import { GameMatchStore, type SteamPlayIntent } from "./game-match-store";
import { logObservability } from "./logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const RIOT_DELAY_MS = 2 * 60 * 1000;
const CATCH_UP_MS = 15 * 60 * 1000;
const STEAM_SIGN_IN_MS = 3 * 60 * 1000;
const BATCH = 200;

export class GameMatchSync {
  readonly store: GameMatchStore;
  status = "Link a Riot ID or Steam account to upload matches.";
  prefetchAsset: (assetId: string) => void = () => undefined;
  private tail: Promise<void> = Promise.resolve();
  private riotTimer: NodeJS.Timeout | null = null;
  private catchUpTimer: NodeJS.Timeout | null = null;
  private steamConnect: Promise<void> | null = null;

  constructor(
    private readonly api: StopScrollingAPI,
    filePath: string,
    private readonly onChange: () => void,
    private readonly syncReady: () => boolean,
    private readonly riotDelayMs = RIOT_DELAY_MS,
    private readonly catchUpMs = CATCH_UP_MS,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.store = new GameMatchStore(filePath);
    const linked = this.store.accountView();
    const parts = [
      linked.riot ? `${linked.riot.gameName}#${linked.riot.tagLine}` : "",
      linked.steam ? (linked.steam.personaName || linked.steam.steamId64) : "",
    ].filter(Boolean);
    if (parts.length) this.status = `Linked ${parts.join(" and ")}`;
  }

  get matchRevision() {
    return this.store.revision;
  }

  accountView() {
    return this.store.accountView();
  }

  matches() {
    return this.store.matches();
  }

  start() {
    if (this.catchUpTimer) return;
    void this.catchUp();
    this.catchUpTimer = setInterval(() => {
      void this.catchUp();
    }, this.catchUpMs);
    this.catchUpTimer.unref?.();
  }

  stop() {
    if (this.catchUpTimer) clearInterval(this.catchUpTimer);
    this.catchUpTimer = null;
    if (this.riotTimer) clearTimeout(this.riotTimer);
    this.riotTimer = null;
  }

  noteSession(entry: ScreenTimeEntry) {
    const game = knownGame(entry.appName, entry.bundleID, entry.title);
    if (!game) return;
    if (game.platform === "riot") {
      if (!this.store.riot()) return;
      this.scheduleRiot();
      return;
    }
    if (!game.steamAppId) return;
    this.prefetchAsset(`steam/${game.steamAppId}`);
    this.store.addSteamIntent({
      appId: game.steamAppId,
      game: game.game,
      endedAt: entry.endTimeUTC,
      attempts: 0,
    });
    if (this.store.steam()) void this.enqueue(() => this.ingestSteam());
  }

  catchUp() {
    return this.enqueue(() => this.ingestAll());
  }

  flush() {
    return this.enqueue(() => this.flushOnce());
  }

  linkRiot(riotId: string) {
    return this.enqueue(() => this.linkRiotOnce(riotId));
  }

  disconnectRiot() {
    return this.enqueue(async () => {
      if (this.riotTimer) clearTimeout(this.riotTimer);
      this.riotTimer = null;
      this.store.setRiot(null);
      this.status = "Riot disconnected.";
      this.onChange();
    });
  }

  connectSteam() {
    if (this.steamConnect) return this.steamConnect;
    this.steamConnect = this.connectSteamOnce().finally(() => {
      this.steamConnect = null;
    });
    return this.steamConnect;
  }

  disconnectSteam() {
    return this.enqueue(async () => {
      this.store.setSteam(null);
      this.status = "Steam disconnected.";
      this.onChange();
    });
  }

  private scheduleRiot() {
    if (this.riotTimer) clearTimeout(this.riotTimer);
    this.riotTimer = setTimeout(() => {
      this.riotTimer = null;
      void this.enqueue(() => this.ingestRiot());
    }, this.riotDelayMs);
    this.riotTimer.unref?.();
  }

  private enqueue(task: () => Promise<void>) {
    const run = this.tail.then(task, task);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async linkRiotOnce(riotId: string) {
    const parsed = parseRiotId(riotId);
    if (!parsed) {
      this.status = "Enter your Riot ID as Name#TAG.";
      this.onChange();
      return;
    }
    if (!this.api.getTokens()) {
      this.status = "Sign in to link a game account.";
      this.onChange();
      return;
    }
    try {
      const linked = await this.api.linkRiotAccount(parsed.gameName, parsed.tagLine);
      this.store.setRiot({
        puuid: linked.puuid,
        gameName: linked.game_name || parsed.gameName,
        tagLine: linked.tag_line || parsed.tagLine,
      });
      this.status = `Linked ${this.store.riot()?.gameName}#${this.store.riot()?.tagLine}`;
      this.onChange();
      await this.ingestAll();
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Could not link Riot.";
      this.onChange();
    }
  }

  private async connectSteamOnce() {
    if (!this.api.getTokens()) {
      this.status = "Sign in to link a game account.";
      this.onChange();
      return;
    }
    this.status = "Waiting for Steam sign-in…";
    this.onChange();
    try {
      const params = await listenForSteam((port) => {
        void shell.openExternal(steamOpenIdUrl(port));
      });
      const linked = await this.api.verifySteamOpenId(params);
      if (!linked.steam_id64) throw new Error("Steam did not return an account id.");
      await this.enqueue(async () => {
        this.store.setSteam({ steamId64: linked.steam_id64, personaName: linked.persona_name });
        this.status = `Linked ${linked.persona_name || linked.steam_id64}`;
        this.onChange();
        await this.ingestAll();
      });
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Could not link Steam.";
      this.onChange();
    }
  }

  private prefetchMatch(match: GameMatch) {
    const assetId = activityAssetId({
      appName: match.game,
      label: match.game,
      champion: match.player?.champion,
    });
    if (assetId) this.prefetchAsset(assetId);
  }

  private async ingestAll() {
    const riotChanged = await this.fetchRiotOnce();
    const steamChanged = await this.fetchSteamOnce();
    await this.flushOnce();
    if (riotChanged || steamChanged) this.onChange();
  }

  private async ingestRiot() {
    if (await this.fetchRiotOnce()) this.onChange();
    await this.flushOnce();
  }

  private async ingestSteam() {
    if (await this.fetchSteamOnce()) this.onChange();
    await this.flushOnce();
  }

  private async fetchRiotOnce() {
    const account = this.store.riot();
    if (!account || !this.api.getTokens()) return false;
    const since = this.store.riotSince() ?? new Date(this.now() - DAY_MS).toISOString();
    try {
      const payloads = await this.api.riotMatches(since);
      const matches = payloads
        .map((payload) => matchFromPayload(payload))
        .filter((match): match is GameMatch => Boolean(match));
      const changed = this.store.upsert(matches);
      for (const match of matches) this.prefetchMatch(match);
      const latest = matches.reduce((max, match) => (match.endedAt > max ? match.endedAt : max), "");
      if (latest) this.store.setRiotSince(latest);
      return changed;
    } catch (error) {
      logObservability(`Riot match fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async fetchSteamOnce() {
    if (!this.store.steam() || !this.api.getTokens()) return false;
    let changed = false;
    for (const intent of [...this.store.steamIntents()]) {
      try {
        const payload = await this.api.steamPlaytime(intent.appId, intent.endedAt);
        if (!payload) {
          this.store.missSteamIntent(intent);
          continue;
        }
        const match = normalizeSteam(payload, intent);
        if (match) {
          this.prefetchMatch(match);
          if (this.store.upsert([match])) changed = true;
        }
        this.store.removeSteamIntent(intent);
      } catch (error) {
        logObservability(`Steam playtime fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return changed;
  }

  private async flushOnce() {
    if (!this.syncReady()) return;
    const pending = this.store.pending();
    if (!pending.length) return;
    const uploaded = new Set<string>();
    try {
      for (let index = 0; index < pending.length; index += BATCH) {
        const batch = pending.slice(index, index + BATCH);
        await this.api.postMatchesBulk(batch.map(matchToPayload));
        for (const match of batch) uploaded.add(matchKey(match));
      }
      this.store.markUploaded(uploaded);
    } catch (error) {
      logObservability(`Match upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function normalizeSteam(payload: GameMatchPayload, intent: SteamPlayIntent) {
  return matchFromPayload(
    { ...payload, platform: "steam" },
    { steamAppId: intent.appId, endedAt: intent.endedAt, game: intent.game },
  );
}

function listenForSteam(portReady: (port: number) => void) {
  return new Promise<Record<string, string>>((resolve, reject) => {
    let timeout: NodeJS.Timeout;
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const params = openIdParams(url.searchParams);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body style='font-family:sans-serif;padding:32px'>You can close this window.</body></html>");
        clearTimeout(timeout);
        server.close();
        if (params["openid.mode"] === "cancel" || params["openid.mode"] === "error" || !params["openid.claimed_id"]) {
          reject(new Error("Steam sign-in was cancelled."));
          return;
        }
        resolve(params);
      } catch (error) {
        clearTimeout(timeout);
        server.close();
        reject(error instanceof Error ? error : new Error("Steam sign-in failed."));
      }
    });
    timeout = setTimeout(() => {
      server.close();
      reject(new Error("Steam sign-in timed out."));
    }, STEAM_SIGN_IN_MS);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timeout);
        reject(new Error("Could not bind the Steam sign-in port."));
        return;
      }
      portReady(address.port);
    });
    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import {
  championImageUrl,
  gameAssetFileName,
  isGameAssetId,
  steamCapsuleUrls,
} from "@shared/game-assets";

const DAY_MS = 24 * 60 * 60 * 1000;

export class GameAssetCache {
  revision = 0;
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();

  constructor(
    private readonly root: string,
    private readonly onReady: () => void,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  has(assetId: string) {
    const file = this.filePath(assetId);
    return Boolean(file && existsSync(file));
  }

  filePath(assetId: string) {
    const name = gameAssetFileName(assetId);
    if (!name) return null;
    const full = resolve(this.root, name);
    const root = resolve(this.root);
    if (full !== root && !full.startsWith(root + sep)) return null;
    return full;
  }

  ensure(assetId: string) {
    if (!isGameAssetId(assetId) || this.has(assetId) || this.failed.has(assetId)) return Promise.resolve();
    const existing = this.pending.get(assetId);
    if (existing) return existing;
    const task = this.download(assetId).then((saved) => {
      this.pending.delete(assetId);
      if (saved) {
        this.revision += 1;
        this.onReady();
        return;
      }
      this.failed.add(assetId);
    }).catch(() => {
      this.pending.delete(assetId);
    });
    this.pending.set(assetId, task);
    return task;
  }

  private async download(assetId: string) {
    const destination = this.filePath(assetId);
    if (!destination) return false;
    if (assetId.startsWith("steam/")) {
      const appId = assetId.slice("steam/".length);
      for (const url of steamCapsuleUrls(appId)) {
        if (await this.save(url, destination)) return true;
      }
      return false;
    }
    const version = await this.ddragonVersion();
    return this.save(championImageUrl(version, assetId.slice("riot/".length)), destination);
  }

  private async ddragonVersion() {
    const file = join(this.root, "ddragon-version.json");
    try {
      const stored = JSON.parse(readFileSync(file, "utf8")) as { version?: string; at?: number };
      if (stored.version && typeof stored.at === "number" && this.now() - stored.at < DAY_MS) return stored.version;
    } catch {
      // Fetch a fresh version below.
    }
    const response = await this.fetchImpl("https://ddragon.leagueoflegends.com/api/versions.json");
    if (!response.ok) throw new Error("Data Dragon version list failed.");
    const versions = await response.json() as unknown;
    const version = Array.isArray(versions) && typeof versions[0] === "string" ? versions[0] : "";
    if (!version) throw new Error("Data Dragon version list was empty.");
    mkdirSync(this.root, { recursive: true });
    writeFileSync(file, JSON.stringify({ version, at: this.now() }));
    return version;
  }

  private async save(url: string, destination: string) {
    const response = await this.fetchImpl(url);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return false;
    mkdirSync(dirname(destination), { recursive: true });
    const partial = `${destination}.partial`;
    writeFileSync(partial, bytes);
    renameSync(partial, destination);
    return true;
  }
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameAssetCache } from "./game-asset-cache";

function imageResponse() {
  return new Response(Uint8Array.from([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

describe("game asset cache", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("downloads a steam capsule once and ignores unsafe ids", async () => {
    const root = mkdtempSync(join(tmpdir(), "game-assets-"));
    dirs.push(root);
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return imageResponse();
    });
    let ready = 0;
    const cache = new GameAssetCache(root, () => {
      ready += 1;
    }, fetch);
    expect(cache.has("steam/730")).toBe(false);
    await cache.ensure("steam/730");
    expect(cache.has("steam/730")).toBe(true);
    expect(ready).toBe(1);
    await cache.ensure("steam/730");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/steam/apps/730/library_600x900.jpg");
    await cache.ensure("../passwd");
    expect(urls).toHaveLength(1);
  });

  it("downloads a champion square after reading the Data Dragon version", async () => {
    const root = mkdtempSync(join(tmpdir(), "game-assets-"));
    dirs.push(root);
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes("versions.json")) {
        return new Response(JSON.stringify(["15.1.1"]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(Uint8Array.from([4]), { status: 200, headers: { "content-type": "image/png" } });
    });
    const cache = new GameAssetCache(root, () => undefined, fetch);
    await cache.ensure("riot/Ahri");
    expect(cache.has("riot/Ahri")).toBe(true);
    expect(urls[1]).toBe("https://ddragon.leagueoflegends.com/cdn/15.1.1/img/champion/Ahri.png");
  });
});

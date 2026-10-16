import { readFile } from "node:fs/promises";
import { protocol } from "electron";
import type { GameAssetCache } from "./game-asset-cache";

const rendererScheme = {
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
} as const;

export function registerGameAssetScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: "game-asset", ...rendererScheme },
    { scheme: "app-icon", ...rendererScheme },
  ]);
}

export function installGameAssetProtocol(cache: GameAssetCache) {
  protocol.handle("game-asset", async (request) => {
    const assetId = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ""));
    const file = cache.filePath(assetId);
    if (!file || !cache.has(assetId)) return new Response(null, { status: 404 });
    const body = await readFile(file);
    const type = assetId.startsWith("steam/") ? "image/jpeg" : "image/png";
    return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "no-cache" } });
  });
}

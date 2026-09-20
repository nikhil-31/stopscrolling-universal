import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { JevCategoryCache } from "@shared/jev";

export function loadJevCategoryCache(path: string): JevCategoryCache {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as JevCategoryCache;
  } catch {
    return {};
  }
}

export function saveJevCategoryCache(path: string, cache: JevCategoryCache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache), "utf8");
}

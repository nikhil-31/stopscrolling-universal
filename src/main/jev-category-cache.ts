import { existsSync, readFileSync } from "node:fs";
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

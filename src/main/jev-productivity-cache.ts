import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ProductivityCache } from "@shared/jev-productivity";

export function loadProductivityCache(path: string): ProductivityCache {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ProductivityCache;
  } catch {
    return {};
  }
}

export function saveProductivityCache(path: string, cache: ProductivityCache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache), "utf8");
}

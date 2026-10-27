import { existsSync, readFileSync } from "node:fs";
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

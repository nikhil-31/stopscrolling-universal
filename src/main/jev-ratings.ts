import { existsSync, unlinkSync } from "node:fs";
import type { JevCategoryCacheEntry } from "@shared/jev";
import type { ProductivityCacheEntry } from "@shared/jev-productivity";
import { loadJevCategoryCache } from "./jev-category-cache";
import { loadProductivityCache } from "./jev-productivity-cache";
import { logObservability } from "./logger";
import { jevCategoriesPath, jevProductivityPath } from "./paths";
import { clearTypesafeApiKey } from "./typesafe-key-store";

export type JevRatingKind = "productivity" | "category";

/** One rating as the server stores it (`/api/jev/ratings/`). */
export interface JevServerRating {
  key: string;
  breakdown_key: string;
  status: "pending" | "processing" | "ready" | "failed";
  value: string;
  confidence: number | null;
  model: string;
  source: "jev" | "user";
  rated_at: string | null;
}

export interface JevRatingsResponse {
  enabled: boolean;
  server_time: string;
  productivity: JevServerRating[];
  categories: JevServerRating[];
}

export interface JevRatingRequestItem {
  key: string;
  breakdown_key: string;
  app_name: string;
  bundle_id: string;
  host: string;
  title: string;
  category: string;
}

/** The part of the API client the rating agents use. */
export interface JevRatingsApi {
  requestJevRatings(
    kind: JevRatingKind,
    priority: "live" | "background",
    items: JevRatingRequestItem[],
  ): Promise<{ enabled: boolean; ratings: JevServerRating[] }>;
  overrideJevVerdict(key: string, breakdownKey: string, verdict: string): Promise<JevServerRating>;
}

export function toProductivityEntry(row: JevServerRating): ProductivityCacheEntry | null {
  if (row.status !== "ready" || !row.value || row.confidence === null) return null;
  return {
    verdict: row.value,
    confidence: row.confidence,
    model: row.model,
    at: row.rated_at ?? new Date().toISOString(),
    source: row.source,
  };
}

export function toCategoryEntry(row: JevServerRating): JevCategoryCacheEntry | null {
  if (row.status !== "ready" || !row.value || row.confidence === null) return null;
  return {
    category: row.value,
    confidence: row.confidence,
    model: row.model,
    at: row.rated_at ?? new Date().toISOString(),
  };
}

interface RatingSink<Entry> {
  hydrate(entries: Record<string, Entry>): void;
  clear(): void;
}

/**
 * Keeps both in-memory rating caches in step with the server. The first pull loads
 * everything; later pulls only fetch what changed since the previous server time.
 */
export class JevRatingsSync {
  enabled = false;
  private since: string | null = null;
  private pulling: Promise<void> | null = null;

  constructor(
    private readonly api: { jevRatings(since?: string | null): Promise<JevRatingsResponse> },
    private readonly productivity: RatingSink<ProductivityCacheEntry>,
    private readonly categories: RatingSink<JevCategoryCacheEntry>,
  ) {}

  pull(): Promise<void> {
    this.pulling ??= this.fetch().finally(() => {
      this.pulling = null;
    });
    return this.pulling;
  }

  private async fetch() {
    try {
      const body = await this.api.jevRatings(this.since);
      this.enabled = body.enabled;
      this.since = body.server_time;
      this.productivity.hydrate(entriesFrom(body.productivity, toProductivityEntry));
      this.categories.hydrate(entriesFrom(body.categories, toCategoryEntry));
    } catch (error) {
      logObservability(`Jev ratings pull failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Signed out: forget every rating so nothing from the last account is shown or acted on. */
  reset() {
    this.enabled = false;
    this.since = null;
    this.productivity.clear();
    this.categories.clear();
  }
}

function entriesFrom<Entry>(rows: JevServerRating[], convert: (row: JevServerRating) => Entry | null) {
  const entries: Record<string, Entry> = {};
  for (const row of rows) {
    const entry = convert(row);
    if (entry) entries[row.key] = entry;
  }
  return entries;
}

/** Ratings per import request; the server accepts up to 5000, and smaller requests stay well under body limits. */
const IMPORT_BATCH_SIZE = 1000;

function* importBatches(productivity: Record<string, unknown>, categories: Record<string, unknown>) {
  const entries: Array<["productivity" | "categories", string, unknown]> = [
    ...Object.entries(productivity).map(([key, value]) => ["productivity", key, value] as ["productivity", string, unknown]),
    ...Object.entries(categories).map(([key, value]) => ["categories", key, value] as ["categories", string, unknown]),
  ];
  for (let start = 0; start < entries.length; start += IMPORT_BATCH_SIZE) {
    const batch = { productivity: {} as Record<string, unknown>, categories: {} as Record<string, unknown> };
    for (const [kind, key, value] of entries.slice(start, start + IMPORT_BATCH_SIZE)) batch[kind][key] = value;
    yield batch;
  }
}

/**
 * Ratings used to be kept in JSON files, and Jev was called with a key the user pasted
 * into Settings. Upload any saved ratings once, then remove the files and the key.
 * Returns true when nothing is left to migrate.
 */
export async function migrateLocalJevRatings(
  api: { importJevRatings(payload: { productivity: Record<string, unknown>; categories: Record<string, unknown> }): Promise<unknown> },
  paths = { productivity: jevProductivityPath(), categories: jevCategoriesPath() },
): Promise<boolean> {
  const present = [paths.productivity, paths.categories].filter((path) => existsSync(path));
  if (present.length) {
    const productivity = loadProductivityCache(paths.productivity);
    const categories = loadJevCategoryCache(paths.categories);
    if (Object.keys(productivity).length || Object.keys(categories).length) {
      try {
        for (const batch of importBatches(productivity, categories)) await api.importJevRatings(batch);
      } catch (error) {
        logObservability(`Jev ratings import failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }
    for (const path of present) {
      try {
        unlinkSync(path);
      } catch {
        // A file that cannot be removed is uploaded again next time; the server keeps the newest.
      }
    }
    logObservability("Moved saved Jev ratings to the server");
  }
  clearTypesafeApiKey();
  return true;
}

import { websiteHostname } from "@shared/browser";
import { acceptedJevCategory, type JevCategoryCache, type JevCategoryCacheEntry } from "@shared/jev";
import { toCategoryEntry, type JevRatingsApi } from "./jev-ratings";
import { logObservability } from "./logger";

/** A key the server is still classifying is not sent again for this long. */
const DEFAULT_RESEND_MS = 5 * 60 * 1000;

export interface JevClassifyInput {
  key: string;
  appName: string;
  bundleID: string;
  url: string;
}

export interface JevClassifierOptions {
  api: JevRatingsApi;
  /** Signed in with sync on. Nothing is requested otherwise. */
  enabled: () => boolean;
  now?: () => Date;
  resendMs?: number;
  onResolved?: (key: string, entry: JevCategoryCacheEntry) => void;
}

/**
 * Categories for apps and sites the built-in rules do not know. The server asks Jev
 * and stores the answer; this keeps the signed-in user's categories in memory only.
 */
export class JevClassifier {
  cache: JevCategoryCache = {};
  onResolved?: (key: string, entry: JevCategoryCacheEntry) => void;
  private readonly requested = new Map<string, number>();

  constructor(private readonly options: JevClassifierOptions) {
    this.onResolved = options.onResolved;
  }

  lookup(key: string): JevCategoryCacheEntry | undefined {
    return this.cache[key];
  }

  enqueue(input: JevClassifyInput): void {
    if (!input.key || this.cache[input.key] || !this.options.enabled()) return;
    const now = this.timestamp();
    const sentAt = this.requested.get(input.key);
    if (sentAt !== undefined && now - sentAt < (this.options.resendMs ?? DEFAULT_RESEND_MS)) return;
    this.requested.set(input.key, now);
    void this.classify(input);
  }

  /** Merges categories read from the server. */
  hydrate(entries: Record<string, JevCategoryCacheEntry>): void {
    const keys = Object.keys(entries);
    if (!keys.length) return;
    this.cache = { ...this.cache, ...entries };
    for (const key of keys) this.notify(key, entries[key]);
  }

  clear(): void {
    this.cache = {};
    this.requested.clear();
  }

  private async classify(input: JevClassifyInput): Promise<void> {
    try {
      const response = await this.options.api.requestJevRatings("category", "live", [
        {
          key: input.key,
          breakdown_key: input.key,
          app_name: input.appName,
          bundle_id: input.bundleID,
          host: websiteHostname(input.url),
          title: "",
          category: "",
        },
      ]);
      for (const row of response.ratings) {
        const entry = toCategoryEntry(row);
        if (!entry) continue;
        this.cache = { ...this.cache, [row.key]: entry };
        this.notify(row.key, entry);
      }
    } catch (error) {
      this.requested.delete(input.key);
      logObservability(`Jev category request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private notify(key: string, entry: JevCategoryCacheEntry) {
    if (acceptedJevCategory(entry.category, entry.confidence)) this.onResolved?.(key, entry);
  }

  private timestamp() {
    return (this.options.now?.() ?? new Date()).getTime();
  }
}

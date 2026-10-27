import { websiteHostname } from "@shared/browser";
import {
  verdictForTitle,
  type ProductivityCache,
  type ProductivityCacheEntry,
  type ProductivityVerdict,
} from "@shared/jev-productivity";
import { toProductivityEntry, type JevRatingsApi, type JevServerRating } from "./jev-ratings";
import { logObservability } from "./logger";

/** A key the server is still rating is not sent again for this long. */
const DEFAULT_RESEND_MS = 5 * 60 * 1000;
const BATCH_SIZE = 200;
const REVIEW_POLL_MS = 3_000;
const REVIEW_TIMEOUT_MS = 3 * 60 * 1000;

export interface ProductivityInput {
  key: string;
  breakdownKey: string;
  appName: string;
  bundleID: string;
  url: string;
  title: string;
  category: string;
  /** When false the window title is left out of the request. */
  sendTitle?: boolean;
}

export interface JevProductivityAgentOptions {
  api: JevRatingsApi;
  /** Signed in with sync on. Nothing is requested otherwise. */
  enabled: () => boolean;
  /** Pulls ratings the server finished in the background (see JevRatingsSync). */
  refresh?: () => Promise<void>;
  now?: () => Date;
  resendMs?: number;
  wait?: (ms: number) => Promise<void>;
  onResolved?: (key: string, entry: ProductivityCacheEntry) => void;
}

/**
 * Productivity verdicts for titles. The server asks Jev and stores every answer;
 * this keeps the signed-in user's verdicts in memory only.
 */
export class JevProductivityAgent {
  cache: ProductivityCache = {};
  onResolved?: (key: string, entry: ProductivityCacheEntry) => void;
  reviewing = false;
  progress = { done: 0, total: 0 };

  /** Keys sent to the server and when, so period rebuilds do not resend them. */
  private readonly requested = new Map<string, number>();
  private readonly queue: ProductivityInput[] = [];
  private sending: Promise<void> | null = null;

  constructor(private readonly options: JevProductivityAgentOptions) {
    this.onResolved = options.onResolved;
  }

  lookup(key: string): ProductivityCacheEntry | undefined {
    return this.cache[key];
  }

  /** Verdict for a title, falling back to the most common confident verdict for the same app or site. */
  verdictFor(breakdownKey: string, titleKey: string): ProductivityCacheEntry | undefined {
    return verdictForTitle(this.cache, breakdownKey, titleKey);
  }

  enqueue(input: ProductivityInput): void {
    if (!this.accept(input)) return;
    this.queue.push(input);
    this.drain();
  }

  /** The app in front is rated by the server before it answers. */
  enqueueLive(input: ProductivityInput): void {
    if (!this.accept(input)) return;
    this.requested.set(input.key, this.timestamp());
    void this.send("live", [input]);
  }

  /** Rates titles from the open Today or Insights period; the server owns the daily cap. */
  enqueueBackground(inputs: ProductivityInput[]): void {
    for (const input of inputs) {
      if (this.accept(input)) this.queue.push(input);
    }
    this.drain();
  }

  async reviewAll(inputs: ProductivityInput[]): Promise<void> {
    const keys = [...new Set(inputs.map((input) => input.key).filter(Boolean))];
    this.reviewing = true;
    this.progress = { done: 0, total: keys.length };
    try {
      for (const input of inputs) {
        if (this.accept(input, true)) this.queue.push(input);
      }
      this.drain();
      while (this.sending) await this.sending;
      const deadline = this.timestamp() + REVIEW_TIMEOUT_MS;
      const wait = this.options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      while (this.countRated(keys) < keys.length && this.timestamp() < deadline && this.options.refresh) {
        await wait(REVIEW_POLL_MS);
        await this.options.refresh();
        this.progress = { done: this.countRated(keys), total: keys.length };
      }
    } finally {
      this.progress = { done: this.countRated(keys), total: keys.length };
      this.reviewing = false;
    }
  }

  /** Your own verdict shows at once; it is put back if the server does not accept it. */
  override(key: string, verdict: ProductivityVerdict, breakdownKey = key.split("#")[0]): void {
    if (!key) return;
    const previous = this.cache[key];
    const entry: ProductivityCacheEntry = {
      verdict,
      confidence: 1,
      model: "user",
      at: new Date(this.timestamp()).toISOString(),
      source: "user",
    };
    this.write(key, entry);
    void this.options.api.overrideJevVerdict(key, breakdownKey, verdict).catch((error) => {
      logObservability(`Saving your verdict failed: ${error instanceof Error ? error.message : String(error)}`);
      if (this.cache[key] !== entry) return;
      const { [key]: _removed, ...rest } = this.cache;
      this.cache = previous ? { ...rest, [key]: previous } : rest;
      this.onResolved?.(key, previous ?? entry);
    });
  }

  /** Merges verdicts read from the server. */
  hydrate(entries: Record<string, ProductivityCacheEntry>): void {
    const keys = Object.keys(entries);
    if (!keys.length) return;
    this.cache = { ...this.cache, ...entries };
    for (const key of keys) this.onResolved?.(key, entries[key]);
  }

  clear(): void {
    this.cache = {};
    this.requested.clear();
    this.queue.length = 0;
  }

  private accept(input: ProductivityInput, force = false): boolean {
    if (!input.key || this.cache[input.key] || !this.options.enabled()) return false;
    if (this.queue.some((queued) => queued.key === input.key)) return false;
    const sentAt = this.requested.get(input.key);
    if (!force && sentAt !== undefined && this.timestamp() - sentAt < (this.options.resendMs ?? DEFAULT_RESEND_MS)) {
      return false;
    }
    return true;
  }

  private drain(): void {
    if (this.sending || !this.queue.length) return;
    const batch = this.queue.splice(0, BATCH_SIZE);
    const sentAt = this.timestamp();
    for (const input of batch) this.requested.set(input.key, sentAt);
    this.sending = this.send("background", batch).finally(() => {
      this.sending = null;
      this.drain();
    });
  }

  private async send(priority: "live" | "background", inputs: ProductivityInput[]): Promise<void> {
    try {
      const response = await this.options.api.requestJevRatings(
        "productivity",
        priority,
        inputs.map((input) => ({
          key: input.key,
          breakdown_key: input.breakdownKey,
          app_name: input.appName,
          bundle_id: input.bundleID,
          host: websiteHostname(input.url),
          title: input.sendTitle === false ? "" : input.title,
          category: input.category,
        })),
      );
      this.applyRows(response.ratings);
    } catch (error) {
      for (const input of inputs) this.requested.delete(input.key);
      logObservability(`Jev rating request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private applyRows(rows: JevServerRating[]) {
    for (const row of rows) {
      const entry = toProductivityEntry(row);
      if (!entry) continue;
      if (this.cache[row.key]?.source === "user" && entry.source !== "user") continue;
      this.write(row.key, entry);
    }
  }

  private countRated(keys: string[]) {
    return keys.filter((key) => this.cache[key]).length;
  }

  private timestamp() {
    return (this.options.now?.() ?? new Date()).getTime();
  }

  private write(key: string, entry: ProductivityCacheEntry) {
    this.cache = { ...this.cache, [key]: entry };
    this.onResolved?.(key, entry);
  }
}

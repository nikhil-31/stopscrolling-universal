import { websiteHostname } from "@shared/browser";
import {
  jevProductivityRequest,
  parseJevProductivity,
  verdictForTitle,
  type ProductivityCache,
  type ProductivityCacheEntry,
  type ProductivityVerdict,
} from "@shared/jev-productivity";
import { JEV_ENDPOINT } from "@shared/jev";
import { loadProductivityCache, saveProductivityCache } from "./jev-productivity-cache";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DAILY_CAP = 300;

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
  getApiKey: () => string | null;
  cachePath: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
  timeoutMs?: number;
  cooldownMs?: number;
  concurrency?: number;
  dailyCap?: number;
  onResolved?: (key: string, entry: ProductivityCacheEntry) => void;
}

export class JevProductivityAgent {
  cache: ProductivityCache;
  onResolved?: (key: string, entry: ProductivityCacheEntry) => void;
  reviewing = false;
  progress = { done: 0, total: 0 };

  private readonly inflight = new Set<string>();
  private readonly lastAttempt = new Map<string, number>();
  private readonly queue: ProductivityInput[] = [];
  private running = 0;
  private readonly requestDays = new Map<string, number>();

  constructor(private readonly options: JevProductivityAgentOptions) {
    this.cache = loadProductivityCache(options.cachePath);
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
    if (!input.key) return;
    if (this.cache[input.key]) return;
    if (this.inflight.has(input.key)) return;
    if (this.queue.some((queued) => queued.key === input.key)) return;
    if (!this.options.getApiKey()) return;
    const now = this.timestamp();
    const previous = this.lastAttempt.get(input.key) ?? 0;
    if (now - previous < (this.options.cooldownMs ?? DEFAULT_COOLDOWN_MS)) return;
    this.queue.push(input);
    this.drain();
  }

  async reviewAll(inputs: ProductivityInput[]): Promise<void> {
    this.reviewing = true;
    this.progress = { done: 0, total: inputs.length };
    try {
      for (const input of inputs) this.enqueue(input);
      await this.idle();
    } finally {
      this.reviewing = false;
    }
  }

  override(key: string, verdict: ProductivityVerdict): void {
    if (!key) return;
    const entry: ProductivityCacheEntry = {
      verdict,
      confidence: 1,
      model: "user",
      at: new Date(this.timestamp()).toISOString(),
      source: "user",
    };
    this.write(key, entry);
  }

  private timestamp() {
    return (this.options.now?.() ?? new Date()).getTime();
  }

  private dayKey(timestamp: number) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  private underDailyCap(timestamp: number) {
    const used = this.requestDays.get(this.dayKey(timestamp)) ?? 0;
    return used < (this.options.dailyCap ?? DEFAULT_DAILY_CAP);
  }

  private drain() {
    const limit = this.options.concurrency ?? DEFAULT_CONCURRENCY;
    while (this.running < limit && this.queue.length > 0) {
      const now = this.timestamp();
      if (!this.underDailyCap(now)) {
        this.queue.length = 0;
        this.progress = { ...this.progress, done: this.progress.total };
        return;
      }
      const input = this.queue.shift();
      if (!input) return;
      if (this.cache[input.key] || this.inflight.has(input.key)) {
        this.progress = { ...this.progress, done: this.progress.done + 1 };
        continue;
      }
      this.inflight.add(input.key);
      this.running += 1;
      void this.classify(input).finally(() => {
        this.inflight.delete(input.key);
        this.running -= 1;
        this.progress = { ...this.progress, done: this.progress.done + 1 };
        this.drain();
      });
    }
  }

  private idle(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.running === 0 && this.queue.length === 0) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
  }

  private async classify(input: ProductivityInput): Promise<void> {
    const started = this.timestamp();
    this.lastAttempt.set(input.key, started);
    const day = this.dayKey(started);
    this.requestDays.set(day, (this.requestDays.get(day) ?? 0) + 1);
    const apiKey = this.options.getApiKey();
    if (!apiKey) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const request = this.options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
      const response = await request(JEV_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          jevProductivityRequest({
            appName: input.appName,
            bundleID: input.bundleID,
            host: websiteHostname(input.url),
            title: input.sendTitle === false ? "" : input.title,
            category: input.category,
          }),
        ),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const parsed = parseJevProductivity(await response.json());
      if (!parsed) return;
      if (this.cache[input.key]?.source === "user") return;
      this.write(input.key, {
        verdict: parsed.choice,
        confidence: parsed.confidence,
        model: parsed.model,
        at: new Date(this.timestamp()).toISOString(),
        source: "jev",
      });
    } catch {
      return;
    } finally {
      clearTimeout(timer);
    }
  }

  private write(key: string, entry: ProductivityCacheEntry) {
    this.cache = { ...this.cache, [key]: entry };
    saveProductivityCache(this.options.cachePath, this.cache);
    this.onResolved?.(key, entry);
  }
}

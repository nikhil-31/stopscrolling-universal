import {
  acceptedJevCategory,
  JEV_ENDPOINT,
  jevCategoryRequest,
  jevClassificationState,
  parseJevChoice,
  type JevCategoryCache,
  type JevCategoryCacheEntry,
} from "@shared/jev";
import { loadJevCategoryCache, saveJevCategoryCache } from "./jev-category-cache";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

export interface JevClassifyInput {
  key: string;
  appName: string;
  bundleID: string;
  url: string;
}

export interface JevClassifierOptions {
  getApiKey: () => string | null;
  cachePath: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
  timeoutMs?: number;
  cooldownMs?: number;
  onResolved?: (key: string, entry: JevCategoryCacheEntry) => void;
}

export class JevClassifier {
  cache: JevCategoryCache;
  onResolved?: (key: string, entry: JevCategoryCacheEntry) => void;
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly lastAttempt = new Map<string, number>();

  constructor(private readonly options: JevClassifierOptions) {
    this.cache = loadJevCategoryCache(options.cachePath);
    this.onResolved = options.onResolved;
  }

  lookup(key: string): JevCategoryCacheEntry | undefined {
    return this.cache[key];
  }

  enqueue(input: JevClassifyInput): void {
    if (!input.key) return;
    if (this.cache[input.key]) return;
    if (this.inflight.has(input.key)) return;
    if (!this.options.getApiKey()) return;
    const now = this.timestamp();
    const previous = this.lastAttempt.get(input.key) ?? 0;
    if (now - previous < (this.options.cooldownMs ?? DEFAULT_COOLDOWN_MS)) return;
    const pending = this.classify(input).finally(() => this.inflight.delete(input.key));
    this.inflight.set(input.key, pending);
  }

  private timestamp() {
    return (this.options.now?.() ?? new Date()).getTime();
  }

  private async classify(input: JevClassifyInput): Promise<void> {
    this.lastAttempt.set(input.key, this.timestamp());
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
        body: JSON.stringify(jevCategoryRequest(jevClassificationState(input))),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const parsed = parseJevChoice(await response.json());
      if (!parsed) return;
      const entry: JevCategoryCacheEntry = {
        category: parsed.choice,
        confidence: parsed.confidence,
        model: parsed.model,
        at: new Date(this.timestamp()).toISOString(),
      };
      this.cache = { ...this.cache, [input.key]: entry };
      saveJevCategoryCache(this.options.cachePath, this.cache);
      if (acceptedJevCategory(entry.category, entry.confidence)) {
        this.onResolved?.(input.key, entry);
      }
    } catch {
      return;
    } finally {
      clearTimeout(timer);
    }
  }
}

import { JEV_CONFIDENCE_THRESHOLD, JEV_MODEL, parseJevChoice } from "./jev";
import type { ScreenTimeTimelineSegment } from "./types";
import { appBreakdownKey, segmentSeconds } from "./timeline";

export const JEV_PRODUCTIVITY_CRITERIA = {
  Productive: "Work, learning, building, planning, or focused communication",
  Neutral: "Utilities, system tools, short errands, or mixed-use apps",
  Distracting: "Feeds, short-form video, games, or aimless browsing",
} as const;

export type ProductivityVerdict = keyof typeof JEV_PRODUCTIVITY_CRITERIA;

export interface ProductivityCacheEntry {
  verdict: string;
  confidence: number;
  model: string;
  at: string;
  source: "jev" | "user";
}

export type ProductivityCache = Record<string, ProductivityCacheEntry>;

export interface ProductivityState {
  appName: string;
  bundleID: string;
  host: string;
  title: string;
  category: string;
}

const MAX_TITLE_LENGTH = 120;

/** Removes noise so the same page gets one key: unread counters, browser suffixes, extra whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/^\s*\(\d+\+?\)\s*/, "")
    .replace(/\s+[-–—|]\s+(Google Chrome|Chromium|Firefox|Safari|Microsoft Edge|Brave|Arc|Opera|YouTube)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
}

/** Per-title key. An empty title falls back to the app/site key. */
export function productivityKey(breakdownKey: string, title: string): string {
  const normalized = normalizeTitle(title);
  return normalized ? `${breakdownKey}#${normalized}` : breakdownKey;
}

export function jevProductivityRequest(state: ProductivityState) {
  return {
    model: JEV_MODEL,
    state,
    questions: {
      productivity: {
        type: "choice" as const,
        instructions:
          "Rate whether this app or website, given the window title, is productive, neutral, or distracting.",
        criteria: JEV_PRODUCTIVITY_CRITERIA,
      },
    },
  };
}

export function parseJevProductivity(payload: unknown): { choice: string; confidence: number; model: string } | null {
  return parseJevChoice(payload, "productivity");
}

export function acceptedProductivityVerdict(choice: string, confidence: number): ProductivityVerdict | null {
  if (confidence < JEV_CONFIDENCE_THRESHOLD) return null;
  if (!(choice in JEV_PRODUCTIVITY_CRITERIA)) return null;
  return choice as ProductivityVerdict;
}

export interface AgentTitleVerdict {
  key: string;
  title: string;
  seconds: number;
  verdict: ProductivityVerdict | null;
  confidence: number | null;
  source: ProductivityCacheEntry["source"] | null;
}

export interface AgentItem {
  key: string;
  label: string;
  subtitle: string;
  seconds: number;
  category: string;
  verdict: ProductivityVerdict | null;
  confidence: number | null;
  source: ProductivityCacheEntry["source"] | null;
  titles: AgentTitleVerdict[];
}

export interface AgentState {
  items: AgentItem[];
  totals: Record<ProductivityVerdict | "unrated", number>;
  reviewing: boolean;
  progress: { done: number; total: number };
  lastReviewAt: string | null;
  keyConfigured: boolean;
}

function acceptedEntry(entry: ProductivityCacheEntry | undefined): ProductivityCacheEntry | undefined {
  if (!entry) return undefined;
  if (entry.source === "user") return entry;
  return acceptedProductivityVerdict(entry.verdict, entry.confidence) ? entry : undefined;
}

/** Confident verdict for a title, or the most common confident verdict for the same app or site. */
export function verdictForTitle(
  cache: ProductivityCache,
  breakdownKey: string,
  titleKey: string,
): ProductivityCacheEntry | undefined {
  const exact = acceptedEntry(cache[titleKey]);
  if (exact) return exact;
  const prefix = `${breakdownKey}#`;
  const counts = new Map<string, { count: number; entry: ProductivityCacheEntry }>();
  for (const [key, entry] of Object.entries(cache)) {
    if (key !== breakdownKey && !key.startsWith(prefix)) continue;
    const accepted = acceptedEntry(entry);
    if (!accepted) continue;
    const current = counts.get(accepted.verdict);
    counts.set(accepted.verdict, { count: (current?.count ?? 0) + 1, entry: accepted });
  }
  let best: { count: number; entry: ProductivityCacheEntry } | undefined;
  for (const value of counts.values()) {
    if (!best || value.count > best.count) best = value;
  }
  return best?.entry;
}

/** Rolls a day's segments up per app or site, with a verdict per window title. */
export function buildAgentView(
  segments: ScreenTimeTimelineSegment[],
  cache: ProductivityCache,
  meta: { reviewing: boolean; progress: { done: number; total: number }; keyConfigured: boolean },
): AgentState {
  const groups = new Map<string, { segment: ScreenTimeTimelineSegment; seconds: number; titles: Map<string, { title: string; seconds: number }> }>();
  for (const segment of segments) {
    const key = appBreakdownKey(segment);
    const seconds = segmentSeconds(segment);
    const titleKey = productivityKey(key, segment.label);
    const group = groups.get(key) ?? { segment, seconds: 0, titles: new Map() };
    group.seconds += seconds;
    if (group.segment && seconds > segmentSeconds(group.segment)) group.segment = segment;
    const title = group.titles.get(titleKey) ?? { title: normalizeTitle(segment.label), seconds: 0 };
    title.seconds += seconds;
    group.titles.set(titleKey, title);
    groups.set(key, group);
  }

  const items: AgentItem[] = [];
  const totals: AgentState["totals"] = { Productive: 0, Neutral: 0, Distracting: 0, unrated: 0 };
  for (const [key, group] of groups) {
    const titles: AgentTitleVerdict[] = [...group.titles.entries()]
      .map(([titleKey, value]) => {
        const entry = verdictForTitle(cache, key, titleKey);
        const raw = cache[titleKey];
        const unsure = !entry && raw?.source === "jev";
        return {
          key: titleKey,
          title: value.title || group.segment.appName || group.segment.label,
          seconds: value.seconds,
          verdict: entry ? (entry.verdict as ProductivityVerdict) : null,
          confidence: entry ? entry.confidence : unsure ? raw.confidence : null,
          source: entry ? entry.source : unsure ? "jev" : null,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);
    const byVerdict = new Map<ProductivityVerdict, { seconds: number; confidence: number; source: ProductivityCacheEntry["source"] }>();
    for (const title of titles) {
      if (!title.verdict) continue;
      const current = byVerdict.get(title.verdict);
      byVerdict.set(title.verdict, {
        seconds: (current?.seconds ?? 0) + title.seconds,
        confidence: Math.max(current?.confidence ?? 0, title.confidence ?? 0),
        source: current?.source === "user" || title.source === "user" ? "user" : "jev",
      });
    }
    let winner: { verdict: ProductivityVerdict; seconds: number; confidence: number; source: ProductivityCacheEntry["source"] } | null = null;
    for (const [verdict, value] of byVerdict) {
      if (!winner || value.seconds > winner.seconds) winner = { verdict, ...value };
    }
    const site = key.startsWith("web|");
    const pages = group.titles.size;
    items.push({
      key,
      label: site ? key.slice(4) : group.segment.appName || group.segment.label,
      subtitle: site ? `${pages} page${pages === 1 ? "" : "s"}` : group.segment.category,
      seconds: group.seconds,
      category: group.segment.category,
      verdict: winner?.verdict ?? null,
      confidence: winner?.confidence ?? null,
      source: winner?.source ?? null,
      titles,
    });
    totals[winner?.verdict ?? "unrated"] += group.seconds;
  }
  items.sort((a, b) => b.seconds - a.seconds);

  let lastReviewAt: string | null = null;
  for (const entry of Object.values(cache)) {
    if (!lastReviewAt || entry.at > lastReviewAt) lastReviewAt = entry.at;
  }
  return { items, totals, reviewing: meta.reviewing, progress: meta.progress, lastReviewAt, keyConfigured: meta.keyConfigured };
}

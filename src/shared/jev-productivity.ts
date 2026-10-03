import { JEV_CONFIDENCE_THRESHOLD, JEV_MODEL, parseJevChoice } from "./jev";
import type { NavigationItem, ScreenTimeAppBreakdown, ScreenTimeEntry, ScreenTimeTimelineSegment } from "./types";
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

export interface ProductivityRatingInput {
  key: string;
  breakdownKey: string;
  appName: string;
  bundleID: string;
  url: string;
  title: string;
  category: string;
  sendTitle: boolean;
}

/** Today and Insights are the screens whose Focus rows should be filled in. */
export function classifiesFocus(navigation: NavigationItem): boolean {
  return navigation === "today" || navigation === "insights";
}

/** Unrated titles in a period, newest first. Cached keys, including your own overrides, are left out. */
export function productivityInputsFromSegments(
  segments: Array<Pick<ScreenTimeTimelineSegment, "start" | "end" | "url" | "appName" | "label" | "bundleID" | "category">>,
  options: { sendTitles: boolean; cache?: ProductivityCache | null },
): ProductivityRatingInput[] {
  const cache = options.cache ?? {};
  const ordered = [...segments].sort((a, b) => Date.parse(b.end) - Date.parse(a.end) || Date.parse(b.start) - Date.parse(a.start));
  const inputs: ProductivityRatingInput[] = [];
  const seen = new Set<string>();
  for (const segment of ordered) {
    const breakdownKey = appBreakdownKey(segment);
    const key = options.sendTitles ? productivityKey(breakdownKey, segment.label) : breakdownKey;
    if (seen.has(key) || cache[key]) continue;
    seen.add(key);
    inputs.push({
      key,
      breakdownKey,
      appName: segment.appName,
      bundleID: segment.bundleID,
      url: segment.url,
      title: options.sendTitles ? normalizeTitle(segment.label) : "",
      category: segment.category,
      sendTitle: options.sendTitles,
    });
  }
  return inputs;
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

export type FocusVerdict = ProductivityVerdict | "Unrated";

const FOCUS_VERDICTS: ProductivityVerdict[] = ["Productive", "Neutral", "Distracting"];

export function focusVerdictForSegment(
  segment: Pick<ScreenTimeTimelineSegment, "url" | "appName" | "label">,
  cache?: ProductivityCache | null,
): FocusVerdict {
  if (!cache) return "Unrated";
  const key = appBreakdownKey(segment);
  const entry = verdictForTitle(cache, key, productivityKey(key, segment.label));
  if (entry && (FOCUS_VERDICTS as string[]).includes(entry.verdict)) return entry.verdict as ProductivityVerdict;
  return "Unrated";
}

export function stampSegmentVerdicts<T extends Pick<ScreenTimeTimelineSegment, "url" | "appName" | "label">>(
  segments: T[],
  cache?: ProductivityCache | null,
): Array<T & { verdict: FocusVerdict }> {
  if (!cache) return segments.map((segment) => ({ ...segment, verdict: "Unrated" as const }));
  return segments.map((segment) => ({ ...segment, verdict: focusVerdictForSegment(segment, cache) }));
}

/** Share rows for Productive, Neutral, Distracting, and any time still unrated. */
export function productivityBreakdown(
  segments: Array<Pick<ScreenTimeTimelineSegment, "start" | "end" | "verdict">>,
): ScreenTimeAppBreakdown[] {
  const totals: Record<FocusVerdict, number> = { Productive: 0, Neutral: 0, Distracting: 0, Unrated: 0 };
  let total = 0;
  for (const segment of segments) {
    const seconds = Math.max(0, (Date.parse(segment.end) - Date.parse(segment.start)) / 1000);
    const verdict = segment.verdict ?? "Unrated";
    totals[verdict in totals ? verdict : "Unrated"] += seconds;
    total += seconds;
  }
  const ranked = FOCUS_VERDICTS
    .filter((verdict) => totals[verdict] > 0)
    .sort((a, b) => totals[b] - totals[a])
    .map((verdict) => focusRow(verdict, totals[verdict], total));
  if (totals.Unrated > 0) ranked.push(focusRow("Unrated", totals.Unrated, total));
  return ranked;
}

function focusRow(verdict: FocusVerdict, seconds: number, total: number): ScreenTimeAppBreakdown {
  return {
    key: verdict,
    label: verdict,
    subtitle: "",
    category: verdict,
    seconds,
    percentage: total ? seconds / total : 0,
  };
}

/** A session that just started has no duration yet. Give it one second so the current app shows up immediately. */
export function ensureLiveEntryVisible(entries: ScreenTimeEntry[]): ScreenTimeEntry[] {
  return entries.map((entry) => {
    if (entry.source !== "live") return entry;
    const start = Date.parse(entry.startTimeUTC);
    if (Date.parse(entry.endTimeUTC) > start) return entry;
    return { ...entry, endTimeUTC: new Date(start + 1000).toISOString() };
  });
}

/** Rolls a day's segments up per app or site, newest activity first, with a verdict per window title. */
export function buildAgentView(
  segments: ScreenTimeTimelineSegment[],
  cache: ProductivityCache,
  meta: { reviewing: boolean; progress: { done: number; total: number }; keyConfigured: boolean },
): AgentState {
  const groups = new Map<string, { segment: ScreenTimeTimelineSegment; seconds: number; lastEnd: string; titles: Map<string, { title: string; seconds: number; lastEnd: string }> }>();
  for (const segment of segments) {
    const key = appBreakdownKey(segment);
    const seconds = segmentSeconds(segment);
    const titleKey = productivityKey(key, segment.label);
    const group = groups.get(key) ?? { segment, seconds: 0, lastEnd: segment.end, titles: new Map() };
    group.seconds += seconds;
    if (segment.end > group.lastEnd) group.lastEnd = segment.end;
    if (group.segment && seconds > segmentSeconds(group.segment)) group.segment = segment;
    const title = group.titles.get(titleKey) ?? { title: normalizeTitle(segment.label), seconds: 0, lastEnd: segment.end };
    title.seconds += seconds;
    if (segment.end > title.lastEnd) title.lastEnd = segment.end;
    group.titles.set(titleKey, title);
    groups.set(key, group);
  }

  const items: AgentItem[] = [];
  const totals: AgentState["totals"] = { Productive: 0, Neutral: 0, Distracting: 0, unrated: 0 };
  for (const [key, group] of groups) {
    const titles: AgentTitleVerdict[] = [...group.titles.entries()]
      .sort((a, b) => Date.parse(b[1].lastEnd) - Date.parse(a[1].lastEnd))
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
      });
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
  items.sort((a, b) => Date.parse(groups.get(b.key)?.lastEnd ?? "") - Date.parse(groups.get(a.key)?.lastEnd ?? ""));

  let lastReviewAt: string | null = null;
  for (const entry of Object.values(cache)) {
    if (!lastReviewAt || entry.at > lastReviewAt) lastReviewAt = entry.at;
  }
  return { items, totals, reviewing: meta.reviewing, progress: meta.progress, lastReviewAt, keyConfigured: meta.keyConfigured };
}

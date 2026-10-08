import { websiteHostname } from "./browser";
import { normalizeWebsite } from "./blocking";
import type { BlockingPolicyOccurrence } from "./types";

export interface ForegroundTarget {
  appName: string;
  bundleID: string;
  url: string;
}

export type BlockDecision = {
  kind: "app" | "website";
  occurrenceId: string;
};

/** Host equals the blocked domain, or is a subdomain of it. */
export function domainMatches(candidate: string, blocked: string) {
  const host = normalizeWebsite(candidate);
  const rule = normalizeWebsite(blocked);
  if (!host || !rule) return false;
  return host === rule || host.endsWith(`.${rule}`);
}

export function activePolicyOccurrences(occurrences: BlockingPolicyOccurrence[], now: number) {
  return occurrences.filter((occurrence) => {
    const start = Date.parse(occurrence.start_at);
    const end = Date.parse(occurrence.end_at);
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
  });
}

function appIdentifierMatches(identifier: string, target: ForegroundTarget) {
  const id = identifier.trim().toLowerCase();
  if (!id) return false;
  return id === target.bundleID.trim().toLowerCase() || id === target.appName.trim().toLowerCase();
}

/** Prefer a blocked app over a blocked site inside a browser. */
export function blockDecision(
  target: ForegroundTarget,
  occurrences: BlockingPolicyOccurrence[],
  now: number,
): BlockDecision | null {
  const active = activePolicyOccurrences(occurrences, now);
  for (const occurrence of active) {
    if (occurrence.entries.some((entry) => entry.entry_type === "app" && appIdentifierMatches(entry.identifier, target))) {
      return { kind: "app", occurrenceId: occurrence.occurrence_id };
    }
  }
  const host = websiteHostname(target.url);
  if (!host) return null;
  for (const occurrence of active) {
    if (occurrence.entries.some((entry) => entry.entry_type === "website" && domainMatches(host, entry.identifier))) {
      return { kind: "website", occurrenceId: occurrence.occurrence_id };
    }
  }
  return null;
}

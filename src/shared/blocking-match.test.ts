import { describe, expect, it } from "vitest";
import { activePolicyOccurrences, blockDecision, domainMatches } from "./blocking-match";
import type { BlockingPolicyOccurrence } from "./types";

function occurrence(patch: Partial<BlockingPolicyOccurrence> = {}): BlockingPolicyOccurrence {
  return {
    occurrence_id: "occ-1",
    schedule_id: "sched-1",
    schedule_name: "Focus",
    strict_mode: false,
    start_at: "2026-10-08T00:00:00Z",
    end_at: "2026-10-08T02:00:00Z",
    entries: [
      { entry_type: "website", identifier: "instagram.com", label: "Instagram" },
      { entry_type: "app", identifier: "com.apple.Safari", label: "Safari" },
    ],
    ...patch,
  };
}

const now = Date.parse("2026-10-08T01:00:00Z");

describe("blocking match", () => {
  it("matches a domain and its subdomains", () => {
    expect(domainMatches("instagram.com", "instagram.com")).toBe(true);
    expect(domainMatches("www.instagram.com", "https://instagram.com/")).toBe(true);
    expect(domainMatches("notinstagram.com", "instagram.com")).toBe(false);
    expect(domainMatches("instagram.com.evil.test", "instagram.com")).toBe(false);
  });

  it("ignores occurrences outside their window", () => {
    expect(activePolicyOccurrences([occurrence()], Date.parse("2026-10-08T03:00:00Z"))).toEqual([]);
    expect(activePolicyOccurrences([occurrence()], now)).toHaveLength(1);
  });

  it("blocks a listed app before a listed website", () => {
    expect(blockDecision(
      { appName: "Safari", bundleID: "com.apple.Safari", url: "https://instagram.com/" },
      [occurrence()],
      now,
    )).toEqual({ kind: "app", occurrenceId: "occ-1" });
  });

  it("blocks a listed website inside another browser", () => {
    expect(blockDecision(
      { appName: "Google Chrome", bundleID: "com.google.Chrome", url: "https://www.instagram.com/reels/" },
      [occurrence()],
      now,
    )).toEqual({ kind: "website", occurrenceId: "occ-1" });
  });

  it("leaves unrelated apps alone", () => {
    expect(blockDecision(
      { appName: "Notes", bundleID: "com.apple.Notes", url: "" },
      [occurrence()],
      now,
    )).toBeNull();
  });
});

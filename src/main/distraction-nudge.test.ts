import { describe, expect, it, vi } from "vitest";
import type { BlockingPolicyResponse } from "@shared/types";
import {
  DistractionNudge,
  distractionNudgeDecision,
  dismissDistractionNudge,
  EMPTY_NUDGE_STATE,
  foregroundBlocked,
  foregroundVerdict,
  nudgeCopy,
  type NudgeState,
  type NudgeTarget,
} from "./distraction-nudge";

const youtube: NudgeTarget = {
  appName: "Google Chrome",
  bundleID: "com.google.Chrome",
  title: "Funny Shorts",
  url: "https://www.youtube.com/watch?v=1",
};

const notes: NudgeTarget = {
  appName: "Notes",
  bundleID: "com.apple.Notes",
  title: "Plan",
  url: "",
};

function decide(
  state: NudgeState,
  target: NudgeTarget,
  verdict: "Productive" | "Neutral" | "Distracting" | null,
  extras: { blocked?: boolean } = {},
) {
  return distractionNudgeDecision({
    state,
    target,
    verdict,
    blocked: extras.blocked ?? false,
  });
}

describe("distraction nudge decision", () => {
  it("shows the page title and the site when the window is distracting", () => {
    const decision = decide(EMPTY_NUDGE_STATE, youtube, "Distracting");
    expect(decision.action).toBe("show");
    expect(decision.label).toBe("Funny Shorts");
    expect(decision.site).toBe("youtube.com");
    expect(decision.state.shownKey).toContain("youtube.com");
    expect(decision.state.shownKey).toContain("Funny Shorts");
  });

  it("names an app when there is no title", () => {
    expect(nudgeCopy({ ...notes, title: "" })).toEqual({ label: "Notes", site: "" });
    const decision = decide(EMPTY_NUDGE_STATE, { ...notes, title: "" }, "Distracting");
    expect(decision.action).toBe("show");
    expect(decision.label).toBe("Notes");
    expect(decision.site).toBe("");
  });

  it("stays hidden for productive, neutral, and unrated windows", () => {
    expect(decide(EMPTY_NUDGE_STATE, notes, "Productive").action).toBe("keep");
    expect(decide(EMPTY_NUDGE_STATE, notes, "Neutral").action).toBe("keep");
    expect(decide(EMPTY_NUDGE_STATE, youtube, null).action).toBe("keep");
  });

  it("keeps the open card while the same window stays in front", () => {
    const shown = decide(EMPTY_NUDGE_STATE, youtube, "Distracting");
    const again = decide(shown.state, youtube, "Distracting");
    expect(again.action).toBe("keep");
    expect(again.state).toBe(shown.state);
  });

  it("hides when they leave, then shows again on the next visit", () => {
    const shown = decide(EMPTY_NUDGE_STATE, youtube, "Distracting");
    const left = decide(shown.state, notes, "Productive");
    expect(left.action).toBe("hide");
    expect(left.state).toEqual(EMPTY_NUDGE_STATE);
    const back = decide(left.state, youtube, "Distracting");
    expect(back.action).toBe("show");
  });

  it("stays hidden after dismiss until they leave that window", () => {
    const shown = decide(EMPTY_NUDGE_STATE, youtube, "Distracting");
    const dismissed = dismissDistractionNudge(shown.state);
    expect(dismissed.shownKey).toBeNull();
    const stillThere = decide(dismissed, youtube, "Distracting");
    expect(stillThere.action).toBe("keep");
    expect(stillThere.state.dismissedKey).toBe(shown.state.shownKey);

    const other: NudgeTarget = { ...youtube, title: "Cat Videos", url: "https://www.youtube.com/watch?v=2" };
    const next = decide(stillThere.state, other, "Distracting");
    expect(next.action).toBe("show");
    expect(next.label).toBe("Cat Videos");
    expect(next.site).toBe("youtube.com");
    expect(next.state.dismissedKey).toBeNull();
  });

  it("shows when a rating arrives for the window already in front", () => {
    const waiting = decide(EMPTY_NUDGE_STATE, youtube, null);
    expect(waiting.action).toBe("keep");
    const rated = decide(waiting.state, youtube, "Distracting");
    expect(rated.action).toBe("show");
    expect(rated.label).toBe("Funny Shorts");
  });

  it("skips the card when a block already matches", () => {
    const decision = decide(EMPTY_NUDGE_STATE, youtube, "Distracting", { blocked: true });
    expect(decision.action).toBe("keep");
    expect(decision.state.shownKey).toBeNull();
  });

  it("treats a different title on the same site as a new visit", () => {
    const first = decide(EMPTY_NUDGE_STATE, youtube, "Distracting");
    const other: NudgeTarget = { ...youtube, title: "Cat Videos" };
    const second = decide(first.state, other, "Distracting");
    expect(second.action).toBe("show");
    expect(second.label).toBe("Cat Videos");
    expect(second.state.shownKey).not.toBe(first.state.shownKey);
  });
});

describe("foreground verdict and block", () => {
  it("uses this title, then a bare site verdict, and ignores other titles", () => {
    const cache: Record<string, string> = {
      "web|youtube.com#Cat Videos": "Distracting",
    };
    const lookup = (key: string) => cache[key];
    expect(foregroundVerdict(lookup, youtube)).toBeNull();

    cache["web|youtube.com#Funny Shorts"] = "Distracting";
    expect(foregroundVerdict(lookup, youtube)).toBe("Distracting");

    cache["web|youtube.com#Funny Shorts"] = "Productive";
    cache["web|youtube.com"] = "Distracting";
    expect(foregroundVerdict(lookup, youtube)).toBe("Productive");

    delete cache["web|youtube.com#Funny Shorts"];
    expect(foregroundVerdict(lookup, youtube)).toBe("Distracting");
    expect(foregroundVerdict(() => "Curious", youtube)).toBeNull();
  });

  it("ignores an expired block policy", () => {
    const now = Date.parse("2026-10-15T00:00:00.000Z");
    const policy: BlockingPolicyResponse = {
      policy_version: 1,
      device_id: "device-1",
      server_time: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now - 1).toISOString(),
      occurrences: [{
        occurrence_id: "occ-1",
        schedule_id: "sched-1",
        schedule_name: "Focus",
        strict_mode: false,
        start_at: new Date(now - 60_000).toISOString(),
        end_at: new Date(now + 60_000).toISOString(),
        entries: [{ entry_type: "website", identifier: "youtube.com", label: "YouTube" }],
      }],
      algorithm: "Ed25519",
      kid: "kid",
      signature: "sig",
    };
    expect(foregroundBlocked(policy, youtube, now)).toBe(false);
    expect(foregroundBlocked({ ...policy, expires_at: new Date(now + 60_000).toISOString() }, youtube, now)).toBe(true);
    expect(foregroundBlocked(null, youtube, now)).toBe(false);
  });
});

describe("DistractionNudge", () => {
  it("shows once, hides on dismiss, and shows a later rating", () => {
    const show = vi.fn();
    const hide = vi.fn();
    const nudge = new DistractionNudge({ show, hide });

    nudge.consider({ target: youtube, verdict: null, blocked: false });
    expect(show).not.toHaveBeenCalled();

    nudge.consider({ target: youtube, verdict: "Distracting", blocked: false });
    nudge.consider({ target: youtube, verdict: "Distracting", blocked: false });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith({ label: "Funny Shorts", site: "youtube.com" });

    nudge.dismiss();
    expect(hide).toHaveBeenCalledTimes(1);
    nudge.consider({ target: youtube, verdict: "Distracting", blocked: false });
    expect(show).toHaveBeenCalledTimes(1);

    nudge.consider({ target: notes, verdict: "Productive", blocked: false });
    nudge.consider({ target: youtube, verdict: "Distracting", blocked: false });
    expect(show).toHaveBeenCalledTimes(2);
  });
});

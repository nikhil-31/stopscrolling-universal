import { websiteHostname } from "@shared/browser";
import { blockDecision } from "@shared/blocking-match";
import { normalizeTitle, productivityKey, type ProductivityVerdict } from "@shared/jev-productivity";
import { appBreakdownKey } from "@shared/timeline";
import type { BlockingPolicyResponse } from "@shared/types";

export interface NudgeTarget {
  appName: string;
  bundleID: string;
  title: string;
  url: string;
}

export interface NudgeState {
  /** Key of the card on screen. Null while it is hidden. */
  shownKey: string | null;
  /** Key hidden by Dismiss. Cleared once the foreground leaves that window. */
  dismissedKey: string | null;
}

export interface NudgeDecision {
  state: NudgeState;
  action: "show" | "keep" | "hide";
  /** Window title, or the site or app when the title is missing. */
  label: string;
  /** Site or app shown under the title. Empty when it would repeat the label. */
  site: string;
}

const VERDICTS = new Set<ProductivityVerdict>(["Productive", "Neutral", "Distracting"]);

/** Per-title key. An empty title falls back to the site or app key. */
export function nudgeKey(target: Pick<NudgeTarget, "appName" | "title" | "url">): string {
  const breakdownKey = appBreakdownKey({ url: target.url, appName: target.appName, label: target.title });
  return productivityKey(breakdownKey, target.title);
}

/** Title as the heading, with the site or app underneath when they differ. */
export function nudgeCopy(target: Pick<NudgeTarget, "appName" | "title" | "url">): { label: string; site: string } {
  const title = normalizeTitle(target.title);
  const site = websiteHostname(target.url) || target.appName;
  if (title && site && title.toLowerCase() !== site.toLowerCase()) return { label: title, site };
  return { label: site || title || "This app", site: "" };
}

export function acceptedNudgeVerdict(verdict: string | undefined): ProductivityVerdict | null {
  if (verdict && VERDICTS.has(verdict as ProductivityVerdict)) return verdict as ProductivityVerdict;
  return null;
}

/**
 * This title's own verdict, or a verdict stored on the site or app itself.
 * Other titles on the same site do not count.
 */
export function foregroundVerdict(
  lookup: (key: string) => string | undefined,
  target: Pick<NudgeTarget, "appName" | "title" | "url">,
): ProductivityVerdict | null {
  const breakdownKey = appBreakdownKey({ url: target.url, appName: target.appName, label: target.title });
  const titleKey = nudgeKey(target);
  if (titleKey !== breakdownKey) {
    const exact = acceptedNudgeVerdict(lookup(titleKey));
    if (exact) return exact;
  }
  return acceptedNudgeVerdict(lookup(breakdownKey));
}

/** True when a live block would already close this app or site. */
export function foregroundBlocked(policy: BlockingPolicyResponse | null, target: NudgeTarget, now: number): boolean {
  if (!policy) return false;
  const expires = Date.parse(policy.expires_at);
  if (Number.isFinite(expires) && now >= expires) return false;
  return blockDecision(target, policy.occurrences, now) != null;
}

/**
 * Show once when the foreground is Distracting and not already dismissed.
 * Leaving that window clears the dismiss so the next visit can show again.
 */
export function distractionNudgeDecision(input: {
  state: NudgeState;
  target: NudgeTarget;
  verdict: ProductivityVerdict | null;
  blocked: boolean;
}): NudgeDecision {
  const key = nudgeKey(input.target);
  const copy = nudgeCopy(input.target);
  const distracting = input.verdict === "Distracting" && !input.blocked;

  if (!distracting) {
    return {
      state: { shownKey: null, dismissedKey: null },
      action: input.state.shownKey ? "hide" : "keep",
      ...copy,
    };
  }

  if (key === input.state.dismissedKey) {
    return {
      state: { shownKey: null, dismissedKey: key },
      action: input.state.shownKey ? "hide" : "keep",
      ...copy,
    };
  }

  if (key === input.state.shownKey) {
    return { state: input.state, action: "keep", ...copy };
  }

  return {
    state: { shownKey: key, dismissedKey: null },
    action: "show",
    ...copy,
  };
}

export function dismissDistractionNudge(state: NudgeState): NudgeState {
  if (!state.shownKey) return state;
  return { shownKey: null, dismissedKey: state.shownKey };
}

export const EMPTY_NUDGE_STATE: NudgeState = { shownKey: null, dismissedKey: null };

/** Remembers the open card and asks the window to show, hide, or stay. */
export class DistractionNudge {
  private state: NudgeState = EMPTY_NUDGE_STATE;

  constructor(private readonly card: { show(copy: { label: string; site: string }): void; hide(): void }) {}

  consider(input: {
    target: NudgeTarget;
    verdict: ProductivityVerdict | null;
    blocked: boolean;
  }) {
    const decision = distractionNudgeDecision({ state: this.state, ...input });
    this.state = decision.state;
    if (decision.action === "show") this.card.show({ label: decision.label, site: decision.site });
    else if (decision.action === "hide") this.card.hide();
  }

  dismiss() {
    const next = dismissDistractionNudge(this.state);
    if (next === this.state) return;
    this.state = next;
    this.card.hide();
  }
}

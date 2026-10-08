import {
  activePolicyOccurrences,
  blockDecision,
  type ForegroundTarget,
} from "@shared/blocking-match";
import type { BlockingPolicyOccurrence, BlockingPolicyResponse } from "@shared/types";
import { logObservability } from "../logger";
import { closeBlockedWebsite, quitBlockedApp } from "./local-actions";

export class LocalEnforcer {
  private policy: BlockingPolicyResponse | null = null;
  private acting = false;

  constructor(
    private readonly actions: {
      closeWebsite: (appName: string, bundleID: string) => Promise<void>;
      quitApp: (appName: string, bundleID: string) => Promise<void>;
    } = { closeWebsite: closeBlockedWebsite, quitApp: quitBlockedApp },
    private readonly onBlocked: () => void = () => {},
    private readonly prepareScreen: (scheduleId: string) => void = () => {},
  ) {}

  setPolicy(policy: BlockingPolicyResponse) {
    this.policy = policy;
  }

  clear() {
    this.policy = null;
  }

  get storedPolicy() {
    return this.policy;
  }

  activeOccurrence(now = Date.now()): BlockingPolicyOccurrence | null {
    if (!this.policy) return null;
    const expires = Date.parse(this.policy.expires_at);
    if (Number.isFinite(expires) && now >= expires) return null;
    return activePolicyOccurrences(this.policy.occurrences, now)[0] ?? null;
  }

  async enforce(target: ForegroundTarget, now = Date.now()) {
    if (this.acting || !this.policy) return;
    const expires = Date.parse(this.policy.expires_at);
    if (Number.isFinite(expires) && now >= expires) return;
    const decision = blockDecision(target, this.policy.occurrences, now);
    if (!decision) return;
    const scheduleId = this.policy.occurrences.find((item) => item.occurrence_id === decision.occurrenceId)?.schedule_id ?? "";
    this.acting = true;
    try {
      this.prepareScreen(scheduleId);
      if (decision.kind === "website") {
        await this.actions.closeWebsite(target.appName, target.bundleID);
      } else {
        await this.actions.quitApp(target.appName, target.bundleID);
        this.onBlocked();
      }
    } catch (error) {
      logObservability(`Local block failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.acting = false;
    }
  }
}

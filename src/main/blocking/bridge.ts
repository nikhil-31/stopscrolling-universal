import type {
  BlockingCapabilities,
  BlockingEnforcementStatus,
  BlockingHostSetup,
  BlockingPolicyResponse,
  InstalledApplication,
} from "@shared/types";
import { logCrash, logObservability } from "../logger";
import { loadMacHostClient } from "./host-client";
import { MacXpcTransport, type MacXpcClient } from "./macos-xpc";
import {
  bypassEnvelope,
  parseEnforcementStatus,
  parseInventory,
  policyEnvelope,
  unavailableCapabilities,
  unavailableHostSetup,
} from "./protocol";
import type { HelperTransport } from "./transport";
import { UnavailableHelperTransport } from "./unavailable";
import { WindowsNamedPipeTransport } from "./windows-pipe";

export const unavailableStatus = (reason: string): BlockingEnforcementStatus => ({
  available: false,
  connected: false,
  protocolVersion: 1,
  policyVersion: null,
  activeOccurrenceIDs: [],
  strictOccurrenceIDs: [],
  activeOccurrenceID: null,
  strictMode: false,
  policyExpiresAt: null,
  lastError: reason,
  checkedAt: new Date().toISOString(),
});

export function createHelperTransport(
  platform = process.platform,
  macClient?: MacXpcClient,
): HelperTransport {
  if (platform === "win32") return new WindowsNamedPipeTransport();
  if (platform === "darwin") {
    const client = macClient ?? loadMacHostClient();
    if (client) return new MacXpcTransport(client);
  }
  return new UnavailableHelperTransport(
    platform === "darwin"
      ? "The signed macOS XPC client is not installed in this build."
      : "Native blocking is unavailable on this platform.",
  );
}

export class BlockingHelperBridge {
  status: BlockingEnforcementStatus;
  inventory: InstalledApplication[] = [];
  capabilities: BlockingCapabilities;
  hostSetup: BlockingHostSetup;

  constructor(readonly transport: HelperTransport = createHelperTransport()) {
    const reason = transport instanceof UnavailableHelperTransport
      ? transport.reason
      : "Blocking helper has not connected yet.";
    this.status = unavailableStatus(reason);
    this.hostSetup = unavailableHostSetup(
      transport.kind === "unavailable" ? "signed-host-unavailable" : null,
    );
    this.capabilities = transport.kind === "unavailable"
      ? unavailableCapabilities(reason)
      : {
          helperAvailable: true,
          policyEnforcement: true,
          applicationInventory: true,
          normalCancellation: true,
          strictMode: true,
          bypassRedemption: true,
          reason: null,
        };
  }

  async initialize() {
    return this.refreshStatus();
  }

  async refreshStatus() {
    try {
      this.status = parseEnforcementStatus(await this.transport.request({ operation: "status" }));
      this.capabilities = { ...this.capabilities, helperAvailable: true, reason: null };
      await this.refreshHostSetup();
      return this.status;
    } catch (error) {
      this.recordFailure(error);
      return this.status;
    }
  }

  async activateNativeSetup() {
    if (!this.transport.activate) {
      this.hostSetup = unavailableHostSetup("signed-host-unavailable");
      return this.hostSetup;
    }
    try {
      this.hostSetup = await this.transport.activate();
      await this.refreshStatus();
      return this.hostSetup;
    } catch (error) {
      this.hostSetup = unavailableHostSetup("activation-failed");
      this.recordFailure(error);
      return this.hostSetup;
    }
  }

  private async refreshHostSetup() {
    if (!this.transport.setup) return;
    try {
      const setup = await this.transport.setup();
      if (setup) this.hostSetup = setup;
    } catch {
      // Keep the last known setup; do not log OS paths or policy details.
    }
  }

  async refreshInventory() {
    try {
      this.inventory = parseInventory(await this.transport.request({ operation: "inventory" }));
    } catch (error) {
      this.recordFailure(error);
    }
    return this.inventory;
  }

  async applyPolicy(policy: BlockingPolicyResponse) {
    try {
      this.status = parseEnforcementStatus(await this.transport.request({
        operation: "applyPolicy",
        envelope: policyEnvelope(policy),
      }));
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
    return this.status;
  }

  async cancelNormal(occurrenceID: string) {
    await this.transport.request({ operation: "cancelNormal", occurrenceID });
    return this.refreshStatus();
  }

  async redeemBypass(token: string) {
    this.status = parseEnforcementStatus(await this.transport.request({
      operation: "redeemBypass",
      envelope: bypassEnvelope(token),
    }));
    return this.status;
  }

  async requestRelaunchAfterForcedExit() {
    await this.transport.requestRelaunch?.();
  }

  async close() {
    await this.transport.close?.();
  }

  private recordFailure(error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    this.status = this.status.strictMode
      ? { ...this.status, connected: false, lastError: reason, checkedAt: new Date().toISOString() }
      : unavailableStatus(reason);
    this.capabilities = { ...this.capabilities, helperAvailable: false, reason };
    // Do not persist helper messages: OS errors can contain usernames, paths,
    // policy identifiers, or pipe/XPC details.
    logObservability(`blocking_helper_unavailable transport=${this.transport.kind}`);
    logCrash({
      kind: "helper-exit",
      process: this.transport.kind,
      reason: "blocking_helper_unavailable",
    });
  }
}

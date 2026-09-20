import { describe, expect, it, vi } from "vitest";
import type { HelperRequest } from "./protocol";
import type { HelperTransport } from "./transport";
import { BlockingHelperBridge, createHelperTransport } from "./bridge";

vi.mock("../logger", () => ({ logObservability: vi.fn() }));

class FakeTransport implements HelperTransport {
  readonly kind = "windows-pipe" as const;
  requests: HelperRequest[] = [];

  async request(request: HelperRequest) {
    this.requests.push(request);
    return {
      policyVersion: request.operation === "applyPolicy" ? 1 : null,
      activeOccurrenceIDs: [],
      strictOccurrenceIDs: [],
      policyExpiresAt: null,
      lastError: null,
    };
  }
}

describe("blocking helper lifecycle", () => {
  it("is safely unavailable on Linux", async () => {
    const bridge = new BlockingHelperBridge(createHelperTransport("linux"));
    await bridge.initialize();
    expect(bridge.status.strictMode).toBe(false);
    expect(bridge.status.available).toBe(false);
    expect(bridge.capabilities.policyEnforcement).toBe(false);
  });

  it("stays unavailable on macOS without a signed host client", async () => {
    const bridge = new BlockingHelperBridge(createHelperTransport("darwin"));
    await bridge.initialize();
    expect(bridge.status.available).toBe(false);
    expect(bridge.capabilities.policyEnforcement).toBe(false);
    expect(bridge.hostSetup.helperRegistered).toBe(false);
  });

  it("applies policy and forwards normal cancellation", async () => {
    const transport = new FakeTransport();
    const bridge = new BlockingHelperBridge(transport);
    await bridge.applyPolicy({
      policy_version: 1,
      device_id: "device",
      server_time: "2026-09-14T00:00:00Z",
      expires_at: "2026-09-15T00:00:00Z",
      occurrences: [],
      algorithm: "Ed25519",
      kid: "key",
      signature: "AQ",
    });
    await bridge.cancelNormal("occurrence");
    expect(transport.requests.map((request) => request.operation)).toEqual([
      "applyPolicy",
      "cancelNormal",
      "status",
    ]);
  });

  it("does not erase helper-confirmed strict state on disconnect", async () => {
    let connected = true;
    const transport: HelperTransport = {
      kind: "windows-pipe",
      request: async () => {
        if (!connected) throw new Error("disconnected");
        return {
          policyVersion: 1,
          activeOccurrenceIDs: ["strict"],
          strictOccurrenceIDs: ["strict"],
          policyExpiresAt: null,
          lastError: null,
        };
      },
    };
    const bridge = new BlockingHelperBridge(transport);
    await bridge.refreshStatus();
    connected = false;
    await bridge.refreshStatus();
    expect(bridge.status.strictMode).toBe(true);
    expect(bridge.status.connected).toBe(false);
  });
});

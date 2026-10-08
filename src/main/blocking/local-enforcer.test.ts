import { describe, expect, it, vi } from "vitest";
import type { BlockingPolicyResponse } from "@shared/types";
import { LocalEnforcer } from "./local-enforcer";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
}));

function policy(now = Date.now()): BlockingPolicyResponse {
  return {
    policy_version: 1,
    device_id: "device-1",
    server_time: new Date(now - 1_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
    occurrences: [{
      occurrence_id: "occ-1",
      schedule_id: "sched-1",
      schedule_name: "Focus",
      strict_mode: false,
      start_at: new Date(now - 1_000).toISOString(),
      end_at: new Date(now + 60_000).toISOString(),
      entries: [
        { entry_type: "website", identifier: "instagram.com", label: "Instagram" },
        { entry_type: "app", identifier: "com.apple.MobileSMS", label: "Messages" },
      ],
    }],
    algorithm: "Ed25519",
    kid: "kid",
    signature: "sig",
  };
}

describe("local enforcer", () => {
  it("closes a blocked site and quits a blocked app", async () => {
    const closeWebsite = vi.fn(async () => {});
    const quitApp = vi.fn(async () => {});
    const onBlocked = vi.fn();
    const prepareScreen = vi.fn();
    const enforcer = new LocalEnforcer({ closeWebsite, quitApp }, onBlocked, prepareScreen);
    enforcer.setPolicy(policy());

    await enforcer.enforce({ appName: "Google Chrome", bundleID: "com.google.Chrome", url: "https://www.instagram.com/" });
    await enforcer.enforce({ appName: "Messages", bundleID: "com.apple.MobileSMS", url: "" });
    await enforcer.enforce({ appName: "Notes", bundleID: "com.apple.Notes", url: "" });

    expect(closeWebsite).toHaveBeenCalledWith("Google Chrome", "com.google.Chrome");
    expect(quitApp).toHaveBeenCalledWith("Messages", "com.apple.MobileSMS");
    expect(prepareScreen).toHaveBeenCalledTimes(2);
    expect(prepareScreen).toHaveBeenCalledWith("sched-1");
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("does nothing after the policy expires", async () => {
    const closeWebsite = vi.fn(async () => {});
    const enforcer = new LocalEnforcer({ closeWebsite, quitApp: async () => {} });
    const expired = policy();
    expired.expires_at = new Date(Date.now() - 1_000).toISOString();
    enforcer.setPolicy(expired);
    await enforcer.enforce({ appName: "Google Chrome", bundleID: "com.google.Chrome", url: "https://instagram.com/" });
    expect(closeWebsite).not.toHaveBeenCalled();
  });
});
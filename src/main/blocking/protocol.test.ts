import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bypassEnvelope, parseEnforcementStatus, parseHostSetup, parseInventory, policyEnvelope } from "./protocol";

const goldenContract = JSON.parse(
  readFileSync(
    join(__dirname, "../../../native/macos/Tests/BlockingCoreTests/Fixtures/backend-contract-v1.json"),
    "utf8",
  ),
) as { payload: string; signature: string; keyID: string };

describe("blocking helper protocol", () => {
  it("parses status and derives strict mode only from helper IDs", () => {
    const status = parseEnforcementStatus({
      policyVersion: 4,
      activeOccurrenceIDs: ["normal", "strict"],
      strictOccurrenceIDs: ["strict"],
      policyExpiresAt: 123,
      lastError: null,
    });
    expect(status.strictMode).toBe(true);
    expect(status.activeOccurrenceID).toBe("normal");
  });

  it("lowercases helper occurrence IDs", () => {
    const status = parseEnforcementStatus({
      policyVersion: 1,
      activeOccurrenceIDs: ["AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"],
      strictOccurrenceIDs: ["AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"],
      policyExpiresAt: null,
      lastError: null,
    });
    expect(status.activeOccurrenceID).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(status.strictOccurrenceIDs).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  });

  it("rejects malformed helper data", () => {
    expect(() => parseEnforcementStatus({
      policyVersion: null,
      activeOccurrenceIDs: "not-an-array",
      strictOccurrenceIDs: [],
      policyExpiresAt: null,
      lastError: null,
    })).toThrow(/activeOccurrenceIDs/);
    expect(() => parseInventory([{ displayName: "App" }])).toThrow(/inventory item/);
  });

  it("preserves signed backend policy bytes in a native envelope", () => {
    const envelope = policyEnvelope({
      policy_version: 1,
      device_id: "device",
      server_time: "2026-09-14T00:00:00Z",
      expires_at: "2026-09-15T00:00:00Z",
      occurrences: [],
      algorithm: "Ed25519",
      kid: "key-1",
      signature: "AQ-_",
    });
    expect(envelope.keyID).toBe("key-1");
    expect(JSON.parse(Buffer.from(envelope.payload, "base64").toString())).toMatchObject({
      device_id: "device",
      kid: "key-1",
    });
    expect(envelope.signature).toBe("AQ+/");
  });

  it("forwards exact backend-signed golden payload bytes", () => {
    const signedFields = JSON.parse(Buffer.from(goldenContract.payload, "base64").toString("utf8"));
    const forwarded = policyEnvelope({
      ...signedFields,
      signature: goldenContract.signature,
      payload: goldenContract.payload,
    });
    expect(forwarded.payload).toBe(goldenContract.payload);
    expect(forwarded.keyID).toBe(goldenContract.keyID);

    const recoded = policyEnvelope({
      ...signedFields,
      signature: goldenContract.signature,
    });
    expect(Buffer.from(recoded.payload, "base64").toString("utf8")).toBe(
      Buffer.from(goldenContract.payload, "base64").toString("utf8"),
    );
  });

  it("parses host setup without treating missing flags as approved", () => {
    expect(parseHostSetup({ helperRegistered: true })).toEqual({
      helperRegistered: true,
      networkFilterApproved: false,
      endpointSecurityApproved: false,
      lastError: null,
    });
  });

  it("parses the backend compact bypass token", () => {
    const payload = Buffer.from(JSON.stringify({ kid: "key-2" })).toString("base64url");
    expect(bypassEnvelope(`${payload}.AQ`).keyID).toBe("key-2");
  });
});

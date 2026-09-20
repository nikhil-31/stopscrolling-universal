import type {
  BlockingCapabilities,
  BlockingEnforcementStatus,
  BlockingHostSetup,
  BlockingPolicyResponse,
  InstalledApplication,
  SignedEnvelope,
} from "@shared/types";

export const HELPER_PROTOCOL_VERSION = 1;
export const MAX_HELPER_MESSAGE_BYTES = 1024 * 1024;

export type HelperOperation =
  | "applyPolicy"
  | "status"
  | "redeemBypass"
  | "inventory"
  | "cancelNormal";

export type HelperRequest =
  | { operation: "applyPolicy"; envelope: SignedEnvelope }
  | { operation: "status" }
  | { operation: "redeemBypass"; envelope: SignedEnvelope }
  | { operation: "inventory" }
  | { operation: "cancelNormal"; occurrenceID: string };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Malformed helper ${label}`);
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Malformed helper ${label}`);
  }
  return value;
}

export function parseEnforcementStatus(value: unknown): BlockingEnforcementStatus {
  const row = record(value, "status");
  const policyVersion = row.policyVersion;
  const policyExpiresAt = row.policyExpiresAt;
  const lastError = row.lastError;
  if (policyVersion !== null && policyVersion !== undefined && typeof policyVersion !== "number") {
    throw new Error("Malformed helper policyVersion");
  }
  if (policyExpiresAt !== null && policyExpiresAt !== undefined && typeof policyExpiresAt !== "number") {
    throw new Error("Malformed helper policyExpiresAt");
  }
  if (lastError !== null && lastError !== undefined && typeof lastError !== "string") {
    throw new Error("Malformed helper lastError");
  }
  const activeOccurrenceIDs = strings(row.activeOccurrenceIDs, "activeOccurrenceIDs").map((id) => id.toLowerCase());
  const strictOccurrenceIDs = strings(row.strictOccurrenceIDs, "strictOccurrenceIDs").map((id) => id.toLowerCase());
  return {
    available: true,
    connected: true,
    protocolVersion: HELPER_PROTOCOL_VERSION,
    policyVersion: policyVersion ?? null,
    activeOccurrenceIDs,
    strictOccurrenceIDs,
    activeOccurrenceID: activeOccurrenceIDs[0] ?? null,
    strictMode: strictOccurrenceIDs.length > 0,
    policyExpiresAt: policyExpiresAt ?? null,
    lastError: lastError ?? null,
    checkedAt: new Date().toISOString(),
  };
}

export function parseInventory(value: unknown): InstalledApplication[] {
  if (!Array.isArray(value)) throw new Error("Malformed helper inventory");
  return value.map((item) => {
    const row = record(item, "inventory item");
    if (typeof row.displayName !== "string" || typeof row.executablePath !== "string") {
      throw new Error("Malformed helper inventory item");
    }
    return {
      displayName: row.displayName,
      executablePath: row.executablePath,
      bundleIdentifier: typeof row.bundleIdentifier === "string" ? row.bundleIdentifier : null,
      signingIdentifier: typeof row.signingIdentifier === "string" ? row.signingIdentifier : null,
      packageFamilyName: typeof row.packageFamilyName === "string" ? row.packageFamilyName : null,
      publisherThumbprint: typeof row.publisherThumbprint === "string" ? row.publisherThumbprint : null,
    };
  });
}

function base64UrlToBase64(value: string) {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  return standard + "=".repeat((4 - (standard.length % 4)) % 4);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Preserve the exact backend-signed payload bytes; never locally re-sign policy. */
export function policyEnvelope(policy: BlockingPolicyResponse): SignedEnvelope {
  const { signature, payload: providedPayload, ...fields } = policy;
  return {
    payload: providedPayload
      ? providedPayload.includes("-") || providedPayload.includes("_")
        ? base64UrlToBase64(providedPayload)
        : providedPayload
      : Buffer.from(canonicalJson(fields), "utf8").toString("base64"),
    signature: base64UrlToBase64(signature),
    keyID: policy.kid,
  };
}

export function parseHostSetup(value: unknown): BlockingHostSetup {
  const row = record(value, "host setup");
  const lastError = row.lastError;
  if (lastError !== null && lastError !== undefined && typeof lastError !== "string") {
    throw new Error("Malformed helper lastError");
  }
  return {
    helperRegistered: row.helperRegistered === true,
    networkFilterApproved: row.networkFilterApproved === true,
    endpointSecurityApproved: row.endpointSecurityApproved === true,
    lastError: lastError ?? null,
  };
}

export const unavailableHostSetup = (reason: string | null = null): BlockingHostSetup => ({
  helperRegistered: false,
  networkFilterApproved: false,
  endpointSecurityApproved: false,
  lastError: reason,
});

export function bypassEnvelope(token: string): SignedEnvelope {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("Malformed bypass token");
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(base64UrlToBase64(payload), "base64").toString("utf8"));
  } catch {
    throw new Error("Malformed bypass token");
  }
  const keyID = record(decoded, "bypass token").kid;
  if (typeof keyID !== "string" || !keyID) throw new Error("Bypass token has no key ID");
  return {
    payload: base64UrlToBase64(payload),
    signature: base64UrlToBase64(signature),
    keyID,
  };
}

export const unavailableCapabilities = (reason: string): BlockingCapabilities => ({
  helperAvailable: false,
  policyEnforcement: false,
  applicationInventory: false,
  normalCancellation: false,
  strictMode: false,
  bypassRedemption: false,
  reason,
});

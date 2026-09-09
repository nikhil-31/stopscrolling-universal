import { describe, expect, it } from "vitest";
import { decryptAesGcm, encryptAesGcm } from "./crypto";
import { randomBytes } from "node:crypto";

describe("outbox encryption", () => {
  it("round-trips AES-GCM payloads", () => {
    const key = randomBytes(32);
    const plain = Buffer.from(JSON.stringify([{ id: "a" }]), "utf8");
    const blob = encryptAesGcm(plain, key);
    expect(blob.equals(plain)).toBe(false);
    expect(decryptAesGcm(blob, key).toString("utf8")).toBe(plain.toString("utf8"));
  });

  it("rejects a truncated blob", () => {
    expect(() => decryptAesGcm(Buffer.alloc(8), randomBytes(32))).toThrow(/too short/);
  });
});

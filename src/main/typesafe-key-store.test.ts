import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { typesafeKeyPath } from "./paths";
import {
  clearTypesafeApiKey,
  hasTypesafeApiKey,
  loadTypesafeApiKey,
  resolveTypesafeApiKey,
  saveTypesafeApiKey,
} from "./typesafe-key-store";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

vi.mock("./paths", () => ({
  typesafeKeyPath: vi.fn(),
}));

describe("Typesafe API key store", () => {
  const dirs: string[] = [];
  const previous = process.env.TYPESAFE_API_KEY;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "typesafe-key-"));
    dirs.push(dir);
    vi.mocked(typesafeKeyPath).mockReturnValue(join(dir, "typesafe-api-key.dat"));
    delete process.env.TYPESAFE_API_KEY;
  });

  afterEach(() => {
    clearTypesafeApiKey();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  });

  it("persists and clears the key without using app settings", () => {
    expect(hasTypesafeApiKey()).toBe(false);
    saveTypesafeApiKey("  secret-key  ");
    expect(loadTypesafeApiKey()).toBe("secret-key");
    expect(hasTypesafeApiKey()).toBe(true);
    clearTypesafeApiKey();
    expect(loadTypesafeApiKey()).toBeNull();
  });

  it("falls back to TYPESAFE_API_KEY when nothing is stored", () => {
    process.env.TYPESAFE_API_KEY = "env-key";
    expect(resolveTypesafeApiKey()).toBe("env-key");
  });
});

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { typesafeKeyPath } from "./paths";
import { clearTypesafeApiKey } from "./typesafe-key-store";

vi.mock("./paths", () => ({
  typesafeKeyPath: vi.fn(),
}));

describe("old Typesafe API key", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("removes a key an older version stored", () => {
    const dir = mkdtempSync(join(tmpdir(), "typesafe-key-"));
    dirs.push(dir);
    const path = join(dir, "typesafe-api-key.dat");
    vi.mocked(typesafeKeyPath).mockReturnValue(path);
    writeFileSync(path, "secret-key");
    clearTypesafeApiKey();
    expect(existsSync(path)).toBe(false);
    expect(() => clearTypesafeApiKey()).not.toThrow();
  });
});

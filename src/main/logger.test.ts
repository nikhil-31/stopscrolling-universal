import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "stopscrolling-crash-"));
const crashLog = join(directory, "crash.log");

vi.mock("./paths", () => ({
  crashLogPath: () => crashLog,
  networkLogPath: () => join(directory, "network.log"),
  observabilityLogPath: () => join(directory, "observability.log"),
}));

import { logCrash, sanitizeCrashText } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crash log", () => {
  it("writes one sanitized line with kind, process, reason, and stack", () => {
    logCrash({
      kind: "uncaughtException",
      process: "main",
      reason: "failed https://example.com/private Bearer secret.token",
      stack: "Error: failed\n    at boot (app.ts:1)\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    });
    const line = readFileSync(crashLog, "utf8").trim().split("\n").at(-1) ?? "";
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T.+ kind=uncaughtexception process=main reason=/);
    expect(line).toContain("reason=failed [url] Bearer [token]");
    expect(line).toContain("stack=Error: failed at boot (app.ts:1) [token]");
    expect(line).not.toContain("https://");
    expect(line).not.toContain("\n");
    expect(line).not.toContain("secret.token");
  });

  it("drops empty stacks", () => {
    logCrash({ kind: "unresponsive", process: "renderer", reason: "unresponsive", stack: "   " });
    const line = readFileSync(crashLog, "utf8").trim().split("\n").at(-1) ?? "";
    expect(line).toContain("kind=unresponsive process=renderer reason=unresponsive");
    expect(line).not.toContain("stack=");
  });
});

describe("sanitizeCrashText", () => {
  it("collapses whitespace and limits length", () => {
    expect(sanitizeCrashText("a\n\tb  c", 3)).toBe("a b");
  });
});

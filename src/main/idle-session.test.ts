import { describe, expect, it } from "vitest";
import { decideIdle, lastInputAt, recoveredSessionEnd } from "./idle-session";

describe("idle sessions", () => {
  it("places the last input idleSeconds before now", () => {
    expect(lastInputAt(1_000_000, 60).getTime()).toBe(940_000);
    expect(lastInputAt(1_000_000, 0).getTime()).toBe(1_000_000);
    expect(lastInputAt(1_000_000, -5).getTime()).toBe(1_000_000);
  });

  it("closes at the last input once idle reaches 60 seconds", () => {
    const openStart = new Date(900_000);
    const decision = decideIdle({
      nowMs: 1_000_000,
      idleSeconds: 60,
      lastActiveAt: new Date(1_000_000 - 1000),
      openStart,
    });
    expect(decision.close).toBe(true);
    expect(decision.stillAway).toBe(true);
    expect(decision.end?.getTime()).toBe(940_000);
  });

  it("closes a stalled session at the remembered input even if the idle clock reset", () => {
    const lastActive = new Date(1_000_000);
    const decision = decideIdle({
      nowMs: 1_000_000 + 2 * 60 * 60 * 1000,
      idleSeconds: 0,
      lastActiveAt: lastActive,
      openStart: new Date(900_000),
    });
    expect(decision.close).toBe(true);
    expect(decision.stillAway).toBe(false);
    expect(decision.end?.getTime()).toBe(lastActive.getTime());
  });

  it("keeps the session while the user is active", () => {
    const decision = decideIdle({
      nowMs: 1_060_000,
      idleSeconds: 1,
      lastActiveAt: new Date(1_059_000),
      openStart: new Date(1_000_000),
    });
    expect(decision.close).toBe(false);
    expect(decision.stillAway).toBe(false);
    expect(decision.activeAt.getTime()).toBe(1_059_000);
  });

  it("does not end a session before it started", () => {
    const openStart = new Date(1_000_000);
    const decision = decideIdle({
      nowMs: 1_070_000,
      idleSeconds: 90,
      lastActiveAt: null,
      openStart,
    });
    expect(decision.end?.getTime()).toBe(openStart.getTime());
  });

  it("ends a recovered session at lastActive, not at launch", () => {
    const end = recoveredSessionEnd({
      start: "2026-09-22T10:00:00.000Z",
      lastActive: "2026-09-22T10:05:00.000Z",
    });
    expect(end.toISOString()).toBe("2026-09-22T10:05:00.000Z");
  });

  it("ends an older checkpoint at its start", () => {
    const end = recoveredSessionEnd({ start: "2026-09-22T10:00:00.000Z" });
    expect(end.toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });
});
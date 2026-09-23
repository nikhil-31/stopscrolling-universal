import { describe, expect, it } from "vitest";
import { endOfDay, startOfDay, toDateInput } from "./platform";
import { periodBounds } from "./timeline";

describe("account time zone day bounds", () => {
  it("puts the instant before Los Angeles midnight on the previous calendar day", () => {
    const beforeMidnight = new Date("2026-06-17T06:59:00.000Z");
    const midnight = new Date("2026-06-17T07:00:00.000Z");
    expect(toDateInput(beforeMidnight, "America/Los_Angeles")).toBe("2026-06-16");
    expect(toDateInput(midnight, "America/Los_Angeles")).toBe("2026-06-17");
    const bounds = periodBounds("day", beforeMidnight, "America/Los_Angeles");
    expect(bounds.end.toISOString()).toBe("2026-06-17T07:00:00.000Z");
    expect(beforeMidnight.getTime()).toBeLessThan(bounds.end.getTime());
    expect(beforeMidnight.getTime()).toBeGreaterThanOrEqual(bounds.start.getTime());
  });

  it("uses a 23 hour window when Los Angeles springs forward", () => {
    const anchor = new Date("2026-03-08T18:00:00.000Z");
    const start = startOfDay(anchor, "America/Los_Angeles");
    const end = endOfDay(anchor, "America/Los_Angeles");
    expect(start.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("uses a 25 hour window when Los Angeles falls back", () => {
    const anchor = new Date("2026-11-01T18:00:00.000Z");
    const start = startOfDay(anchor, "America/Los_Angeles");
    const end = endOfDay(anchor, "America/Los_Angeles");
    expect(start.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

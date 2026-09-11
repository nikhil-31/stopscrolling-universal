import { describe, expect, it } from "vitest";
import {
  effectiveTimerBonus,
  focusRemaining,
  formatFocusClock,
  usesTodayWindow,
} from "./timer";

describe("timer remaining", () => {
  it("subtracts tracked time from the work target plus bonus", () => {
    const remaining = focusRemaining({
      targetSeconds: 8 * 3600,
      trackedSeconds: 8 * 3600 - 3466,
    });
    expect(remaining.remainingSeconds).toBe(3466);
    expect(remaining.usedSeconds).toBe(8 * 3600 - 3466);
    expect(remaining.targetSeconds).toBe(8 * 3600);
    expect(remaining.usedFraction).toBeCloseTo((8 * 3600 - 3466) / (8 * 3600));
  });

  it("adds bonus minutes and never goes below zero", () => {
    expect(focusRemaining({
      targetSeconds: 3600,
      trackedSeconds: 3500,
      bonusSeconds: 900,
    }).remainingSeconds).toBe(1000);
    expect(focusRemaining({
      targetSeconds: 3600,
      trackedSeconds: 4000,
    }).remainingSeconds).toBe(0);
  });

  it("formats remaining as MM:SS under an hour and H:MM:SS above", () => {
    expect(formatFocusClock(57 * 60 + 46)).toBe("57:46");
    expect(formatFocusClock(8 * 3600)).toBe("8:00:00");
    expect(formatFocusClock(0)).toBe("00:00");
  });

  it("drops bonus from a previous calendar day", () => {
    expect(effectiveTimerBonus(900, "2026-09-10", "2026-09-10")).toBe(900);
    expect(effectiveTimerBonus(900, "2026-09-10", "2026-09-11")).toBe(0);
    expect(effectiveTimerBonus(900, "", "2026-09-11")).toBe(0);
  });

  it("uses today's window for the Timer tab", () => {
    expect(usesTodayWindow("timer")).toBe(true);
    expect(usesTodayWindow("today")).toBe(true);
    expect(usesTodayWindow("calendar")).toBe(false);
  });
});

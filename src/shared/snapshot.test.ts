import { describe, expect, it } from "vitest";
import { applyStateMessage, HEAVY_SNAPSHOT_KEYS, toStatePatch, type AppSnapshot } from "./snapshot";

function state(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "insights",
    statusMessage: "Ready",
    snapshot: { totalSeconds: 60 },
    timelines: [{ id: "macos|Mac" }],
    calendarDayStats: { reviewCount: 0 },
    devices: [{ visibilityKey: "macos|Mac" }],
    dataVersion: 3,
    ...patch,
  } as unknown as AppSnapshot;
}

describe("state patches", () => {
  it("drops heavy fields and keeps the data version", () => {
    const patch = toStatePatch(state());
    for (const key of HEAVY_SNAPSHOT_KEYS) expect(patch).not.toHaveProperty(key);
    expect(patch.reuseData).toBe(true);
    expect(patch.dataVersion).toBe(3);
    expect(patch.statusMessage).toBe("Ready");
  });

  it("reuses the previous heavy objects so memoized views skip work", () => {
    const previous = state();
    const next = applyStateMessage(previous, toStatePatch(state({ statusMessage: "Showing Insights" })));
    expect(next?.statusMessage).toBe("Showing Insights");
    expect(next?.snapshot).toBe(previous.snapshot);
    expect(next?.timelines).toBe(previous.timelines);
    expect(next?.devices).toBe(previous.devices);
    expect(next).not.toHaveProperty("reuseData");
  });

  it("asks for a full state when the patch targets another version", () => {
    expect(applyStateMessage(null, toStatePatch(state()))).toBeNull();
    expect(applyStateMessage(state({ dataVersion: 2 }), toStatePatch(state()))).toBeNull();
  });

  it("passes full states through", () => {
    const full = state();
    expect(applyStateMessage(state({ dataVersion: 1 }), full)).toBe(full);
  });
});

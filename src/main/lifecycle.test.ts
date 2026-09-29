import { describe, expect, it } from "vitest";
import { shouldBlockQuit, shouldHideWindowOnClose, shouldShowWindowOnLaunch } from "./lifecycle";

describe("window close policy", () => {
  it("hides the window while the app is still running", () => {
    expect(shouldHideWindowOnClose(false)).toBe(true);
  });

  it("lets the window close when the user quits", () => {
    expect(shouldHideWindowOnClose(true)).toBe(false);
  });
});

describe("launch visibility", () => {
  it("keeps the window hidden when login starts the app", () => {
    expect(shouldShowWindowOnLaunch(true)).toBe(false);
  });

  it("shows the window on a normal launch", () => {
    expect(shouldShowWindowOnLaunch(false)).toBe(true);
  });
});

describe("quit gating", () => {
  it("blocks only helper-confirmed Strict Mode", () => {
    expect(shouldBlockQuit(true)).toBe(true);
    expect(shouldBlockQuit(false)).toBe(false);
  });
});

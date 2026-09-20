import { describe, expect, it } from "vitest";
import { shouldBlockQuit, shouldHideWindowOnClose } from "./lifecycle";

describe("window close policy", () => {
  it("hides the window while the app is still running", () => {
    expect(shouldHideWindowOnClose(false)).toBe(true);
  });

  it("lets the window close when the user quits", () => {
    expect(shouldHideWindowOnClose(true)).toBe(false);
  });
});

describe("quit gating", () => {
  it("blocks only helper-confirmed Strict Mode", () => {
    expect(shouldBlockQuit(true)).toBe(true);
    expect(shouldBlockQuit(false)).toBe(false);
  });
});

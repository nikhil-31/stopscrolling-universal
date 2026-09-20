import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  systemPreferences: {
    isTrustedAccessibilityClient: vi.fn(() => false),
  },
}));

vi.mock("koffi", () => ({
  default: { load: () => { throw new Error("unused"); } },
}));

import { isAccessibilityGranted, requestAccessibilityAccess } from "./macos-accessibility";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

describe("macOS accessibility trust", () => {
  it("treats non-macOS as granted", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(isAccessibilityGranted(() => false, () => false)).toBe(true);
  });

  it("is granted when AXIsProcessTrusted is already true", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(isAccessibilityGranted(() => true, () => false)).toBe(true);
  });

  it("is granted when Electron already reports trust", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(isAccessibilityGranted(() => null, () => true)).toBe(true);
  });

  it("is not granted when neither check is trusted", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(isAccessibilityGranted(() => false, () => false)).toBe(false);
  });

  it("does not prompt when Accessibility is already granted", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const electron = vi.fn((prompt: boolean) => {
      if (prompt) throw new Error("should not prompt");
      return false;
    });
    expect(requestAccessibilityAccess(() => true, electron, () => false)).toBe(true);
    expect(electron).not.toHaveBeenCalled();
  });

  it("does not prompt when AX APIs already work", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const electron = vi.fn((prompt: boolean) => {
      if (prompt) throw new Error("should not prompt");
      return false;
    });
    expect(requestAccessibilityAccess(() => false, electron, () => true)).toBe(true);
    expect(electron).not.toHaveBeenCalled();
  });

  it("does not prompt when Electron already reports trust", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const electron = vi.fn((prompt: boolean) => {
      if (prompt) throw new Error("should not prompt");
      return !prompt;
    });
    expect(requestAccessibilityAccess(() => false, electron, () => false)).toBe(true);
    expect(electron.mock.calls).toEqual([[false]]);
  });

  it("prompts only after a silent check fails", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const electron = vi.fn((prompt: boolean) => prompt);
    expect(requestAccessibilityAccess(() => false, electron, () => false)).toBe(true);
    expect(electron.mock.calls).toEqual([[false], [true]]);
  });
});

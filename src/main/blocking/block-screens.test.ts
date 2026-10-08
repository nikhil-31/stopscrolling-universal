import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_DETAIL,
  BUILTIN_HEADER,
  importBlockScreenImage,
  listBlockScreenPresets,
  loadBlockScreens,
  resolveBlockScreen,
  saveDefaultBlockScreen,
  saveSessionBlockScreen,
} from "./block-screens";

function dir() {
  return mkdtempSync(join(tmpdir(), "block-screens-"));
}

describe("block screens", () => {
  it("uses the session, then settings, then the built-in page", () => {
    const root = dir();
    writeFileSync(join(root, "tiny.gif"), "gif");
    const imageFile = importBlockScreenImage(root, join(root, "tiny.gif"));
    saveDefaultBlockScreen(root, { imageFile, header: "Focus", detail: "Stay with it." });
    saveSessionBlockScreen(root, "sched-1", { imageFile: "", header: "Deep work", detail: "" });

    const store = loadBlockScreens(root);
    expect(resolveBlockScreen("sched-1", store)).toEqual({
      imageFile,
      header: "Deep work",
      detail: "Stay with it.",
    });
    expect(resolveBlockScreen("sched-2", store)).toEqual({
      imageFile,
      header: "Focus",
      detail: "Stay with it.",
    });
    expect(resolveBlockScreen("sched-3", { default: { imageFile: "", header: "", detail: "" }, sessions: {} })).toEqual({
      imageFile: "",
      header: BUILTIN_HEADER,
      detail: BUILTIN_DETAIL,
    });
  });

  it("clears only the session override", () => {
    const root = dir();
    saveDefaultBlockScreen(root, { imageFile: "", header: "Focus", detail: "Stay with it." });
    saveSessionBlockScreen(root, "sched-1", { imageFile: "", header: "Deep work", detail: "One thing." });
    saveSessionBlockScreen(root, "sched-1", { imageFile: "", header: "", detail: "" });
    const store = loadBlockScreens(root);
    expect(store.sessions["sched-1"]).toBeUndefined();
    expect(resolveBlockScreen("sched-1", store).header).toBe("Focus");
  });

  it("keeps a built-in image choice", () => {
    const names = listBlockScreenPresets().map((item) => item.file);
    expect(names).toContain("pulse.gif");
    const root = dir();
    saveDefaultBlockScreen(root, { imageFile: "preset:pulse.gif", header: "", detail: "" });
    expect(loadBlockScreens(root).default.imageFile).toBe("preset:pulse.gif");
  });
});

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leadingMenuBarPosition, preferredPositionsFromPlist } from "./menu-bar-order";

describe("menu bar position", () => {
  it("uses the leading edge when nothing else is on the menu bar", () => {
    expect(leadingMenuBarPosition([])).toBe(0);
  });

  it("sits to the left of Rize and other extras", () => {
    expect(leadingMenuBarPosition([267, 412])).toBe(227);
    expect(leadingMenuBarPosition([40, 412])).toBe(0);
  });

  it("ignores Stop Scrolling's own saved position", () => {
    expect(preferredPositionsFromPlist({
      "NSStatusItem Preferred Position Item-0": 412,
      "NSStatusItem Preferred Position StopScrolling": 900,
      "NSStatusItem Visible Item-0": true,
    })).toEqual([412]);
  });
});

describe("status bar icon", () => {
  it("ships a template image for the menu bar", () => {
    const dir = resolve(__dirname, "../../resources");
    expect(existsSync(resolve(dir, "trayTemplate.png"))).toBe(true);
    expect(existsSync(resolve(dir, "trayTemplate@2x.png"))).toBe(true);
  });
});

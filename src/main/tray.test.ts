import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("status bar icon", () => {
  it("ships a template image for the menu bar", () => {
    const dir = resolve(__dirname, "../../resources");
    expect(existsSync(resolve(dir, "trayTemplate.png"))).toBe(true);
    expect(existsSync(resolve(dir, "trayTemplate@2x.png"))).toBe(true);
  });
});

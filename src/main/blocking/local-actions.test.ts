import { describe, expect, it } from "vitest";
import { blockedTabScript } from "./local-actions";

describe("blocked tab script", () => {
  const page = "http://127.0.0.1:43123/";

  it("points Safari, Chrome, and Firefox at the freedom page", () => {
    expect(blockedTabScript("safari", "Safari", page)).toBe(
      `tell application "Safari" to set URL of current tab of front window to "${page}"`,
    );
    expect(blockedTabScript("chromium", "Google Chrome", page)).toContain(`to "${page}"`);
    expect(blockedTabScript("firefox", "Firefox", page)).toBe(
      `tell application "Firefox" to set URL of active tab of front window to "${page}"`,
    );
    expect(blockedTabScript("firefox", "Firefox", page)).not.toContain("close active tab");
  });
});

import { describe, expect, it } from "vitest";
import { resolveCategory } from "./categories";
import {
  acceptedJevCategory,
  jevCategoryRequest,
  jevClassificationState,
  overlayCategory,
  parseJevChoice,
} from "./jev";

describe("Jev classification schema", () => {
  it("sends hostname, app name, and bundle ID without the URL or title", () => {
    const state = jevClassificationState({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      url: "https://www.teamblind.com/post?token=secret",
    });
    expect(state).toEqual({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      host: "teamblind.com",
    });
    expect(JSON.stringify(state)).not.toContain("token=secret");
    expect(JSON.stringify(jevCategoryRequest(state))).not.toContain("Web");
    expect(JSON.stringify(jevCategoryRequest(state))).not.toContain("Application");
  });

  it("accepts a confident in-taxonomy choice and ignores low-confidence or unknown labels", () => {
    expect(acceptedJevCategory("Social", 0.92)).toBe("Social");
    expect(acceptedJevCategory("Social", 0.79)).toBeNull();
    expect(acceptedJevCategory("Web", 0.99)).toBeNull();
    expect(acceptedJevCategory("Games", 0.99)).toBeNull();
  });

  it("parses a Choice answer from the System One payload", () => {
    expect(
      parseJevChoice({
        model: "jev-1.13.0",
        answers: {
          category: { type: "choice", choice: "Social", confidence: 0.95 },
        },
      }),
    ).toEqual({ choice: "Social", confidence: 0.95, model: "jev-1.13.0" });
    expect(parseJevChoice({})).toBeNull();
  });

  it("overlays only unresolved categories when the cache is confident", () => {
    const cache = {
      "web|teamblind.com": { category: "Social", confidence: 0.92, model: "jev-1.13.0", at: "2026-09-20T00:00:00.000Z" },
      "web|example.com": { category: "Social", confidence: 0.4, model: "jev-1.13.0", at: "2026-09-20T00:00:00.000Z" },
    };
    expect(overlayCategory("Web", "web|teamblind.com", cache)).toBe("Social");
    expect(overlayCategory("Web", "web|example.com", cache)).toBe("Web");
    expect(overlayCategory("Development", "web|teamblind.com", cache)).toBe("Development");
    expect(resolveCategory("com.google.Chrome", "https://github.com/stopscrolling", "GitHub")).toBe("Development");
  });
});

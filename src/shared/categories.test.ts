import { resolveCategory } from "./categories";
import { describe, expect, it } from "vitest";

describe("category resolver", () => {
  it("classifies known bundles, domains, and browsers", () => {
    expect(resolveCategory("com.microsoft.VSCode", "", "")).toBe("Development");
    expect(resolveCategory("com.google.Chrome", "https://github.com/stopscrolling", "GitHub")).toBe("Development");
    expect(resolveCategory("com.google.Chrome", "https://example.com", "Example")).toBe("Web");
    expect(resolveCategory("com.apple.finder", "", "")).toBe("Utilities");
  });
});

import { describe, expect, it } from "vitest";
import { freedomPageUrl } from "./freedom-page";

describe("freedom page", () => {
  it("serves the free screen on loopback", async () => {
    const url = await freedomPageUrl();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const response = await fetch(url);
    const html = await response.text();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("You are free.");
    expect(html).toContain("Do what matters.");
    expect(html).toContain("Stop Scrolling");
    expect(html).toContain("#3e648c");
    expect(html).toContain("data:image/png;base64,");
  });
});
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { freedomPageUrl, setBlockScreenMediaRoot, setFreedomContent } from "./freedom-page";

describe("freedom page", () => {
  it("serves the free screen on loopback", async () => {
    setFreedomContent({ header: "You are free.", detail: "Do what matters.", imagePath: "" });
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

  it("serves a session header and its image", async () => {
    const root = mkdtempSync(join(tmpdir(), "freedom-media-"));
    const images = join(root, "images");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(images, { recursive: true });
    const imagePath = join(images, "mark.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    setBlockScreenMediaRoot(root);
    setFreedomContent({
      header: "Deep work",
      detail: "One thing at a time.",
      imagePath,
    });
    const url = await freedomPageUrl();
    const html = await (await fetch(url)).text();
    expect(html).toContain("Deep work");
    expect(html).toContain("One thing at a time.");
    expect(html).toContain('src="/media"');
    const media = await fetch(`${url}media/mark.png`);
    expect(media.headers.get("content-type")).toContain("image/png");
    expect(media.ok).toBe(true);
  });
});
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JEV_ENDPOINT } from "@shared/jev";
import { JevClassifier } from "./jev-classifier";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("JevClassifier", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
    vi.restoreAllMocks();
  });

  function cachePath() {
    const dir = mkdtempSync(join(tmpdir(), "jev-cache-"));
    dirs.push(dir);
    return join(dir, "jev-categories.json");
  }

  it("caches a confident Choice and coalesces duplicate in-flight keys", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({
        model: "jev-1.13.0",
        answers: { category: { type: "choice", choice: "Social", confidence: 0.94 } },
      }),
    );
    const onResolved = vi.fn();
    const path = cachePath();
    const classifier = new JevClassifier({
      getApiKey: () => "test-key",
      cachePath: path,
      fetch,
      now: () => new Date("2026-09-20T00:00:00.000Z"),
      onResolved,
    });
    const input = {
      key: "web|teamblind.com",
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      url: "https://www.teamblind.com/post?token=secret",
    };
    classifier.enqueue(input);
    classifier.enqueue(input);
    await vi.waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(JEV_ENDPOINT);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.state).toEqual({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      host: "teamblind.com",
    });
    expect(classifier.lookup("web|teamblind.com")?.category).toBe("Social");
    expect(JSON.parse(readFileSync(path, "utf8"))["web|teamblind.com"].category).toBe("Social");
  });

  it("does not notify on low-confidence answers and skips the API when the key is missing", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({
        answers: { category: { type: "choice", choice: "Social", confidence: 0.4 } },
      }),
    );
    const onResolved = vi.fn();
    const withKey = new JevClassifier({
      getApiKey: () => "test-key",
      cachePath: cachePath(),
      fetch,
      onResolved,
    });
    withKey.enqueue({
      key: "web|example.com",
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      url: "https://example.com",
    });
    await vi.waitFor(() => expect(withKey.lookup("web|example.com")?.confidence).toBe(0.4));
    expect(onResolved).not.toHaveBeenCalled();

    const unusedFetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
    const withoutKey = new JevClassifier({
      getApiKey: () => null,
      cachePath: cachePath(),
      fetch: unusedFetch,
    });
    withoutKey.enqueue({
      key: "app|Valorant",
      appName: "VALORANT",
      bundleID: "com.riotgames.valorant",
      url: "",
    });
    expect(unusedFetch).not.toHaveBeenCalled();
  });

  it("does not retry immediately after a network failure", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => {
      throw new Error("offline");
    });
    const classifier = new JevClassifier({
      getApiKey: () => "test-key",
      cachePath: cachePath(),
      fetch,
      cooldownMs: 60_000,
      now: () => new Date("2026-09-20T00:00:00.000Z"),
    });
    const input = { key: "app|Valorant", appName: "VALORANT", bundleID: "com.riotgames.valorant", url: "" };
    classifier.enqueue(input);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    classifier.enqueue(input);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

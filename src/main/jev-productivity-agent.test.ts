import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JEV_ENDPOINT } from "@shared/jev";
import { JevProductivityAgent, type ProductivityInput } from "./jev-productivity-agent";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function answer(choice: string, confidence = 0.94) {
  return { model: "jev-1.13.0", answers: { productivity: { type: "choice", choice, confidence } } };
}

describe("JevProductivityAgent", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
    vi.restoreAllMocks();
  });

  function cachePath() {
    const dir = mkdtempSync(join(tmpdir(), "jev-productivity-"));
    dirs.push(dir);
    return join(dir, "jev-productivity.json");
  }

  function input(patch: Partial<ProductivityInput> = {}): ProductivityInput {
    return {
      key: "web|youtube.com#Intro to Rust",
      breakdownKey: "web|youtube.com",
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      url: "https://www.youtube.com/watch?v=1&token=secret",
      title: "Intro to Rust",
      category: "Video",
      ...patch,
    };
  }

  it("caches a confident verdict and coalesces duplicate keys", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => jsonResponse(answer("Productive")));
    const onResolved = vi.fn();
    const path = cachePath();
    const agent = new JevProductivityAgent({
      getApiKey: () => "test-key",
      cachePath: path,
      fetch,
      now: () => new Date("2026-09-20T00:00:00.000Z"),
      onResolved,
    });
    agent.enqueue(input());
    agent.enqueue(input());
    await vi.waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(JEV_ENDPOINT);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.state).toEqual({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      host: "youtube.com",
      title: "Intro to Rust",
      category: "Video",
    });
    expect(JSON.stringify(body)).not.toContain("token=secret");
    expect(agent.lookup(input().key)?.verdict).toBe("Productive");
    expect(JSON.parse(readFileSync(path, "utf8"))[input().key].source).toBe("jev");
  });

  it("skips the API without a key and does not retry inside the cooldown", async () => {
    const unused = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
    const withoutKey = new JevProductivityAgent({ getApiKey: () => null, cachePath: cachePath(), fetch: unused });
    withoutKey.enqueue(input());
    expect(unused).not.toHaveBeenCalled();

    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => {
      throw new Error("offline");
    });
    const agent = new JevProductivityAgent({
      getApiKey: () => "test-key",
      cachePath: cachePath(),
      fetch,
      cooldownMs: 60_000,
      now: () => new Date("2026-09-20T00:00:00.000Z"),
    });
    agent.enqueue(input());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    agent.enqueue(input());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps at most the configured number running and stops at the daily cap", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => {
      await gate;
      return jsonResponse(answer("Neutral"));
    });
    const agent = new JevProductivityAgent({
      getApiKey: () => "test-key",
      cachePath: cachePath(),
      fetch,
      concurrency: 2,
      dailyCap: 3,
    });
    for (const key of ["a", "b", "c", "d"]) agent.enqueue(input({ key, title: key }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    release();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(agent.lookup("d")).toBeUndefined();
  });

  it("never overwrites a verdict you set yourself", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const agent = new JevProductivityAgent({ getApiKey: () => "test-key", cachePath: cachePath(), fetch });
    const rated = input();
    agent.enqueue(rated);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    agent.override(rated.key, "Productive");
    resolveFetch(jsonResponse(answer("Distracting")));
    await vi.waitFor(() => expect(agent.lookup(rated.key)?.verdict).toBe("Productive"));
    expect(agent.lookup(rated.key)?.source).toBe("user");

    agent.enqueue(rated);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("omits the title when titles are disabled", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => jsonResponse(answer("Neutral")));
    const agent = new JevProductivityAgent({ getApiKey: () => "test-key", cachePath: cachePath(), fetch });
    agent.enqueue(input({ key: "web|youtube.com", sendTitle: false }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.state.title).toBe("");
    expect(body.state.host).toBe("youtube.com");
  });

  it("falls back to the most common verdict for the same site", () => {
    const agent = new JevProductivityAgent({ getApiKey: () => null, cachePath: cachePath() });
    agent.override("web|youtube.com#One", "Distracting");
    agent.override("web|youtube.com#Two", "Distracting");
    agent.override("web|youtube.com#Three", "Productive");
    expect(agent.verdictFor("web|youtube.com", "web|youtube.com#Unseen")?.verdict).toBe("Distracting");
    expect(agent.verdictFor("web|youtube.com", "web|youtube.com#One")?.source).toBe("user");
  });

  it("reports progress while reviewing", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => jsonResponse(answer("Productive")));
    const agent = new JevProductivityAgent({ getApiKey: () => "test-key", cachePath: cachePath(), fetch });
    const pending = agent.reviewAll([input({ key: "a" }), input({ key: "b" })]);
    expect(agent.reviewing).toBe(true);
    expect(agent.progress.total).toBe(2);
    await pending;
    expect(agent.reviewing).toBe(false);
    expect(agent.progress.done).toBe(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { JevProductivityAgent, type ProductivityInput } from "./jev-productivity-agent";
import type { JevRatingKind, JevRatingRequestItem, JevServerRating } from "./jev-ratings";

vi.mock("./logger", () => ({ logObservability: vi.fn() }));

function input(key = "web|youtube.com#Intro to Rust", patch: Partial<ProductivityInput> = {}): ProductivityInput {
  return {
    key,
    breakdownKey: key.split("#")[0],
    appName: "Google Chrome",
    bundleID: "com.google.Chrome",
    url: "https://www.youtube.com/watch?v=1&token=secret",
    title: "Intro to Rust",
    category: "Video",
    sendTitle: true,
    ...patch,
  };
}

function rating(key: string, patch: Partial<JevServerRating> = {}): JevServerRating {
  return {
    key,
    breakdown_key: key.split("#")[0],
    status: "ready",
    value: "Productive",
    confidence: 0.9,
    model: "jev-latest",
    source: "jev",
    rated_at: "2026-10-27T09:00:00.000Z",
    ...patch,
  };
}

function fakeApi(answer: (item: JevRatingRequestItem) => JevServerRating = (item) => rating(item.key)) {
  const calls: Array<{ kind: JevRatingKind; priority: string; items: JevRatingRequestItem[] }> = [];
  const api = {
    calls,
    requestJevRatings: vi.fn(async (kind: JevRatingKind, priority: "live" | "background", items: JevRatingRequestItem[]) => {
      calls.push({ kind, priority, items });
      return { enabled: true, ratings: items.map(answer) };
    }),
    overrideJevVerdict: vi.fn(async (key: string) => rating(key, { source: "user", value: "Productive" })),
  };
  return api;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("JevProductivityAgent", () => {
  it("asks the server for the app in front and keeps the verdict in memory", async () => {
    const api = fakeApi();
    const onResolved = vi.fn();
    const agent = new JevProductivityAgent({ api, enabled: () => true, onResolved });
    agent.enqueueLive(input());
    await flush();
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({ kind: "productivity", priority: "live" });
    expect(api.calls[0].items[0]).toEqual({
      key: "web|youtube.com#Intro to Rust",
      breakdown_key: "web|youtube.com",
      app_name: "Google Chrome",
      bundle_id: "com.google.Chrome",
      host: "youtube.com",
      title: "Intro to Rust",
      category: "Video",
    });
    expect(agent.lookup("web|youtube.com#Intro to Rust")?.verdict).toBe("Productive");
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("sends nothing while signed out", async () => {
    const api = fakeApi();
    const agent = new JevProductivityAgent({ api, enabled: () => false });
    agent.enqueueLive(input());
    agent.enqueueBackground([input("app|Notes")]);
    await flush();
    expect(api.requestJevRatings).not.toHaveBeenCalled();
  });

  it("does not resend a key the server is still rating", async () => {
    const api = fakeApi((item) => rating(item.key, { status: "pending", value: "", confidence: null }));
    let now = Date.parse("2026-10-27T09:00:00.000Z");
    const agent = new JevProductivityAgent({ api, enabled: () => true, now: () => new Date(now), resendMs: 60_000 });
    agent.enqueueBackground([input("app|A"), input("app|B")]);
    await flush();
    agent.enqueueBackground([input("app|A"), input("app|B")]);
    agent.enqueueLive(input("app|A"));
    await flush();
    expect(api.requestJevRatings).toHaveBeenCalledTimes(1);
    expect(agent.cache).toEqual({});
    now += 61_000;
    agent.enqueueBackground([input("app|A")]);
    await flush();
    expect(api.requestJevRatings).toHaveBeenCalledTimes(2);
  });

  it("sends period titles in one background batch and skips rated ones", async () => {
    const api = fakeApi();
    const agent = new JevProductivityAgent({ api, enabled: () => true });
    agent.hydrate({ "app|Done": { verdict: "Neutral", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" } });
    agent.enqueueBackground([input("app|A"), input("app|Done"), input("app|B")]);
    await flush();
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].priority).toBe("background");
    expect(api.calls[0].items.map((item) => item.key)).toEqual(["app|A", "app|B"]);
  });

  it("omits the title when titles are disabled", async () => {
    const api = fakeApi();
    const agent = new JevProductivityAgent({ api, enabled: () => true });
    agent.enqueueLive(input("web|youtube.com", { title: "Secret", sendTitle: false }));
    await flush();
    expect(api.calls[0].items[0].title).toBe("");
  });

  it("retries a key after the request fails", async () => {
    const api = fakeApi();
    api.requestJevRatings.mockRejectedValueOnce(new Error("offline"));
    const agent = new JevProductivityAgent({ api, enabled: () => true });
    agent.enqueueLive(input());
    await flush();
    agent.enqueueLive(input());
    await flush();
    expect(api.requestJevRatings).toHaveBeenCalledTimes(2);
    expect(agent.lookup(input().key)).toBeDefined();
  });

  it("shows your override at once and saves it to the server", async () => {
    const api = fakeApi();
    const agent = new JevProductivityAgent({ api, enabled: () => true });
    agent.override("web|youtube.com#Intro to Rust", "Productive");
    expect(agent.lookup("web|youtube.com#Intro to Rust")).toMatchObject({ verdict: "Productive", source: "user" });
    await flush();
    expect(api.overrideJevVerdict).toHaveBeenCalledWith("web|youtube.com#Intro to Rust", "web|youtube.com", "Productive");
  });

  it("puts the previous verdict back when the server rejects an override", async () => {
    const api = fakeApi();
    api.overrideJevVerdict.mockRejectedValueOnce(new Error("offline"));
    const agent = new JevProductivityAgent({ api, enabled: () => true });
    const previous = { verdict: "Distracting", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" as const };
    agent.hydrate({ "app|Notes": previous });
    agent.override("app|Notes", "Productive");
    await flush();
    expect(agent.lookup("app|Notes")).toEqual(previous);
  });

  it("never replaces your own verdict with a Jev answer", async () => {
    const api = fakeApi((item) => rating(item.key, { value: "Distracting" }));
    const agent = new JevProductivityAgent({ api, enabled: () => true });
    agent.hydrate({ "app|Notes": { verdict: "Productive", confidence: 1, model: "user", at: "x", source: "user" } });
    agent.enqueueLive(input("app|Notes"));
    await flush();
    expect(api.requestJevRatings).not.toHaveBeenCalled();
    expect(agent.lookup("app|Notes")?.verdict).toBe("Productive");
  });

  it("falls back to the most common verdict for the same site", () => {
    const agent = new JevProductivityAgent({ api: fakeApi(), enabled: () => true });
    agent.hydrate({
      "web|youtube.com#A": { verdict: "Distracting", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" },
      "web|youtube.com#B": { verdict: "Distracting", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" },
    });
    expect(agent.verdictFor("web|youtube.com", "web|youtube.com#C")?.verdict).toBe("Distracting");
  });

  it("forgets everything when cleared", async () => {
    const agent = new JevProductivityAgent({ api: fakeApi(), enabled: () => true });
    agent.hydrate({ "app|Notes": { verdict: "Neutral", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" } });
    agent.clear();
    expect(agent.cache).toEqual({});
  });

  it("reviews titles and waits for the server to finish rating them", async () => {
    const api = fakeApi((item) => rating(item.key, { status: "pending", value: "", confidence: null }));
    let refreshes = 0;
    const agent: JevProductivityAgent = new JevProductivityAgent({
      api,
      enabled: () => true,
      wait: async () => {},
      refresh: async () => {
        refreshes += 1;
        agent.hydrate({ [`app|${refreshes === 1 ? "A" : "B"}`]: { verdict: "Neutral", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" } });
      },
    });
    const review = agent.reviewAll([input("app|A"), input("app|B")]);
    expect(agent.reviewing).toBe(true);
    await review;
    expect(refreshes).toBe(2);
    expect(agent.progress).toEqual({ done: 2, total: 2 });
    expect(agent.reviewing).toBe(false);
  });
});

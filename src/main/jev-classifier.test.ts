import { describe, expect, it, vi } from "vitest";
import { JevClassifier } from "./jev-classifier";
import type { JevRatingKind, JevRatingRequestItem, JevServerRating } from "./jev-ratings";

vi.mock("./logger", () => ({ logObservability: vi.fn() }));

function rating(key: string, patch: Partial<JevServerRating> = {}): JevServerRating {
  return {
    key,
    breakdown_key: key,
    status: "ready",
    value: "Social",
    confidence: 0.92,
    model: "jev-latest",
    source: "jev",
    rated_at: "2026-10-27T09:00:00.000Z",
    ...patch,
  };
}

function fakeApi(answer: (item: JevRatingRequestItem) => JevServerRating = (item) => rating(item.key)) {
  return {
    requestJevRatings: vi.fn(async (_kind: JevRatingKind, _priority: "live" | "background", items: JevRatingRequestItem[]) => ({
      enabled: true,
      ratings: items.map(answer),
    })),
    overrideJevVerdict: vi.fn(),
  };
}

const input = { key: "web|teamblind.com", appName: "Google Chrome", bundleID: "com.google.Chrome", url: "https://www.teamblind.com/post?token=secret" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("JevClassifier", () => {
  it("asks the server for a category with the hostname only", async () => {
    const api = fakeApi();
    const onResolved = vi.fn();
    const classifier = new JevClassifier({ api, enabled: () => true, onResolved });
    classifier.enqueue(input);
    classifier.enqueue(input);
    await flush();
    expect(api.requestJevRatings).toHaveBeenCalledTimes(1);
    const [kind, priority, items] = api.requestJevRatings.mock.calls[0];
    expect([kind, priority]).toEqual(["category", "live"]);
    expect(items[0]).toMatchObject({ key: "web|teamblind.com", host: "teamblind.com", title: "" });
    expect(JSON.stringify(items)).not.toContain("token=secret");
    expect(classifier.lookup("web|teamblind.com")?.category).toBe("Social");
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("keeps a low-confidence answer without acting on it", async () => {
    const onResolved = vi.fn();
    const classifier = new JevClassifier({
      api: fakeApi((item) => rating(item.key, { confidence: 0.4 })),
      enabled: () => true,
      onResolved,
    });
    classifier.enqueue(input);
    await flush();
    expect(classifier.lookup("web|teamblind.com")?.confidence).toBe(0.4);
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("sends nothing while signed out", async () => {
    const api = fakeApi();
    new JevClassifier({ api, enabled: () => false }).enqueue(input);
    await flush();
    expect(api.requestJevRatings).not.toHaveBeenCalled();
  });

  it("asks again after a failed request but not while the server is still working", async () => {
    const api = fakeApi((item) => rating(item.key, { status: "pending", value: "", confidence: null }));
    api.requestJevRatings.mockRejectedValueOnce(new Error("offline"));
    const classifier = new JevClassifier({ api, enabled: () => true });
    classifier.enqueue(input);
    await flush();
    classifier.enqueue(input);
    await flush();
    classifier.enqueue(input);
    await flush();
    expect(api.requestJevRatings).toHaveBeenCalledTimes(2);
  });

  it("loads categories from the server and notifies for confident ones", () => {
    const onResolved = vi.fn();
    const classifier = new JevClassifier({ api: fakeApi(), enabled: () => true, onResolved });
    classifier.hydrate({
      "app|Steam": { category: "Gaming", confidence: 0.95, model: "jev-latest", at: "x" },
      "app|Odd": { category: "Gaming", confidence: 0.3, model: "jev-latest", at: "x" },
    });
    expect(Object.keys(classifier.cache)).toEqual(["app|Steam", "app|Odd"]);
    expect(onResolved).toHaveBeenCalledTimes(1);
    classifier.clear();
    expect(classifier.cache).toEqual({});
  });
});

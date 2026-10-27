import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JevRatingsSync, migrateLocalJevRatings, type JevRatingsResponse, type JevServerRating } from "./jev-ratings";
import { clearTypesafeApiKey } from "./typesafe-key-store";

vi.mock("./logger", () => ({ logObservability: vi.fn() }));
vi.mock("./typesafe-key-store", () => ({ clearTypesafeApiKey: vi.fn() }));
vi.mock("./paths", () => ({ jevCategoriesPath: () => "", jevProductivityPath: () => "" }));

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

function row(key: string, patch: Partial<JevServerRating> = {}): JevServerRating {
  return {
    key,
    breakdown_key: key,
    status: "ready",
    value: "Neutral",
    confidence: 0.9,
    model: "jev-latest",
    source: "jev",
    rated_at: "2026-10-27T09:00:00.000Z",
    ...patch,
  };
}

function sinks() {
  return {
    productivity: { hydrate: vi.fn(), clear: vi.fn() },
    categories: { hydrate: vi.fn(), clear: vi.fn() },
  };
}

describe("JevRatingsSync", () => {
  it("loads everything first, then only what changed since the last server time", async () => {
    const responses: JevRatingsResponse[] = [
      { enabled: true, server_time: "T1", productivity: [row("app|Notes")], categories: [row("app|Steam", { value: "Gaming" })] },
      { enabled: true, server_time: "T2", productivity: [], categories: [] },
    ];
    const api = { jevRatings: vi.fn(async () => responses.shift()!) };
    const { productivity, categories } = sinks();
    const sync = new JevRatingsSync(api, productivity, categories);

    await sync.pull();
    await sync.pull();

    expect(api.jevRatings.mock.calls).toEqual([[null], ["T1"]]);
    expect(sync.enabled).toBe(true);
    expect(productivity.hydrate).toHaveBeenNthCalledWith(1, {
      "app|Notes": { verdict: "Neutral", confidence: 0.9, model: "jev-latest", at: "2026-10-27T09:00:00.000Z", source: "jev" },
    });
    expect(categories.hydrate).toHaveBeenNthCalledWith(1, {
      "app|Steam": { category: "Gaming", confidence: 0.9, model: "jev-latest", at: "2026-10-27T09:00:00.000Z" },
    });
  });

  it("starts over and clears both caches after sign-out", async () => {
    const api = { jevRatings: vi.fn(async () => ({ enabled: true, server_time: "T1", productivity: [], categories: [] })) };
    const { productivity, categories } = sinks();
    const sync = new JevRatingsSync(api, productivity, categories);
    await sync.pull();
    sync.reset();
    await sync.pull();
    expect(api.jevRatings.mock.calls).toEqual([[null], [null]]);
    expect(productivity.clear).toHaveBeenCalled();
    expect(categories.clear).toHaveBeenCalled();
  });
});

describe("migrateLocalJevRatings", () => {
  function files() {
    const directory = mkdtempSync(join(tmpdir(), "jev-migrate-"));
    directories.push(directory);
    return { productivity: join(directory, "jev-productivity.json"), categories: join(directory, "jev-categories.json") };
  }

  it("uploads saved ratings, then removes the files and the old API key", async () => {
    const paths = files();
    writeFileSync(paths.productivity, JSON.stringify({ "app|Notes": { verdict: "Productive", confidence: 1, model: "user", at: "x", source: "user" } }));
    writeFileSync(paths.categories, JSON.stringify({ "app|Steam": { category: "Gaming", confidence: 0.95, model: "jev-latest", at: "x" } }));
    const api = { importJevRatings: vi.fn(async () => ({})) };

    expect(await migrateLocalJevRatings(api, paths)).toBe(true);

    expect(api.importJevRatings).toHaveBeenCalledWith({
      productivity: { "app|Notes": { verdict: "Productive", confidence: 1, model: "user", at: "x", source: "user" } },
      categories: { "app|Steam": { category: "Gaming", confidence: 0.95, model: "jev-latest", at: "x" } },
    });
    expect(existsSync(paths.productivity)).toBe(false);
    expect(existsSync(paths.categories)).toBe(false);
    expect(clearTypesafeApiKey).toHaveBeenCalled();
  });

  it("keeps the files when the upload fails so it can try again", async () => {
    const paths = files();
    writeFileSync(paths.productivity, JSON.stringify({ "app|Notes": { verdict: "Neutral", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" } }));
    const api = { importJevRatings: vi.fn(async () => Promise.reject(new Error("offline"))) };

    expect(await migrateLocalJevRatings(api, paths)).toBe(false);
    expect(existsSync(paths.productivity)).toBe(true);
    expect(clearTypesafeApiKey).not.toHaveBeenCalled();
  });

  it("uploads a large history in batches and deletes the files only after all succeed", async () => {
    const paths = files();
    const many: Record<string, unknown> = {};
    for (let index = 0; index < 2500; index += 1) {
      many[`app|App ${index}`] = { verdict: "Neutral", confidence: 0.9, model: "jev-latest", at: "x", source: "jev" };
    }
    writeFileSync(paths.productivity, JSON.stringify(many));
    writeFileSync(paths.categories, JSON.stringify({ "app|Steam": { category: "Gaming", confidence: 0.95, model: "jev-latest", at: "x" } }));
    type Batch = { productivity: Record<string, unknown>; categories: Record<string, unknown> };
    const api = { importJevRatings: vi.fn(async (_batch: Batch) => ({})) };

    expect(await migrateLocalJevRatings(api, paths)).toBe(true);

    const sizes = api.importJevRatings.mock.calls.map(([batch]) =>
      Object.keys(batch.productivity).length + Object.keys(batch.categories).length);
    expect(sizes).toEqual([1000, 1000, 501]);
    expect(api.importJevRatings.mock.calls[2][0].categories).toHaveProperty("app|Steam");
    expect(existsSync(paths.productivity)).toBe(false);
  });

  it("skips the upload when there is nothing saved", async () => {
    const api = { importJevRatings: vi.fn() };
    expect(await migrateLocalJevRatings(api, files())).toBe(true);
    expect(api.importJevRatings).not.toHaveBeenCalled();
  });
});

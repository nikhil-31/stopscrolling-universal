import { describe, expect, it } from "vitest";
import { JEV_MODEL } from "./jev";
import {
  buildAgentView,
  ensureLiveEntryVisible,
  focusVerdictForSegment,
  jevProductivityRequest,
  normalizeTitle,
  parseJevProductivity,
  classifiesFocus,
  productivityBreakdown,
  productivityInputsFromSegments,
  productivityKey,
  stampSegmentVerdicts,
  type ProductivityCache,
} from "./jev-productivity";
import { snapshotFromEntries } from "./timeline";
import type { ScreenTimeEntry } from "./types";
import type { ScreenTimeTimelineSegment } from "./types";

function segment(patch: Partial<ScreenTimeTimelineSegment>): ScreenTimeTimelineSegment {
  return {
    id: "segment",
    start: "2026-09-20T09:00:00.000Z",
    end: "2026-09-20T10:00:00.000Z",
    label: "Untitled",
    subtitle: "",
    url: "",
    bundleID: "com.google.Chrome",
    category: "Web",
    appName: "Google Chrome",
    devicePlatform: "macos",
    deviceName: "Mac",
    timeZoneIdentifier: "UTC",
    isLive: false,
    ...patch,
  };
}

const meta = { reviewing: false, progress: { done: 0, total: 0 }, keyConfigured: true };

describe("productivity titles", () => {
  it("normalizes counters, browser suffixes, and whitespace", () => {
    expect(normalizeTitle("  (3) Intro to Rust - YouTube  ")).toBe("Intro to Rust");
    expect(normalizeTitle("(12) Inbox (4) - Google Chrome")).toBe("Inbox (4)");
    expect(normalizeTitle("a  b")).toBe("a b");
  });

  it("keys a title under its app or site and falls back when the title is empty", () => {
    expect(productivityKey("web|youtube.com", "(2) Intro to Rust - YouTube")).toBe("web|youtube.com#Intro to Rust");
    expect(productivityKey("app|Slack", "   ")).toBe("app|Slack");
  });

  it("sends the title and category but never the URL path or token", () => {
    const request = jevProductivityRequest({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      host: "youtube.com",
      title: "Intro to Rust",
      category: "Video",
    });
    expect(request.model).toBe(JEV_MODEL);
    expect(request.state).toEqual({
      appName: "Google Chrome",
      bundleID: "com.google.Chrome",
      host: "youtube.com",
      title: "Intro to Rust",
      category: "Video",
    });
    expect(JSON.stringify(request)).not.toContain("token=secret");
    expect(request.questions.productivity.type).toBe("choice");
  });

  it("parses the productivity answer", () => {
    expect(
      parseJevProductivity({
        model: "jev-1.13.0",
        answers: { productivity: { type: "choice", choice: "Distracting", confidence: 0.91 } },
      }),
    ).toEqual({ choice: "Distracting", confidence: 0.91, model: "jev-1.13.0" });
    expect(parseJevProductivity({ answers: { category: { choice: "Video", confidence: 0.9 } } })).toBeNull();
  });
});

describe("live entries", () => {
  function entry(source: ScreenTimeEntry["source"], start: string, end: string): ScreenTimeEntry {
    return {
      id: "entry",
      startTimeUTC: start,
      endTimeUTC: end,
      title: "Chrome",
      url: "https://youtube.com",
      bundleID: "com.google.Chrome",
      appName: "Google Chrome",
      category: "Video",
      platform: "macos",
      deviceName: "Mac",
      timeZoneIdentifier: "UTC",
      source,
    };
  }

  it("keeps a session that just started visible and leaves finished entries alone", () => {
    const live = entry("live", "2026-09-20T12:00:00.000Z", "2026-09-20T12:00:00.000Z");
    const done = entry("local", "2026-09-20T11:00:00.000Z", "2026-09-20T11:00:00.000Z");
    const grown = entry("live", "2026-09-20T12:00:00.000Z", "2026-09-20T12:05:00.000Z");
    const [visibleLive, visibleDone, visibleGrown] = ensureLiveEntryVisible([live, done, grown]);
    expect(Date.parse(visibleLive.endTimeUTC) - Date.parse(visibleLive.startTimeUTC)).toBe(1000);
    expect(visibleDone).toBe(done);
    expect(visibleGrown).toBe(grown);
  });
});

describe("productivity inputs", () => {
  const cache: ProductivityCache = {
    "app|Notes#Scratch": { verdict: "Productive", confidence: 1, model: "user", at: "2026-09-20T09:00:00.000Z", source: "user" },
  };

  it("skips cached titles and orders the rest newest first", () => {
    const inputs = productivityInputsFromSegments(
      [
        segment({ id: "old", appName: "Cursor", label: "main.ts", url: "", start: "2026-09-20T08:00:00.000Z", end: "2026-09-20T09:00:00.000Z" }),
        segment({ id: "notes", appName: "Notes", label: "Scratch", url: "", start: "2026-09-20T09:00:00.000Z", end: "2026-09-20T10:00:00.000Z" }),
        segment({ id: "new", appName: "Cursor", label: "app.ts", url: "", start: "2026-09-20T10:00:00.000Z", end: "2026-09-20T11:00:00.000Z" }),
      ],
      { sendTitles: true, cache },
    );
    expect(inputs.map((input) => input.title)).toEqual(["app.ts", "main.ts"]);
    expect(inputs[0]?.key).toBe("app|Cursor#app.ts");
    expect(inputs.every((input) => input.sendTitle)).toBe(true);
  });

  it("rates the app once when titles are off", () => {
    const inputs = productivityInputsFromSegments(
      [
        segment({ id: "one", appName: "Cursor", label: "main.ts", url: "", end: "2026-09-20T09:00:00.000Z" }),
        segment({ id: "two", appName: "Cursor", label: "app.ts", url: "", start: "2026-09-20T09:00:00.000Z", end: "2026-09-20T10:00:00.000Z" }),
      ],
      { sendTitles: false },
    );
    expect(inputs).toEqual([
      expect.objectContaining({ key: "app|Cursor", title: "", sendTitle: false }),
    ]);
  });

  it("classifies the period shown on Today and Insights", () => {
    expect(classifiesFocus("today")).toBe(true);
    expect(classifiesFocus("insights")).toBe(true);
    expect(classifiesFocus("agent")).toBe(false);
    expect(classifiesFocus("calendar")).toBe(false);
  });
});

describe("productivity breakdown", () => {
  const cache: ProductivityCache = {
    "web|youtube.com#Intro to Rust": { verdict: "Productive", confidence: 0.9, model: "jev", at: "2026-09-20T09:00:00.000Z", source: "jev" },
    "web|youtube.com#Funny Shorts": { verdict: "Distracting", confidence: 0.95, model: "jev", at: "2026-09-20T11:00:00.000Z", source: "jev" },
    "web|youtube.com#Cat Videos": { verdict: "Distracting", confidence: 0.93, model: "jev", at: "2026-09-20T10:00:00.000Z", source: "jev" },
  };

  it("sums verdicts, keeps unrated time in the share, and falls back to the site majority", () => {
    const stamped = stampSegmentVerdicts(
      [
        segment({ id: "lecture", url: "https://youtube.com/watch?v=1", label: "Intro to Rust - YouTube", end: "2026-09-20T10:00:00.000Z" }),
        segment({ id: "shorts", url: "https://youtube.com/shorts/2", label: "Funny Shorts - YouTube", start: "2026-09-20T10:00:00.000Z", end: "2026-09-20T12:00:00.000Z" }),
        segment({ id: "other", url: "https://youtube.com/watch?v=9", label: "Another Lecture - YouTube", start: "2026-09-20T12:00:00.000Z", end: "2026-09-20T13:00:00.000Z" }),
        segment({ id: "editor", url: "", label: "main.ts", appName: "Cursor", start: "2026-09-20T13:00:00.000Z", end: "2026-09-20T13:30:00.000Z" }),
      ],
      cache,
    );
    expect(stamped.find((item) => item.id === "other")?.verdict).toBe("Distracting");
    expect(focusVerdictForSegment(segment({ url: "", label: "main.ts", appName: "Cursor" }), cache)).toBe("Unrated");
    const rows = productivityBreakdown(stamped);
    expect(rows.map((row) => row.label)).toEqual(["Distracting", "Productive", "Unrated"]);
    expect(rows.find((row) => row.label === "Distracting")?.seconds).toBe(3 * 3600);
    expect(rows.find((row) => row.label === "Productive")?.seconds).toBe(3600);
    expect(rows.find((row) => row.label === "Unrated")?.seconds).toBe(30 * 60);
    const share = rows.reduce((sum, row) => sum + row.percentage, 0);
    expect(share).toBeCloseTo(1);
  });

  it("leaves snapshot segments unstamped when no productivity cache is passed", () => {
    const snapshot = snapshotFromEntries([], "day", new Date("2026-09-20T12:00:00.000Z"));
    expect(snapshot.timelineSegments.every((item) => item.verdict === undefined)).toBe(true);
  });
});

describe("agent view", () => {
  const cache: ProductivityCache = {
    "web|youtube.com#Intro to Rust": { verdict: "Productive", confidence: 0.9, model: "jev", at: "2026-09-20T09:00:00.000Z", source: "jev" },
    "web|youtube.com#Funny Shorts": { verdict: "Distracting", confidence: 0.95, model: "jev", at: "2026-09-20T11:00:00.000Z", source: "jev" },
    "web|youtube.com#Cat Videos": { verdict: "Distracting", confidence: 0.93, model: "jev", at: "2026-09-20T10:00:00.000Z", source: "jev" },
    "web|news.example#Headlines": { verdict: "Social", confidence: 0.5, model: "jev", at: "2026-09-20T08:00:00.000Z", source: "jev" },
  };

  it("groups a site's pages, rolls up the verdict that covers the most time, and flags low confidence", () => {
    const view = buildAgentView(
      [
        segment({ id: "lecture", url: "https://youtube.com/watch?v=1", label: "(1) Intro to Rust - YouTube", end: "2026-09-20T10:00:00.000Z" }),
        segment({ id: "shorts", url: "https://youtube.com/shorts/2", label: "Funny Shorts - YouTube", start: "2026-09-20T10:00:00.000Z", end: "2026-09-20T12:00:00.000Z" }),
        segment({ id: "news", url: "https://news.example/a?token=secret", label: "Headlines", appName: "Safari", bundleID: "com.apple.Safari" }),
        segment({ id: "editor", url: "", label: "main.ts", appName: "Cursor", bundleID: "com.todesktop.cursor", category: "Development", start: "2026-09-20T12:00:00.000Z", end: "2026-09-20T12:30:00.000Z" }),
      ],
      cache,
      meta,
    );

    expect(view.items.map((item) => item.label)).toEqual(["Cursor", "youtube.com", "news.example"]);

    const youtube = view.items.find((item) => item.key === "web|youtube.com");
    expect(youtube?.label).toBe("youtube.com");
    expect(youtube?.seconds).toBe(3 * 3600);
    expect(youtube?.verdict).toBe("Distracting");
    expect(youtube?.titles.map((title) => [title.title, title.verdict])).toEqual([
      ["Funny Shorts", "Distracting"],
      ["Intro to Rust", "Productive"],
    ]);

    const news = view.items.find((item) => item.key === "web|news.example");
    expect(news?.verdict).toBeNull();
    expect(news?.titles[0]?.confidence).toBe(0.5);

    expect(view.items.find((item) => item.key === "app|Cursor")?.subtitle).toBe("Development");
    expect(view.totals.Distracting).toBe(3 * 3600);
    expect(view.totals.unrated).toBe(90 * 60);
    expect(view.lastReviewAt).toBe("2026-09-20T11:00:00.000Z");
    expect(JSON.stringify(view)).not.toContain("token=secret");
  });

  it("uses the site's majority verdict for a page that has not been rated", () => {
    const view = buildAgentView(
      [segment({ url: "https://youtube.com/watch?v=9", label: "Another Lecture - YouTube" })],
      cache,
      meta,
    );
    expect(view.items[0]?.verdict).toBe("Distracting");
  });
});

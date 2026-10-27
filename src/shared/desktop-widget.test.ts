import { describe, expect, it } from "vitest";
import { desktopWidgetSummary } from "./desktop-widget";
import type { ScreenTimeAppBreakdown, ScreenTimeTimelineSegment } from "./types";

function segment(
  seconds: number,
  verdict: ScreenTimeTimelineSegment["verdict"],
  offsetSeconds: number,
): Pick<ScreenTimeTimelineSegment, "start" | "end" | "verdict"> {
  const start = Date.parse("2026-10-23T00:00:00.000Z") + offsetSeconds * 1000;
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + seconds * 1000).toISOString(),
    verdict,
  };
}

function app(label: string, seconds: number): ScreenTimeAppBreakdown {
  return {
    key: label,
    label,
    subtitle: "",
    category: "",
    seconds,
    percentage: 0,
  };
}

describe("desktopWidgetSummary", () => {
  it("totals verdicts already on the segments and keeps stored app labels", () => {
    const summary = desktopWidgetSummary({
      listSegments: [
        segment(3600, "Productive", 0),
        segment(1800, "Neutral", 3600),
        segment(900, "Distracting", 5400),
        segment(600, "Productive", 6300),
      ],
      apps: [
        app("news.ycombinator.com", 4200),
        app("Xcode", 2700),
      ],
    });

    expect(summary.productiveSeconds).toBe(4200);
    expect(summary.neutralSeconds).toBe(1800);
    expect(summary.distractingSeconds).toBe(900);
    expect(summary.unratedSeconds).toBe(0);
    expect(summary.top.map((item) => item.label)).toEqual(["news.ycombinator.com", "Xcode"]);
  });

  it("counts segments without a verdict as unrated and omits that total when none exist", () => {
    const rated = desktopWidgetSummary({
      listSegments: [segment(60, "Neutral", 0)],
      apps: [],
    });
    expect(rated.unratedSeconds).toBe(0);

    const unrated = desktopWidgetSummary({
      listSegments: [segment(45, undefined, 0), segment(15, "Unrated", 45)],
      apps: [],
    });
    expect(unrated.unratedSeconds).toBe(60);
    expect(unrated.productiveSeconds).toBe(0);
  });

  it("caps the published app list at five, highest first", () => {
    const summary = desktopWidgetSummary({
      listSegments: [],
      apps: [
        app("Sixth", 10),
        app("First", 60),
        app("youtube.com", 50),
        app("Third", 40),
        app("Fourth", 30),
        app("Fifth", 20),
      ],
    });

    expect(summary.top.map((item) => item.label)).toEqual([
      "First",
      "youtube.com",
      "Third",
      "Fourth",
      "Fifth",
    ]);
  });
});

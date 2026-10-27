// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { ALL_INSIGHTS_DEVICES } from "@shared/timeline";
import { TrendScreen } from "./TrendScreen";

const desktop = {
  setInsightsDevice: vi.fn(),
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "trend",
    loadingEntries: false,
    insightsPeriod: "week",
    insightsAnchor: "2026-09-10T00:00:00.000Z",
    insightsDeviceKey: ALL_INSIGHTS_DEVICES,
    trendComparisons: {
      day: { currentSeconds: 25 * 60, previousSeconds: 10 * 60, deltaSeconds: 15 * 60 },
      week: { currentSeconds: 2 * 3600, previousSeconds: 3 * 3600, deltaSeconds: -3600 },
    },
    devices: [],
    hiddenDeviceKeys: [],
    snapshot: {
      totalSeconds: 3600,
      sessionCount: 1,
      timelineSegments: [],
      listSegments: [],
      categories: [],
      apps: [],
      buckets: [{
        id: "mon",
        label: "Mon",
        start: "2026-09-08T00:00:00.000Z",
        end: "2026-09-09T00:00:00.000Z",
        seconds: 3600,
      }],
      trackedSecondsByDay: {},
    },
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("TrendScreen", () => {
  it("shows the activity trend from the current period buckets", () => {
    render(<TrendScreen state={snapshot()} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Activity");
    expect(screen.getByText("Activity trend")).toBeVisible();
    expect(screen.getByText("Day over day")).toBeVisible();
    expect(screen.getByText("Week over week")).toBeVisible();
    expect(screen.getByText("15m more than yesterday · 150%")).toBeVisible();
    expect(screen.getByText("1h less than last week · 33%")).toBeVisible();
    expect(screen.getByRole("img", { name: /Tracked time chart/ })).toBeVisible();
  });

  it("hides the chart while entries are still loading", () => {
    render(<TrendScreen state={snapshot({ loadingEntries: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Building your activity trend…");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Activity");
    expect(screen.queryByText("Activity trend")).toBeNull();
    expect(screen.queryByText("Day over day")).toBeNull();
    expect(screen.queryByText("Week over week")).toBeNull();
  });
});

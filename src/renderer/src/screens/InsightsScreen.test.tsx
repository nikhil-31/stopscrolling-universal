// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { InsightsScreen } from "./InsightsScreen";

const desktop = {
  setInsightsTab: vi.fn(),
  selectInspector: vi.fn(),
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "insights",
    loadingEntries: false,
    insightsPeriod: "week",
    insightsTab: "overview",
    devices: [],
    timelines: [],
    snapshot: {
      totalSeconds: 3600,
      sessionCount: 4,
      timelineSegments: [],
      listSegments: [],
      categories: [{ category: "Productivity", seconds: 3600, percentage: 1 }],
      apps: [{
        key: "notes",
        label: "Notes",
        subtitle: "Productivity",
        category: "Productivity",
        seconds: 3600,
        percentage: 1,
      }],
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

describe("InsightsScreen", () => {
  it("shows breakdown content on Overview and hides the Breakdown tab", () => {
    render(<InsightsScreen state={snapshot()} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Breakdown" })).toBeNull();
    expect(screen.getByText("Activity trend")).toBeVisible();
    expect(screen.getByText("Time by category")).toBeVisible();
    expect(screen.getByText("Apps & websites")).toBeVisible();
    expect(screen.getByText("Notes")).toBeVisible();
  });

  it("treats a leftover breakdown tab as Overview", () => {
    render(<InsightsScreen state={snapshot({ insightsTab: "breakdown" as unknown as AppSnapshot["insightsTab"] })} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Time by category")).toBeVisible();
  });
});

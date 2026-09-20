// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { snapshotFromEntries } from "@shared/timeline";
import { TrendCard } from "./Charts";

describe("TrendCard month view", () => {
  it("renders a labeled bar for every day of the month", () => {
    const snapshot = snapshotFromEntries([], "month", new Date(2026, 8, 9, 15), {
      trackedSecondsByDay: { "2026-09-09": 1200 },
    });
    render(<TrendCard buckets={snapshot.buckets} period="month" />);
    const chart = screen.getByRole("img", { name: "Tracked time chart, 0 to 30m" });
    expect(chart).toHaveClass("bar-chart-month");
    expect(chart.querySelectorAll(".bar-item")).toHaveLength(30);
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getByText("15")).toBeVisible();
    expect(screen.getByText("30")).toBeVisible();
    const axis = screen.getByTestId("activity-trend-y-axis");
    expect(axis).toHaveTextContent("0");
    expect(axis).toHaveTextContent("10m");
    expect(axis).toHaveTextContent("30m");
  });
});

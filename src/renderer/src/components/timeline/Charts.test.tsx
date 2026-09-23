// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { snapshotFromEntries } from "@shared/timeline";
import type { DeviceListEntry, ScreenTimePeriodBucket } from "@shared/types";
import { TrendCard } from "./Charts";

const devices = [
  { visibilityKey: "macos|Studio Mac", devicePlatform: "macos", deviceName: "Studio Mac", nickname: "" },
  { visibilityKey: "ios|iPhone", devicePlatform: "ios", deviceName: "iPhone", nickname: "Phone" },
] as DeviceListEntry[];

function bucket(patch: Partial<ScreenTimePeriodBucket> & Pick<ScreenTimePeriodBucket, "id" | "label" | "seconds">): ScreenTimePeriodBucket {
  return {
    start: "2026-09-09T09:00:00.000Z",
    end: "2026-09-09T10:00:00.000Z",
    ...patch,
  };
}

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

  it("stacks a bar by device and keeps an unsplit bar solid", () => {
    render(
      <TrendCard
        period="day"
        devices={devices}
        buckets={[
          bucket({
            id: "shared",
            label: "9",
            seconds: 5400,
            devices: [
              { key: "ios|iPhone", seconds: 1800 },
              { key: "macos|Studio Mac", seconds: 3600 },
            ],
          }),
          bucket({ id: "plain", label: "10", seconds: 1200 }),
        ]}
      />,
    );
    const items = screen.getByRole("img", { name: /Tracked time chart/ }).querySelectorAll(".bar-item");
    const stacked = items[0].querySelectorAll(".bar-device");
    expect(stacked).toHaveLength(2);
    expect(stacked[0]).toHaveStyle({ background: "var(--device-0)" });
    expect(stacked[1]).toHaveStyle({ background: "var(--device-1)" });
    expect(items[0]).toHaveAttribute("title", "Studio Mac 1h, Phone 30m, 1h 30m");
    expect(items[1].querySelector(".bar-device")).toBeNull();
    expect(items[1].querySelector(".bar-column")).not.toHaveClass("is-stacked");
    expect(screen.getByTestId("activity-trend-legend")).toHaveTextContent("Studio Mac");
    expect(screen.getByTestId("activity-trend-legend")).toHaveTextContent("Phone");
  });
});

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
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
              { key: "ios|iPhone", seconds: 1800, apps: [] },
              { key: "macos|Studio Mac", seconds: 3600, apps: [] },
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
    expect(items[0]).not.toHaveAttribute("title");
    expect(items[1].querySelector(".bar-device")).toBeNull();
    expect(items[1].querySelector(".bar-column")).not.toHaveClass("is-stacked");
    expect(screen.getByTestId("activity-trend-legend")).toHaveTextContent("Studio Mac");
    expect(screen.getByTestId("activity-trend-legend")).toHaveTextContent("Phone");
  });

  it("keeps a selected device's color when the period has only that device", () => {
    render(
      <TrendCard
        period="day"
        devices={devices}
        buckets={[
          bucket({
            id: "phone-9",
            label: "9",
            seconds: 1800,
            devices: [{ key: "ios|iPhone", seconds: 1800, apps: [] }],
          }),
          bucket({
            id: "phone-10",
            label: "10",
            seconds: 600,
            devices: [{ key: "ios|iPhone", seconds: 600, apps: [] }],
          }),
        ]}
      />,
    );
    const columns = screen.getByRole("img", { name: /Tracked time chart/ }).querySelectorAll(".bar-column");
    expect(columns).toHaveLength(2);
    for (const column of columns) {
      expect(column).toHaveStyle({ background: "var(--device-1)" });
      expect(column).not.toHaveClass("is-stacked");
    }
    expect(screen.queryByTestId("activity-trend-legend")).toBeNull();
  });

  it("shows each device's time while hovering a bar", () => {
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
              {
                key: "ios|iPhone",
                seconds: 1800,
                apps: [
                  { label: "Safari", seconds: 1200 },
                  { label: "Messages", seconds: 600 },
                ],
              },
              {
                key: "macos|Studio Mac",
                seconds: 3600,
                apps: [
                  { label: "Code", seconds: 2400 },
                  { label: "Slack", seconds: 900 },
                  { label: "Figma", seconds: 300 },
                ],
              },
            ],
          }),
          bucket({ id: "plain", label: "10", seconds: 1200 }),
        ]}
      />,
    );
    const items = screen.getByRole("img", { name: /Tracked time chart/ }).querySelectorAll(".bar-item");

    fireEvent.pointerMove(items[0], { clientX: 40, clientY: 40 });
    const card = screen.getByTestId("activity-bar-hover");
    const rows = card.querySelectorAll(".activity-bar-hover-device");
    expect(card).toHaveTextContent("9");
    expect(card).toHaveTextContent("1h 30m");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Studio Mac");
    expect(rows[0]).toHaveTextContent("1h");
    expect(rows[0].querySelector(".legend-dot")).toHaveStyle({ "--swatch": "var(--device-0)" });
    const macApps = rows[0].querySelectorAll(".activity-bar-hover-apps > div");
    expect(macApps).toHaveLength(3);
    expect(macApps[0]).toHaveTextContent("Code");
    expect(macApps[0]).toHaveTextContent("40m");
    expect(macApps[1]).toHaveTextContent("Slack");
    expect(macApps[1]).toHaveTextContent("15m");
    expect(macApps[2]).toHaveTextContent("Figma");
    expect(macApps[2]).toHaveTextContent("5m");
    expect(rows[1]).toHaveTextContent("Phone");
    expect(rows[1]).toHaveTextContent("30m");
    const phoneApps = rows[1].querySelectorAll(".activity-bar-hover-apps > div");
    expect(phoneApps).toHaveLength(2);
    expect(phoneApps[0]).toHaveTextContent("Safari");
    expect(phoneApps[0]).toHaveTextContent("20m");
    expect(phoneApps[1]).toHaveTextContent("Messages");
    expect(phoneApps[1]).toHaveTextContent("10m");

    fireEvent.pointerLeave(items[0]);
    expect(screen.queryByTestId("activity-bar-hover")).toBeNull();

    fireEvent.pointerEnter(items[1], { clientX: 80, clientY: 40 });
    const plain = screen.getByTestId("activity-bar-hover");
    expect(plain).toHaveTextContent("10");
    expect(plain).toHaveTextContent("20m");
    expect(plain.querySelector(".native-hover-items")).toBeNull();
  });
});

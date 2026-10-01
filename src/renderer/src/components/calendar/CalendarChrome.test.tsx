// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CalendarView } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarChrome } from "./CalendarChrome";

function snapshot(view: CalendarView, when: Date): AppSnapshot {
  return {
    calendarView: view,
    calendarAnchor: when.toISOString(),
    calendarMonth: when.toISOString(),
    calendarEvents: [],
  } as AppSnapshot;
}

function jumpDot() {
  return screen.getByRole("button", { name: "Jump to today" }).querySelector(".icon-button-dot");
}

describe("CalendarChrome jump to today", () => {
  const now = new Date();
  const elsewhere = new Date(2020, 0, 15, 12);

  it("shows a dot when the day, week, or month is not the current one", () => {
    const { rerender } = render(<CalendarChrome state={snapshot("day", elsewhere)} />);
    expect(jumpDot()).not.toBeNull();

    rerender(<CalendarChrome state={snapshot("week", elsewhere)} />);
    expect(jumpDot()).not.toBeNull();

    rerender(<CalendarChrome state={snapshot("month", elsewhere)} />);
    expect(jumpDot()).not.toBeNull();
  });

  it("hides the dot when the current day, week, or month is in view", () => {
    const { rerender } = render(<CalendarChrome state={snapshot("day", now)} />);
    expect(jumpDot()).toBeNull();

    rerender(<CalendarChrome state={snapshot("week", now)} />);
    expect(jumpDot()).toBeNull();

    rerender(<CalendarChrome state={snapshot("month", now)} />);
    expect(jumpDot()).toBeNull();
  });
});

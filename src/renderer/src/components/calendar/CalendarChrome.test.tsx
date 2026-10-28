// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarView } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarChrome } from "./CalendarChrome";

function snapshot(view: CalendarView, when: Date): AppSnapshot {
  return {
    calendarView: view,
    calendarAnchor: when.toISOString(),
    calendarMonth: when.toISOString(),
    calendarEvents: [],
    settings: { showCalendarEvents: false },
    calendarIntegration: {
      google: { available: true, connecting: false, accounts: [] },
      apple: { access: "unsupported" },
      calendars: [],
      errors: [],
    },
  } as unknown as AppSnapshot;
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

describe("CalendarChrome shortcuts and menu", () => {
  const desktop = {
    setCalendarAnchor: vi.fn(),
    setCalendarMonth: vi.fn(),
    setCalendarView: vi.fn(),
    openSettings: vi.fn(),
  };
  const day = new Date(2020, 0, 15, 12);

  beforeEach(() => {
    vi.clearAllMocks();
    window.stopscrolling = desktop as unknown as Window["stopscrolling"];
  });

  function chromeState(view: CalendarView) {
    return { ...snapshot(view, day), settings: { showCalendarEvents: true } } as unknown as AppSnapshot;
  }

  it("ignores keys unless shortcuts are on", () => {
    render(<CalendarChrome state={chromeState("day")} />);
    fireEvent.keyDown(window, { key: "m" });
    expect(desktop.setCalendarView).not.toHaveBeenCalled();
  });

  it("maps arrows, T, D, W and M", () => {
    render(<CalendarChrome state={chromeState("week")} shortcuts />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(new Date(desktop.setCalendarAnchor.mock.calls[0][0]).getDate()).toBe(8);
    fireEvent.keyDown(window, { key: "t" });
    expect(new Date(desktop.setCalendarAnchor.mock.calls[1][0]).toDateString()).toBe(new Date().toDateString());
    for (const [key, view] of [["d", "day"], ["w", "week"], ["m", "month"]] as const) {
      fireEvent.keyDown(window, { key });
      expect(desktop.setCalendarView).toHaveBeenLastCalledWith(view);
    }
  });

  it("ignores keys typed into a field", () => {
    render(<><input aria-label="Search" /><CalendarChrome state={chromeState("day")} shortcuts /></>);
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "m" });
    expect(desktop.setCalendarView).not.toHaveBeenCalled();
  });

  it("closes the more menu on Escape and outside click", () => {
    render(<CalendarChrome state={chromeState("day")} />);
    const trigger = screen.getByRole("button", { name: "More calendar options" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers to connect a calendar and lists calendars that failed to load", () => {
    const state = chromeState("day");
    render(<CalendarChrome state={{
      ...state,
      calendarIntegration: { ...state.calendarIntegration, errors: ["ada@example.com: Reconnect this Google account."] },
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "More calendar options" }));
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect this Google account.");
    fireEvent.click(screen.getByRole("button", { name: "Connect a calendar" }));
    expect(desktop.openSettings).toHaveBeenCalled();
  });
});

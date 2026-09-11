// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeDeviceTimeline } from "@shared/types";
import { toDateInput } from "@shared/platform";
import { TIMER_BONUS_STEP_SECONDS } from "@shared/timer";
import { TimerScreen } from "./TimerScreen";

const desktop = {
  startTracking: vi.fn(),
  stopTracking: vi.fn(),
  addTimerBonus: vi.fn(),
  selectInspector: vi.fn(),
};

const todayDay = new Date(2026, 8, 10, 12).toISOString();
const remaining = 57 * 60 + 46;

const timeline: ScreenTimeDeviceTimeline = {
  id: "timeline-1",
  deviceName: "Studio Mac",
  devicePlatform: "macos",
  timeZoneIdentifier: "UTC",
  dayStart: new Date(2026, 8, 10).toISOString(),
  dayEnd: new Date(2026, 8, 11).toISOString(),
  segments: [],
  blocks: [{
    id: "block-1",
    start: new Date(2026, 8, 10, 9).toISOString(),
    end: new Date(2026, 8, 10, 10).toISOString(),
    title: "Writing",
    subtitle: "Notes",
    category: "Productivity",
    devicePlatform: "macos",
    deviceName: "Studio Mac",
    durationSeconds: 3600,
    items: [{
      id: "notes",
      title: "Writing",
      subtitle: "Notes",
      url: "",
      category: "Productivity",
      appName: "Notes",
      start: new Date(2026, 8, 10, 9).toISOString(),
      end: new Date(2026, 8, 10, 10).toISOString(),
      durationSeconds: 3600,
    }],
  }],
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "timer",
    isTracking: false,
    currentContext: null,
    todayDay,
    settings: {
      dailyWorkTargetSeconds: 8 * 3600,
      timerBonusSeconds: 0,
      timerBonusDay: toDateInput(new Date(todayDay)),
    },
    snapshot: { totalSeconds: 8 * 3600 - remaining },
    timelines: [timeline],
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("TimerScreen", () => {
  it("shows remaining focus time and empty session copy when paused", async () => {
    const user = userEvent.setup();
    render(<TimerScreen state={snapshot()} />);
    expect(screen.getByTestId("timer-clock")).toHaveTextContent("57:46");
    expect(screen.getByText("Focus time remaining")).toBeVisible();
    expect(screen.getByText("Start recording to begin a session.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Start recording" }));
    expect(desktop.startTracking).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add 15 minutes" }));
    expect(desktop.addTimerBonus).toHaveBeenCalledWith(TIMER_BONUS_STEP_SECONDS);
  });

  it("shows the live session while recording", async () => {
    const user = userEvent.setup();
    render(
      <TimerScreen
        state={snapshot({
          isTracking: true,
          currentContext: {
            title: "Weekly notes",
            url: "",
            appName: "Notes",
            bundleID: "com.apple.Notes",
            category: "Productivity",
          },
        })}
      />,
    );
    expect(screen.getByTestId("timer-current-session")).toHaveTextContent("Notes");
    expect(screen.getByText("Weekly notes")).toBeVisible();
    expect(screen.getByText("Productivity")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(desktop.stopTracking).toHaveBeenCalled();
  });

  it("shows a timeline block title on the Timeline tab", async () => {
    const user = userEvent.setup();
    render(<TimerScreen state={snapshot()} />);
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByText("Writing")).toBeVisible();
  });
});

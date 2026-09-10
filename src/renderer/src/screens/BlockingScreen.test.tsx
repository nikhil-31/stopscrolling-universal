// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { Blocklist, BlockingSchedule, DeviceListEntry } from "@shared/types";
import { BlockingScreen } from "./BlockingScreen";

const desktop = {
  navigate: vi.fn(),
  createBlocklist: vi.fn(),
  createBlockingSchedule: vi.fn(),
};

const device: DeviceListEntry = {
  visibilityKey: "device-1",
  deviceName: "Studio Mac",
  devicePlatform: "macos",
  deviceID: "device-id-1",
  sessionCount: 4,
  timeZone: "UTC",
  lastSeenAt: "2026-09-09T09:00:00Z",
  lastOnlineAt: "2026-09-09T09:00:00Z",
  reportedOnline: true,
  isOnline: true,
  isRegistered: true,
};

const blocklist: Blocklist = {
  blocklist_id: "list-1",
  name: "Social",
  entries: [],
  entry_count: 4,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

const namedSchedule: BlockingSchedule = {
  schedule_id: "sched-1",
  name: "Deep work",
  start_time: "16:00:00",
  end_time: "18:00:00",
  days_of_week: [0, 1, 2, 3, 4],
  time_zone: "UTC",
  is_active: true,
  blocklists: [{ blocklist_id: "list-1", name: "Social" }],
  devices: [],
  blocklist_count: 1,
  device_count: 1,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "blocking",
    isAuthenticated: false,
    devices: [],
    blocking: { schedules: [], blocklists: [], statusMessage: "", loading: false },
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("BlockingScreen", () => {
  it("asks signed-out users to sign in", () => {
    render(<BlockingScreen state={snapshot()} />);
    expect(screen.getByText("Sessions need an account")).toBeVisible();
    expect(screen.queryByText("This Mac")).toBeNull();
  });

  it("renders synced sessions, blocklists, and devices", () => {
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          blocking: {
            schedules: [namedSchedule],
            blocklists: [blocklist],
            statusMessage: "1 sessions · 1 blocklists",
            loading: false,
          },
        })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/does not enforce blocks yet/i);
    expect(screen.getByText(/Deep work/)).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
    expect(screen.getByText("Studio Mac")).toBeVisible();
  });

  it("toggles locked mode and submits create forms", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          blocking: {
            schedules: [],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    const locked = screen.getByTestId("blocking-locked-mode");
    expect(locked).not.toBeChecked();
    await user.click(locked);
    expect(locked).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add Blocklist" }));
    await user.type(screen.getByPlaceholderText("Name your blocklist"), "News");
    await user.type(screen.getByPlaceholderText("Add custom website (e.g. cnn.com)"), "nytimes.com");
    await user.click(screen.getByRole("button", { name: "Add site" }));
    await user.click(screen.getByRole("button", { name: "Instagram" }));
    await user.click(screen.getByRole("button", { name: "Create blocklist" }));
    expect(desktop.createBlocklist).toHaveBeenCalledWith({
      name: "News",
      entries: [
        { entry_type: "website", identifier: "nytimes.com", label: "nytimes.com" },
        { entry_type: "website", identifier: "instagram.com", label: "Instagram" },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Add Session" }));
    await user.type(screen.getByLabelText("Session name"), "Work focus");
    await user.click(screen.getByRole("checkbox", { name: /Social/ }));
    const deviceOption = screen.getByRole("checkbox", { name: "Studio Mac" });
    expect(deviceOption).toBeChecked();
    await user.click(deviceOption);
    expect(deviceOption).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Create blocking session" })).toBeDisabled();
    await user.click(deviceOption);
    expect(deviceOption).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Create blocking session" }));
    expect(desktop.createBlockingSchedule).toHaveBeenCalledWith(expect.objectContaining({
      name: "Work focus",
      blocklist_ids: ["list-1"],
      device_ids: ["device-id-1"],
      days_of_week: [0, 1, 2, 3, 4],
    }));
  });

  it("shows an empty history tab", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: {
            schedules: [namedSchedule],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );
    expect(screen.getByText(/Deep work/)).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Session History" }));
    expect(screen.queryByText(/Deep work/)).toBeNull();
    expect(screen.getByText("Completed sessions aren’t stored yet.")).toBeVisible();
  });
});

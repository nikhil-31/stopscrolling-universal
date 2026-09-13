// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { Blocklist, BlockingSchedule, DeviceListEntry } from "@shared/types";
import { Inspector } from "../components/Inspector";
import { BlockingScreen } from "./BlockingScreen";

const desktop = {
  navigate: vi.fn(),
  createBlocklist: vi.fn(),
  updateBlocklist: vi.fn(),
  createBlockingSchedule: vi.fn(),
  updateBlockingSchedule: vi.fn(),
  selectInspector: vi.fn(),
};

const device: DeviceListEntry = {
  visibilityKey: "device-1",
  deviceName: "Studio Mac",
  nickname: "",
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
  entries: [
    {
      entry_id: "entry-1",
      entry_type: "website",
      identifier: "instagram.com",
      label: "Instagram",
      created_at: "2026-09-10T00:00:00Z",
    },
    {
      entry_id: "entry-2",
      entry_type: "website",
      identifier: "x.com",
      label: "X",
      created_at: "2026-09-10T00:00:00Z",
    },
    {
      entry_id: "entry-3",
      entry_type: "app",
      identifier: "com.apple.Safari",
      label: "Safari",
      created_at: "2026-09-10T00:00:00Z",
    },
  ],
  entry_count: 3,
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
  devices: [{
    device_id: "device-id-1",
    device_platform: "macos",
    device_name: "Studio Mac",
    label: "Studio Mac",
  }],
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
    inspector: { kind: "none", segment: null, block: null, schedule: null },
    ...patch,
  } as AppSnapshot;
}

function BlockingWithInspector({ state }: { state: AppSnapshot }) {
  const [editingSchedule, setEditingSchedule] = useState<BlockingSchedule | null>(null);
  return (
    <>
      <BlockingScreen
        state={state}
        editingSchedule={editingSchedule}
        onCloseEdit={() => setEditingSchedule(null)}
      />
      <Inspector state={state} onEditSchedule={setEditingSchedule} />
    </>
  );
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

  it("renders synced sessions, blocklists, and devices", async () => {
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
    await userEvent.setup().click(screen.getByRole("button", { name: /Deep work/ }));
    expect(desktop.selectInspector).toHaveBeenCalledWith(expect.objectContaining({
      kind: "schedule",
      schedule: namedSchedule,
    }));
  });

  it("shows a device nickname instead of the hostname", () => {
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [{ ...device, nickname: "Work Mac" }],
          blocking: {
            schedules: [namedSchedule],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );
    expect(screen.getByText("Work Mac")).toBeVisible();
    expect(screen.queryByText("Studio Mac")).toBeNull();
  });

  it("marks the inspected session as selected", () => {
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          inspector: { kind: "schedule", segment: null, block: null, schedule: namedSchedule },
          blocking: {
            schedules: [namedSchedule],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /Deep work/ })).toHaveAttribute("aria-pressed", "true");
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

  it("opens blocklist details and closes them", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: {
            schedules: [],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Social.*custom filters/ }));
    const dialog = screen.getByRole("dialog", { name: "Social" });
    expect(dialog).toBeVisible();
    expect(screen.getByText("3 entries")).toBeVisible();
    expect(screen.getByText("Websites")).toBeVisible();
    expect(screen.getByText("instagram.com")).toBeVisible();
    expect(screen.getByText("Apps")).toBeVisible();
    expect(screen.getByText("Safari")).toBeVisible();
    expect(screen.getByText("com.apple.Safari")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close blocklist details" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Social.*custom filters/ }));
    expect(screen.getByRole("dialog", { name: "Social" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("edits a blocklist from the detail dialog", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: {
            schedules: [],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Social.*custom filters/ }));
    await user.click(screen.getByRole("button", { name: "Edit blocklist" }));
    expect(screen.getByText("Your custom websites")).toBeVisible();
    expect(screen.getByText("Common filters")).toBeVisible();
    expect(screen.getByText("Category filters")).toBeVisible();
    expect(screen.getByRole("button", { name: "Instagram" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "x.com" })).toBeVisible();

    const nameField = screen.getByPlaceholderText("Name your blocklist");
    await user.clear(nameField);
    await user.type(nameField, "Focus");
    await user.click(screen.getByRole("button", { name: "Instagram" }));
    await user.type(screen.getByLabelText("Add custom website"), "reddit.com");
    await user.click(screen.getByRole("button", { name: "Add site" }));
    await user.click(screen.getByRole("button", { name: "Save blocklist" }));

    expect(desktop.updateBlocklist).toHaveBeenCalledTimes(1);
    const payload = desktop.updateBlocklist.mock.calls[0][0];
    expect(payload.blocklist_id).toBe("list-1");
    expect(payload.name).toBe("Focus");
    expect(payload.entries.map((entry: { identifier: string }) => entry.identifier)).toEqual([
      "x.com",
      "reddit.com",
      "com.apple.Safari",
    ]);
  });

  it("cancels blocklist edits without saving", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: {
            schedules: [],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Social.*custom filters/ }));
    await user.click(screen.getByRole("button", { name: "Edit blocklist" }));
    await user.type(screen.getByPlaceholderText("Name your blocklist"), " night");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(desktop.updateBlocklist).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Social" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit blocklist" })).toBeVisible();
  });

  it("edits a session from the inspector dialog", async () => {
    const user = userEvent.setup();
    const session: BlockingSchedule = {
      ...namedSchedule,
      devices: [
        ...namedSchedule.devices,
        {
          device_id: "phone-1",
          device_platform: "ios",
          device_name: "iPhone",
          label: "iPhone",
        },
      ],
    };
    render(
      <BlockingWithInspector
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          inspector: { kind: "schedule", segment: null, block: null, schedule: session },
          blocking: {
            schedules: [session],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit session" }));
    expect(screen.getByRole("dialog", { name: "Deep work" })).toBeVisible();
    expect(screen.getByLabelText("Start time")).toHaveValue("16:00");
    expect(screen.getByRole("checkbox", { name: /Social/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Studio Mac" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "iPhone" })).toBeChecked();

    const nameField = screen.getByLabelText("Session name");
    await user.clear(nameField);
    await user.type(nameField, "Evening");
    await user.click(screen.getByRole("button", { name: "Save session" }));

    expect(desktop.updateBlockingSchedule).toHaveBeenCalledTimes(1);
    expect(desktop.updateBlockingSchedule).toHaveBeenCalledWith({
      schedule_id: "sched-1",
      name: "Evening",
      start_time: "16:00",
      end_time: "18:00",
      days_of_week: [0, 1, 2, 3, 4],
      time_zone: "UTC",
      blocklist_ids: ["list-1"],
      device_ids: ["device-id-1", "phone-1"],
      is_active: true,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels session edits without saving", async () => {
    const user = userEvent.setup();
    render(
      <BlockingWithInspector
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          inspector: { kind: "schedule", segment: null, block: null, schedule: namedSchedule },
          blocking: {
            schedules: [namedSchedule],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit session" }));
    await user.type(screen.getByLabelText("Session name"), " night");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(desktop.updateBlockingSchedule).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Session inspector" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit session" })).toBeVisible();
  });
});

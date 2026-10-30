// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applicationIconUrl } from "@shared/application-icons";
import type { AppSnapshot } from "@shared/snapshot";
import type { Blocklist, BlockingSchedule, DeviceListEntry, InstalledApplication } from "@shared/types";
import { Inspector } from "../components/Inspector";
import { BlockingScreen } from "./BlockingScreen";

const desktop = {
  navigate: vi.fn(),
  createBlocklist: vi.fn(),
  updateBlocklist: vi.fn(),
  createBlockingSchedule: vi.fn().mockResolvedValue({ ok: true }),
  updateBlockingSchedule: vi.fn(),
  deleteBlockingSchedule: vi.fn(),
  selectInspector: vi.fn(),
  refreshBlockingInventory: vi.fn().mockResolvedValue(undefined),
  refreshBlocking: vi.fn().mockResolvedValue(undefined),
  cancelNormalSession: vi.fn().mockResolvedValue({}),
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

const safariApplication: InstalledApplication = {
  displayName: "Safari",
  executablePath: "/Applications/Safari.app/Contents/MacOS/Safari",
  bundleIdentifier: "com.apple.Safari",
  signingIdentifier: "com.apple.Safari",
  packageFamilyName: null,
  publisherThumbprint: null,
  iconUrl: applicationIconUrl("/Applications/Safari.app"),
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

const activeOccurrence = {
  occurrence_id: "occurrence-1",
  schedule_id: "sched-1",
  schedule_name: "Deep work",
  strict_mode: false,
  start_at: "2026-09-14T16:00:00Z",
  end_at: "2026-09-15T18:00:00Z",
  entries: [{ entry_type: "website" as const, identifier: "instagram.com", label: "Instagram" }],
};

const connectedEnforcement = {
  available: true,
  connected: true,
  protocolVersion: 1,
  policyVersion: 3,
  activeOccurrenceIDs: ["occurrence-1"],
  strictOccurrenceIDs: [] as string[],
  activeOccurrenceID: "occurrence-1",
  strictMode: false,
  policyExpiresAt: null,
  lastError: null,
  checkedAt: "2026-09-14T16:00:00Z",
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

  it("renders synced sessions and blocklists", async () => {
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
    expect(screen.getByRole("alert")).toHaveTextContent(/blocking helper unavailable/i);
    expect(screen.queryByText("Blocking Status")).toBeNull();
    expect(screen.getByRole("button", { name: "Deep work session" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Social.*2 websites · 1 app · Used by Deep work/ })).toBeVisible();
    expect(screen.queryByText("My Devices")).toBeNull();
    expect(screen.queryByText("Studio Mac")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Deep work session" }));
    expect(desktop.selectInspector).toHaveBeenCalledWith(expect.objectContaining({
      kind: "schedule",
      schedule: namedSchedule,
    }));
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
    expect(screen.getByRole("button", { name: "Deep work session" })).toHaveAttribute("aria-pressed", "true");
  });

  it("submits create forms without a preview lock", async () => {
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

    await user.click(screen.getByRole("button", { name: "Add Blocklist" }));
    expect(screen.getByRole("dialog", { name: "New blocklist" })).toBeVisible();
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
      strict_mode: false,
    }));
  });

  it("opens new sessions in a dialog with footer actions", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          blocking: { schedules: [], blocklists: [blocklist], statusMessage: "", loading: false },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Session" }));
    const dialog = screen.getByRole("dialog", { name: "New session" });
    expect(dialog.closest(".blocking-dialog-scrim")?.parentElement).toBe(document.body);
    for (const section of ["Schedule", "What to block", "Protection", "Blocked screen"]) {
      expect(within(dialog).getByRole("region", { name: section })).toBeVisible();
    }
    const footer = dialog.querySelector(".blocking-modal-footer");
    expect(footer).toContainElement(within(dialog).getByRole("button", { name: "Create blocking session" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "New session" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add Session" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "New session" })).toBeNull();
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
            installedApplications: [safariApplication],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Social.*2 websites/ }));
    const dialog = screen.getByRole("dialog", { name: "Social" });
    expect(dialog).toBeVisible();
    expect(screen.getByText("3 entries")).toBeVisible();
    expect(screen.getByText("Websites")).toBeVisible();
    expect(screen.getByText("instagram.com")).toBeVisible();
    expect(screen.getByText("Apps")).toBeVisible();
    expect(screen.getByText("Safari")).toBeVisible();
    expect(screen.getByText("com.apple.Safari")).toBeVisible();
    const safari = screen.getByText("Safari");
    const safariIcon = safari.closest(".data-row")?.querySelector("img");
    expect(safariIcon).toHaveAttribute("src", applicationIconUrl("/Applications/Safari.app"));
    expect(safariIcon && (safariIcon.compareDocumentPosition(safari) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(screen.getByText("instagram.com").closest(".data-row")?.querySelector("img")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close blocklist details" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Social.*2 websites/ }));
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

    await user.click(screen.getByRole("button", { name: /Social.*2 websites/ }));
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

    await user.click(screen.getByRole("button", { name: /Social.*2 websites/ }));
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
    const dialog = document.getElementById("session-edit-title")?.closest("[role='dialog']");
    const editorScrim = dialog?.closest(".blocking-dialog-scrim");
    const detailsScrim = [...document.querySelectorAll(".blocking-dialog-scrim")]
      .find((node) => !node.classList.contains("blocking-dialog-scrim-front"));
    expect(dialog).toBeVisible();
    expect(editorScrim?.parentElement).toBe(document.body);
    expect(editorScrim).toHaveClass("blocking-dialog-scrim-front");
    expect(detailsScrim).toBeTruthy();
    expect(detailsScrim).not.toHaveClass("blocking-dialog-scrim-front");
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
      strict_mode: false,
    });
    expect(screen.queryByLabelText("Session name")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Deep work" })).toBeVisible();
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
    expect(screen.queryByLabelText("Session name")).toBeNull();
    const details = screen.getByRole("dialog", { name: "Deep work" });
    expect(details).toBeVisible();
    expect(details.closest(".blocking-dialog-scrim")?.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: "Edit session" })).toBeVisible();
  });

  it("deletes a session from the list", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          blocking: {
            schedules: [namedSchedule],
            blocklists: [blocklist],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete Deep work" }));
    expect(desktop.deleteBlockingSchedule).toHaveBeenCalledWith("sched-1");
    expect(desktop.selectInspector).not.toHaveBeenCalled();
  });

  it("deletes a session from the inspector", async () => {
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
    await user.click(screen.getByRole("button", { name: "Delete session" }));
    expect(desktop.deleteBlockingSchedule).toHaveBeenCalledWith("sched-1");
    expect(desktop.selectInspector).toHaveBeenCalledWith({ kind: "none" });
  });

  it("closes a new blocklist without creating it", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: { schedules: [], blocklists: [], statusMessage: "", loading: false },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Blocklist" }));
    expect(screen.getByRole("dialog", { name: "New blocklist" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "New blocklist" })).toBeNull();
    expect(desktop.createBlocklist).not.toHaveBeenCalled();
  });

  it("selects helper inventory apps and persists stable identifiers", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: {
            schedules: [],
            blocklists: [],
            installedApplications: [{
              displayName: "Slack",
              executablePath: "/Applications/Slack.app/Contents/MacOS/Slack",
              bundleIdentifier: "com.tinyspeck.slackmacgap",
              signingIdentifier: "com.tinyspeck.slackmacgap",
              packageFamilyName: null,
              publisherThumbprint: null,
              iconUrl: applicationIconUrl("/Applications/Slack.app"),
            }],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Blocklist" }));
    await user.type(screen.getByPlaceholderText("Name your blocklist"), "Apps");
    await user.type(screen.getByPlaceholderText("Search installed applications"), "Slack");
    const slack = screen.getByRole("checkbox", { name: /Slack/ });
    const slackLabel = slack.closest("label");
    const slackIcon = slackLabel?.querySelector("img");
    const slackName = slackLabel?.querySelector("strong");
    expect(slackIcon).toHaveAttribute("src", applicationIconUrl("/Applications/Slack.app"));
    expect(slackName).toHaveTextContent("Slack");
    expect(slackIcon && slackName && (slackIcon.compareDocumentPosition(slackName) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    await user.click(slack);
    expect(screen.getByRole("button", { name: "Remove Slack" }).querySelector("img"))
      .toHaveAttribute("src", applicationIconUrl("/Applications/Slack.app"));
    await user.click(screen.getByRole("button", { name: "Create blocklist" }));

    expect(desktop.createBlocklist).toHaveBeenCalledWith({
      name: "Apps",
      entries: [{
        entry_type: "app",
        identifier: "com.tinyspeck.slackmacgap",
        label: "Slack",
      }],
    });
  });

  it("requires explicit Strict Mode confirmation", async () => {
    const user = userEvent.setup();
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          devices: [device],
          blocking: { schedules: [], blocklists: [blocklist], statusMessage: "", loading: false },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Session" }));
    await user.type(screen.getByLabelText("Session name"), "No escape");
    await user.click(screen.getByRole("checkbox", { name: /Social/ }));
    await user.click(screen.getByRole("checkbox", { name: /Strict Mode/ }));
    const submit = screen.getByRole("button", { name: "Create blocking session" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I understand that while this Strict Mode session is active/ }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(desktop.createBlockingSchedule).toHaveBeenCalledWith(expect.objectContaining({ strict_mode: true }));
  });

  it("locks controls only for helper-confirmed active Strict Mode", async () => {
    const user = userEvent.setup();
    const strictState = snapshot({
      isAuthenticated: true,
      devices: [device],
      inspector: { kind: "schedule", segment: null, block: null, schedule: { ...namedSchedule, strict_mode: true } },
      blocking: {
        schedules: [{ ...namedSchedule, strict_mode: true }],
        blocklists: [blocklist],
        activeOccurrence: { ...activeOccurrence, strict_mode: true },
        enforcement: {
          ...connectedEnforcement,
          strictOccurrenceIDs: ["occurrence-1"],
          strictMode: true,
        },
        statusMessage: "",
        loading: false,
      },
    });
    const { unmount } = render(<BlockingWithInspector state={strictState} />);
    expect(screen.getByRole("button", { name: "End session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Deep work" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Social.*2 websites/ }));
    expect(screen.getByRole("button", { name: "Edit blocklist" })).toBeDisabled();
    unmount();

    render(
      <BlockingWithInspector
        state={snapshot({
          ...strictState,
          inspector: { kind: "schedule", segment: null, block: null, schedule: namedSchedule },
          blocking: {
            ...strictState.blocking,
            schedules: [namedSchedule],
            activeOccurrence,
            enforcement: connectedEnforcement,
          },
        })}
      />,
    );
    const end = screen.getByRole("button", { name: "End session" });
    expect(end).toBeVisible();
    expect(end).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit session" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit session" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete session" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete session" })).toBeEnabled();
    await user.click(end);
    expect(desktop.cancelNormalSession).toHaveBeenCalledWith({
      scheduleID: "sched-1",
      occurrenceID: "occurrence-1",
    });
  });


  it("shows the running session with time left and progress", () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T17:00:00Z"), toFake: ["Date"] });
    try {
      render(
        <BlockingScreen
          state={snapshot({
            isAuthenticated: true,
            blocking: {
              schedules: [namedSchedule],
              blocklists: [blocklist],
              enforcement: { ...connectedEnforcement, strictOccurrenceIDs: ["occurrence-1"] },
              activeOccurrence,
              statusMessage: "",
              loading: false,
            },
          })}
        />,
      );
      const hero = screen.getByTestId("blocking-hero");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(within(hero).getByText("Blocking now")).toBeVisible();
      expect(within(hero).getByText("Deep work")).toBeVisible();
      expect(within(hero).getByText("1h 00m")).toBeVisible();
      expect(within(hero).getByText("Strict Mode")).toBeVisible();
      expect(within(hero).getByText("1 site or app blocked")).toBeVisible();
      expect(within(hero).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "96");
      const row = screen.getByRole("button", { name: "Deep work session" });
      expect(within(row).getByText("Running")).toBeVisible();
      expect(within(row).getByText("1h 00m left")).toBeVisible();
      expect(screen.getByRole("button", { name: "Delete Deep work" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the next session when idle and marks paused sessions", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 16, 10, 0), toFake: ["Date"] });
    try {
      const paused = { ...namedSchedule, schedule_id: "sched-2", name: "Evenings", is_active: false };
      render(
        <BlockingScreen
          state={snapshot({
            isAuthenticated: true,
            blocking: {
              schedules: [paused, namedSchedule],
              blocklists: [blocklist],
              enforcement: { ...connectedEnforcement, activeOccurrenceIDs: [], activeOccurrenceID: null },
              statusMessage: "",
              loading: false,
            },
          })}
        />,
      );
      const hero = screen.getByTestId("blocking-hero");
      expect(within(hero).getByText("Nothing is blocked right now")).toBeVisible();
      expect(within(hero).getByText(/Next: Deep work starts today at/)).toBeVisible();
      expect(within(hero).getByText("6h 00m")).toBeVisible();
      const rows = screen.getAllByRole("button", { name: /session$/ });
      expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(["Deep work session", "Evenings session"]);
      expect(within(rows[1]).getByText("Paused")).toBeVisible();
      expect(screen.getByRole("button", { name: /Used by Evenings, Deep work/ })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a load failure with retry instead of empty states", async () => {
    render(
      <BlockingScreen
        state={snapshot({
          isAuthenticated: true,
          blocking: {
            schedules: [],
            blocklists: [blocklist],
            enforcement: { ...connectedEnforcement, activeOccurrenceIDs: [], activeOccurrenceID: null },
            loadError: "Sessions: Request failed (500).",
            failedLists: ["schedules"],
            statusMessage: "",
            loading: false,
          },
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load your sessions. Sessions: Request failed (500).");
    expect(screen.queryByText("No sessions yet")).toBeNull();
    expect(screen.getByText("Session status unavailable")).toBeVisible();
    expect(screen.queryByText("Nothing is blocked right now")).toBeNull();
    expect(screen.getByRole("button", { name: /Social.*1 app/ })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(desktop.refreshBlocking).toHaveBeenCalled();
  });
});

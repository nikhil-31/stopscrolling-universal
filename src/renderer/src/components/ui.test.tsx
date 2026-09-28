// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { DeviceListEntry } from "@shared/types";
import { CommandPalette } from "./CommandPalette";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { AccountScreen } from "../screens/AccountScreen";
import { TimelineGroup } from "./timeline";
import { SessionTitleProvider } from "../session-title";
import { Banner, Button, EmptyState, LoadingState, Tabs, Toggle } from "./ui";

const desktop = {
  navigate: vi.fn(),
  setCommandPalette: vi.fn(),
  toggleTracking: vi.fn(),
  startTracking: vi.fn(),
  stopTracking: vi.fn(),
  openSettings: vi.fn(),
  refresh: vi.fn(),
  selectInspector: vi.fn(),
  setDeviceVisible: vi.fn(),
  setDeviceNickname: vi.fn(),
  deleteDevice: vi.fn(),
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "today",
    isTracking: false,
    isAuthenticated: false,
    currentContext: null,
    statusMessage: "Ready",
    inspector: { kind: "none", segment: null, block: null, schedule: null },
    ...patch,
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("UI primitives", () => {
  it("exposes accessible tabs and toggles", async () => {
    const user = userEvent.setup();
    const onTab = vi.fn();
    const onToggle = vi.fn();
    render(
      <>
        <Tabs
          ariaLabel="Views"
          value="overview"
          onChange={onTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "sessions", label: "Sessions" },
          ]}
        />
        <Toggle checked={false} onChange={onToggle} label="Sync activity" />
      </>,
    );
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Sessions" }));
    await user.click(screen.getByRole("checkbox", { name: "Sync activity" }));
    expect(onTab).toHaveBeenCalledWith("sessions");
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("renders status and action semantics", () => {
    render(
      <>
        <Banner tone="danger">Sync failed</Banner>
        <EmptyState title="No activity" body="Start tracking." action={<Button>Start</Button>} />
        <LoadingState label="Loading timeline" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Sync failed");
    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Loading timeline");
  });
});

describe("record button", () => {
  const chrome = {
    navigation: "today" as const,
    capabilities: { platform: "macos", accessibilityGranted: true },
  };

  it("starts recording only when tracking is paused", async () => {
    const user = userEvent.setup();
    render(<Toolbar state={snapshot(chrome)} />);
    await user.click(screen.getByRole("button", { name: "Start recording" }));
    expect(desktop.startTracking).toHaveBeenCalledOnce();
    expect(desktop.stopTracking).not.toHaveBeenCalled();
  });

  it("stops recording when the button is clicked", async () => {
    const user = userEvent.setup();
    render(<Toolbar state={snapshot({ ...chrome, isTracking: true })} />);
    await user.click(screen.getByRole("button", { name: "Stop Recording" }));
    expect(desktop.stopTracking).toHaveBeenCalledOnce();
    expect(desktop.startTracking).not.toHaveBeenCalled();
  });
});

describe("application chrome", () => {
  it("marks the active sidebar item and navigates", async () => {
    const user = userEvent.setup();
    render(<Sidebar state={snapshot()} />);
    expect(screen.getByRole("button", { name: /Today/ })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: /Calendar/ }));
    expect(desktop.navigate).toHaveBeenCalledWith("calendar");
    await user.click(screen.getByRole("button", { name: /Blocking/ }));
    expect(desktop.navigate).toHaveBeenCalledWith("blocking");
    expect(screen.queryByRole("button", { name: /Timer/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Account/ })).toHaveTextContent("⌘5");
  });

  it("supports command keyboard selection and escape", async () => {
    const user = userEvent.setup();
    const view = render(<CommandPalette state={snapshot()} />);
    expect(screen.queryByRole("button", { name: /Go to Timer/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Go to Calendar/ })).toHaveTextContent("⌘2");
    expect(screen.getByRole("button", { name: /Go to Account/ })).toHaveTextContent("⌘5");
    await user.type(screen.getByRole("textbox", { name: "Search commands" }), "calendar");
    await user.keyboard("{Enter}");
    expect(desktop.navigate).toHaveBeenCalledWith("calendar");
    view.rerender(<CommandPalette state={snapshot()} />);
    await user.keyboard("{Escape}");
    expect(desktop.setCommandPalette).toHaveBeenCalledWith(false);
  });

  it("closes the inspector", async () => {
    const user = userEvent.setup();
    render(
      <Inspector
        state={snapshot({
          inspector: {
            kind: "segment",
            block: null,
            schedule: null,
            segment: {
              id: "one",
              start: "2026-09-09T09:00:00Z",
              end: "2026-09-09T09:30:00Z",
              label: "Writing",
              subtitle: "Notes",
              url: "",
              bundleID: "notes",
              category: "Productivity",
              appName: "Notes",
              devicePlatform: "macos",
              deviceName: "Mac",
              timeZoneIdentifier: "UTC",
              isLive: false,
            },
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(desktop.selectInspector).toHaveBeenCalledWith({ kind: "none" });
  });

  it("shows blocking session details in the inspector", () => {
    render(
      <Inspector
        state={snapshot({
          inspector: {
            kind: "schedule",
            segment: null,
            block: null,
            schedule: {
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
            },
          },
        })}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Session inspector" })).toBeVisible();
    expect(screen.getByText("Session details")).toBeVisible();
    expect(screen.getByText("Deep work")).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
    expect(screen.getByText("Studio Mac")).toBeVisible();
    expect(screen.getByText("UTC")).toBeVisible();
    expect(screen.getByLabelText("Repeats Mon, Tue, Wed, Thu, Fri")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit session" })).toBeVisible();
  });

  it("asks to edit a blocking session from the inspector", async () => {
    const onEditSchedule = vi.fn();
    render(
      <Inspector
        state={snapshot({
          inspector: {
            kind: "schedule",
            segment: null,
            block: null,
            schedule: {
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
            },
          },
        })}
        onEditSchedule={onEditSchedule}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Edit session" }));
    expect(onEditSchedule).toHaveBeenCalledWith(expect.objectContaining({
      schedule_id: "sched-1",
      name: "Deep work",
    }));
  });
});

describe("account states", () => {
  const auth = {
    user: null,
    formMode: "signIn",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    mfaChallenge: null,
    mfaCode: "",
    backupCode: "",
    useBackupCode: false,
    loading: false,
    statusMessage: "",
  };

  it("renders labeled sign-in controls", () => {
    render(<AccountScreen state={snapshot({ auth } as Partial<AppSnapshot>)} />);
    expect(screen.getByRole("heading", { name: "Welcome to Stop Scrolling" })).toBeVisible();
    expect(screen.getByLabelText("Email address")).toBeVisible();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("renders profile and device visibility controls when signed in", () => {
    render(
      <AccountScreen
        state={snapshot({
          auth: {
            ...auth,
            user: {
              id: 7,
              email: "focus@example.com",
              tracking_id: "tracking-7",
              totp_enabled: true,
              phone_number: "",
              phone_verified: false,
              mfa_delivery: "totp",
              social_providers: [],
            },
          },
          devices: [{
            visibilityKey: "macos|Studio Mac",
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
          }],
          hiddenDeviceKeys: [],
        } as Partial<AppSnapshot>)}
      />,
    );
    expect(screen.getByText("focus@example.com")).toBeVisible();
    expect(screen.getByText("Studio Mac")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Show in timelines" })).toBeChecked();
  });

  it("shows a nickname and saves edits from the device card", async () => {
    const user = userEvent.setup();
    render(
      <AccountScreen
        state={snapshot({
          auth: {
            ...auth,
            user: {
              id: 7,
              email: "focus@example.com",
              tracking_id: "tracking-7",
              totp_enabled: true,
              phone_number: "",
              phone_verified: false,
              mfa_delivery: "totp",
              social_providers: [],
            },
          },
          devices: [{
            visibilityKey: "macos|Studio Mac",
            deviceName: "Studio Mac",
            nickname: "Work Mac",
            devicePlatform: "macos",
            deviceID: "device-id-1",
            sessionCount: 4,
            timeZone: "UTC",
            lastSeenAt: "2026-09-09T09:00:00Z",
            lastOnlineAt: "2026-09-09T09:00:00Z",
            reportedOnline: true,
            isOnline: true,
            isRegistered: true,
          }],
          hiddenDeviceKeys: [],
        } as Partial<AppSnapshot>)}
      />,
    );
    expect(screen.getByText("Work Mac")).toBeVisible();
    expect(screen.getByText(/Studio Mac · macos · 4 sessions/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Rename Work Mac" }));
    const field = screen.getByLabelText("Nickname");
    await user.clear(field);
    await user.type(field, "Home Mac");
    await user.keyboard("{Enter}");
    expect(desktop.setDeviceNickname).toHaveBeenCalledWith("device-id-1", "Home Mac");
  });

  it("removes a device after confirmation and keeps this computer", async () => {
    const user = userEvent.setup();
    render(
      <AccountScreen
        state={snapshot({
          auth: {
            ...auth,
            user: {
              id: 7,
              email: "focus@example.com",
              tracking_id: "tracking-7",
              totp_enabled: false,
              phone_number: "",
              phone_verified: false,
              mfa_delivery: "email",
              social_providers: [],
            },
          },
          devices: [
            {
              visibilityKey: "macos|Studio Mac",
              deviceName: "Studio Mac",
              nickname: "",
              devicePlatform: "macos",
              deviceID: "local-device",
              sessionCount: 2,
              timeZone: "UTC",
              lastSeenAt: null,
              lastOnlineAt: null,
              reportedOnline: true,
              isOnline: true,
              isRegistered: true,
              isLocal: true,
            },
            {
              visibilityKey: "ios|iPhone",
              deviceName: "iPhone",
              nickname: "Phone",
              devicePlatform: "ios",
              deviceID: "phone-id",
              sessionCount: 8,
              timeZone: "UTC",
              lastSeenAt: null,
              lastOnlineAt: null,
              reportedOnline: false,
              isOnline: false,
              isRegistered: true,
            },
          ],
          hiddenDeviceKeys: [],
        } as Partial<AppSnapshot>)}
      />,
    );

    expect(screen.queryByRole("button", { name: "Remove Studio Mac" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove Phone" }));
    expect(desktop.deleteDevice).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove device" }));
    expect(desktop.deleteDevice).toHaveBeenCalledWith("phone-id");
  });
});

describe("native timeline", () => {
  it("renders session blocks on a 24-hour track and opens block details", async () => {
    const user = userEvent.setup();
    render(
      <TimelineGroup
        timelines={[{
          id: "timeline-1",
          deviceName: "Studio Mac",
          devicePlatform: "macos",
          timeZoneIdentifier: "UTC",
          dayStart: "2026-09-09T00:00:00Z",
          dayEnd: "2026-09-10T00:00:00Z",
          segments: [],
          blocks: [{
            id: "block-1",
            start: "2026-09-09T09:00:00Z",
            end: "2026-09-09T10:00:00Z",
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
              start: "2026-09-09T09:00:00Z",
              end: "2026-09-09T10:00:00Z",
              durationSeconds: 3600,
            }],
          }],
        }]}
      />,
    );
    expect(screen.getByRole("img", { name: /1 blocks, 1h tracked/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /^Notes,/ }));
    expect(desktop.selectInspector).toHaveBeenCalledWith(expect.objectContaining({ kind: "block" }));
  });

  it("shows session details when hovering a block", () => {
    render(
      <TimelineGroup
        timelines={[{
          id: "timeline-1",
          deviceName: "Studio Mac",
          devicePlatform: "macos",
          timeZoneIdentifier: "UTC",
          dayStart: "2026-09-09T00:00:00Z",
          dayEnd: "2026-09-10T00:00:00Z",
          segments: [],
          blocks: [{
            id: "block-1",
            start: "2026-09-09T09:00:00Z",
            end: "2026-09-09T10:00:00Z",
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
              start: "2026-09-09T09:00:00Z",
              end: "2026-09-09T10:00:00Z",
              durationSeconds: 3600,
            }],
          }],
        }]}
      />,
    );
    const track = screen.getByRole("img", { name: /1 blocks, 1h tracked/ });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 2400,
      bottom: 150,
      width: 2400,
      height: 150,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseMove(track, { clientX: 50, clientY: 20 });
    expect(screen.queryByTestId("session-hover-card")).toBeNull();
    expect(track.querySelector(".native-hover-time")).not.toBeNull();

    fireEvent.mouseMove(track, { clientX: 950, clientY: 20 });
    const card = screen.getByTestId("session-hover-card");
    expect(card.querySelector(".native-hover-title")).toHaveTextContent("Notes");
    expect(within(card).getAllByText("1h").length).toBeGreaterThan(0);
    expect(within(card.querySelector(".native-hover-items") as HTMLElement).getByText("Notes")).toBeVisible();
    const label = screen.getByRole("button", { name: /^Notes,/ }).getAttribute("aria-label") ?? "";
    const range = label.replace(/^Notes, /, "").replace(/, 1h$/, "").replace(" to ", " – ");
    expect(within(card).getByText(range)).toBeVisible();
    expect(track.querySelector(".native-hover-time")).toBeNull();

    fireEvent.mouseLeave(track);
    expect(screen.queryByTestId("session-hover-card")).toBeNull();
  });

  it("shows the combined time of the top three apps and websites", () => {
    render(
      <TimelineGroup
        timelines={[{
          id: "timeline-1",
          deviceName: "Studio Mac",
          devicePlatform: "macos",
          timeZoneIdentifier: "UTC",
          dayStart: "2026-09-09T00:00:00Z",
          dayEnd: "2026-09-10T00:00:00Z",
          segments: [],
          blocks: [{
            id: "block-1",
            start: "2026-09-09T09:00:00Z",
            end: "2026-09-09T10:00:00Z",
            title: "Writing",
            subtitle: "Notes",
            category: "Productivity",
            devicePlatform: "macos",
            deviceName: "Studio Mac",
            durationSeconds: 3600,
            items: [
              {
                id: "safari-a",
                title: "Pulls",
                subtitle: "github.com",
                url: "https://github.com/pulls",
                category: "Productivity",
                appName: "Safari",
                start: "2026-09-09T09:00:00Z",
                end: "2026-09-09T09:10:00Z",
                durationSeconds: 600,
              },
              {
                id: "xcode",
                title: "Xcode",
                subtitle: "Xcode",
                url: "",
                category: "Productivity",
                appName: "Xcode",
                start: "2026-09-09T09:10:00Z",
                end: "2026-09-09T09:40:00Z",
                durationSeconds: 1800,
              },
              {
                id: "slack",
                title: "Slack",
                subtitle: "Slack",
                url: "",
                category: "Productivity",
                appName: "Slack",
                start: "2026-09-09T09:40:00Z",
                end: "2026-09-09T09:45:00Z",
                durationSeconds: 300,
              },
              {
                id: "notes",
                title: "Notes",
                subtitle: "Notes",
                url: "",
                category: "Productivity",
                appName: "Notes",
                start: "2026-09-09T09:45:00Z",
                end: "2026-09-09T09:47:00Z",
                durationSeconds: 120,
              },
              {
                id: "safari-b",
                title: "Issues",
                subtitle: "github.com",
                url: "https://github.com/issues",
                category: "Productivity",
                appName: "Safari",
                start: "2026-09-09T09:47:00Z",
                end: "2026-09-09T09:57:00Z",
                durationSeconds: 600,
              },
            ],
          }],
        }]}
      />,
    );
    const track = screen.getByRole("img", { name: /1 blocks/ });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 2400, bottom: 150, width: 2400, height: 150, toJSON: () => ({}),
    } as DOMRect);
    fireEvent.mouseMove(track, { clientX: 950, clientY: 20 });
    const items = screen.getByTestId("session-hover-card").querySelector(".native-hover-items") as HTMLElement;
    const rows = [...items.children].filter((row) => !row.classList.contains("native-hover-total"));
    expect(rows.map((row) => row.textContent)).toEqual(["Xcode30m", "github.com20m", "Slack5m"]);
    expect(items.querySelector(".native-hover-total")).toHaveTextContent("Top 3");
    expect(items.querySelector(".native-hover-total")).toHaveTextContent("55m");
    expect(within(items).queryByText("Notes")).toBeNull();
  });

  it("colors blocks with the device's stored color, including compact tracks", () => {
    const timeline = {
      id: "timeline-phone",
      deviceName: "iPhone",
      devicePlatform: "ios",
      timeZoneIdentifier: "UTC",
      dayStart: "2026-09-09T00:00:00Z",
      dayEnd: "2026-09-10T00:00:00Z",
      segments: [],
      blocks: [{
        id: "block-1",
        start: "2026-09-09T09:00:00Z",
        end: "2026-09-09T10:00:00Z",
        title: "Reading",
        subtitle: "",
        category: "Productivity",
        devicePlatform: "ios",
        deviceName: "iPhone",
        durationSeconds: 3600,
        items: [],
      }],
    };
    const devices = [
      { visibilityKey: "macos|Studio Mac", colorIndex: 0 },
      { visibilityKey: "ios|iPhone", colorIndex: 1 },
    ] as DeviceListEntry[];
    const { rerender } = render(<TimelineGroup timelines={[timeline]} devices={devices} />);
    expect(screen.getByRole("button", { name: /^Reading,/ })).toHaveStyle({ "--block-color": "var(--device-1)" });
    rerender(<TimelineGroup timelines={[timeline]} devices={devices} compact />);
    const compact = screen.getByRole("button", { name: /^Reading,/ });
    expect(compact).toHaveClass("is-compact");
    expect(compact).toHaveStyle({ "--block-color": "var(--device-1)" });
  });

  it("highlights matching app intervals and dims the rest", () => {
    const { container } = render(
      <TimelineGroup
        highlightedAppKey="app|Notes"
        timelines={[{
          id: "timeline-1",
          deviceName: "Studio Mac",
          devicePlatform: "macos",
          timeZoneIdentifier: "UTC",
          dayStart: "2026-09-09T00:00:00Z",
          dayEnd: "2026-09-10T00:00:00Z",
          segments: [],
          blocks: [{
            id: "block-1",
            start: "2026-09-09T09:00:00Z",
            end: "2026-09-09T10:00:00Z",
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
              start: "2026-09-09T09:00:00Z",
              end: "2026-09-09T10:00:00Z",
              durationSeconds: 3600,
            }],
          }, {
            id: "block-2",
            start: "2026-09-09T11:00:00Z",
            end: "2026-09-09T12:00:00Z",
            title: "Safari",
            subtitle: "github.com",
            category: "Development",
            devicePlatform: "macos",
            deviceName: "Studio Mac",
            durationSeconds: 3600,
            items: [{
              id: "github",
              title: "Safari",
              subtitle: "github.com",
              url: "https://github.com",
              category: "Development",
              appName: "Safari",
              start: "2026-09-09T11:00:00Z",
              end: "2026-09-09T12:00:00Z",
              durationSeconds: 3600,
            }],
          }],
        }]}
      />,
    );
    expect(container.querySelectorAll('[data-testid="timeline-highlight"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Notes,/ })).not.toHaveClass("is-dimmed");
    expect(screen.getByRole("button", { name: /^github\.com,/ })).toHaveClass("is-dimmed");
  });

  it("uses the Timesheet's AI session title in the timeline and inspector", () => {
    const block = {
      id: "block-1",
      start: "2026-09-09T09:00:00Z",
      end: "2026-09-09T10:00:00Z",
      title: "Writing",
      subtitle: "Notes",
      category: "Productivity",
      devicePlatform: "macos",
      deviceName: "Studio Mac",
      durationSeconds: 3600,
      items: [],
    };
    const summaries = { "block-1": { status: "ready" as const, summary: "Drafted release notes in Notes." } };
    render(
      <SessionTitleProvider value={summaries}>
        <TimelineGroup
          timelines={[{
            id: "timeline-1",
            deviceName: "Studio Mac",
            devicePlatform: "macos",
            timeZoneIdentifier: "UTC",
            dayStart: "2026-09-09T00:00:00Z",
            dayEnd: "2026-09-10T00:00:00Z",
            segments: [],
            blocks: [block],
          }]}
        />
        <Inspector state={snapshot({ inspector: { kind: "block", segment: null, block, schedule: null } })} />
      </SessionTitleProvider>,
    );
    expect(screen.getByRole("button", { name: /^Drafted release notes in Notes\.,/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Drafted release notes in Notes." })).toBeVisible();
  });

  it("shows continuous use of one website as one event in the session details modal", async () => {
    const user = userEvent.setup();
    const block = {
      id: "block-pages",
      start: "2026-09-09T09:00:00Z",
      end: "2026-09-09T09:40:00Z",
      title: "github.com",
      subtitle: "2 activities",
      category: "Development",
      devicePlatform: "macos",
      deviceName: "Studio Mac",
      durationSeconds: 40 * 60,
      items: [
        {
          id: "pulls",
          title: "Pull requests",
          subtitle: "Safari",
          url: "https://github.com/org/repo/pulls",
          category: "Development",
          appName: "Safari",
          start: "2026-09-09T09:00:00Z",
          end: "2026-09-09T09:10:00Z",
          durationSeconds: 10 * 60,
        },
        {
          id: "issue",
          title: "Issue 12",
          subtitle: "Safari",
          url: "https://github.com/org/repo/issues/12",
          category: "Development",
          appName: "Safari",
          start: "2026-09-09T09:10:00Z",
          end: "2026-09-09T09:40:00Z",
          durationSeconds: 30 * 60,
        },
      ],
    };
    const view = render(<Inspector state={snapshot({ inspector: { kind: "block", segment: null, block, schedule: null } })} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: "github.com" })).toBeVisible();
    expect(within(dialog).getByText("1 session")).toBeVisible();
    expect(within(dialog).getByText("40m · 100%")).toBeVisible();
    expect(within(dialog).queryByText("Pull requests")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Activity block inspector" })).toBeNull();

    fireEvent.click(dialog.parentElement as HTMLElement);
    await user.click(within(dialog).getByRole("button", { name: "Close session details" }));
    view.rerender(<Inspector state={snapshot({ inspector: { kind: "block", segment: null, block, schedule: null } })} />);
    await user.keyboard("{Escape}");
    expect(desktop.selectInspector).toHaveBeenCalledTimes(3);
    expect(desktop.selectInspector).toHaveBeenCalledWith({ kind: "none" });
  });

  it("keeps an app switch and a return to the same app as separate events", () => {
    const block = {
      id: "block-switch",
      start: "2026-09-09T09:00:00Z",
      end: "2026-09-09T09:35:00Z",
      title: "Cursor",
      subtitle: "3 activities",
      category: "Development",
      devicePlatform: "macos",
      deviceName: "Studio Mac",
      durationSeconds: 35 * 60,
      items: [
        {
          id: "cursor-a",
          title: "main.ts",
          subtitle: "Cursor",
          url: "",
          category: "Development",
          appName: "Cursor",
          start: "2026-09-09T09:00:00Z",
          end: "2026-09-09T09:10:00Z",
          durationSeconds: 10 * 60,
        },
        {
          id: "slack",
          title: "Slack",
          subtitle: "Slack",
          url: "",
          category: "Communication",
          appName: "Slack",
          start: "2026-09-09T09:10:00Z",
          end: "2026-09-09T09:20:00Z",
          durationSeconds: 10 * 60,
        },
        {
          id: "cursor-b",
          title: "Inspector.tsx",
          subtitle: "Cursor",
          url: "",
          category: "Development",
          appName: "Cursor",
          start: "2026-09-09T09:20:00Z",
          end: "2026-09-09T09:35:00Z",
          durationSeconds: 15 * 60,
        },
      ],
    };
    render(<Inspector state={snapshot({ inspector: { kind: "block", segment: null, block, schedule: null } })} />);
    const dialog = screen.getByRole("dialog");
    const totals = within(dialog).getByRole("region", { name: "Apps and websites" });
    const activity = within(dialog).getByRole("region", { name: "Activity" });
    expect(within(dialog).getByText("3 sessions")).toBeVisible();
    expect(within(totals).getByText("Cursor")).toBeVisible();
    expect(within(totals).getByText("25m")).toBeVisible();
    expect(within(totals).getByText("Slack")).toBeVisible();
    expect(within(totals).getByText("10m")).toBeVisible();
    expect(within(totals).getByText("Total")).toBeVisible();
    expect(within(totals).getByText("35m")).toBeVisible();
    expect(within(activity).getAllByText("Cursor")).toHaveLength(2);
    expect(within(activity).getByText("Slack")).toBeVisible();
    expect(within(activity).getAllByText("10m · 29%")).toHaveLength(2);
    expect(within(activity).getByText("15m · 43%")).toBeVisible();
  });
});

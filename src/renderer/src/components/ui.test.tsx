// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { CommandPalette } from "./CommandPalette";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { AccountScreen } from "../screens/AccountScreen";
import { TimelineGroup } from "./timeline";
import { Banner, Button, EmptyState, LoadingState, Tabs, Toggle } from "./ui";

const desktop = {
  navigate: vi.fn(),
  setCommandPalette: vi.fn(),
  toggleTracking: vi.fn(),
  openSettings: vi.fn(),
  refresh: vi.fn(),
  selectInspector: vi.fn(),
};

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "today",
    isTracking: false,
    isAuthenticated: false,
    currentContext: null,
    statusMessage: "Ready",
    inspector: { kind: "none", segment: null, block: null },
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
          }],
          hiddenDeviceKeys: [],
        } as Partial<AppSnapshot>)}
      />,
    );
    expect(screen.getByText("focus@example.com")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Show in timelines" })).toBeChecked();
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
    await user.click(screen.getByRole("button", { name: /^Writing,/ }));
    expect(desktop.selectInspector).toHaveBeenCalledWith(expect.objectContaining({ kind: "block" }));
  });
});

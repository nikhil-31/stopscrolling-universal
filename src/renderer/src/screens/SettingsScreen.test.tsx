// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { AuthenticatedUser, CalendarIntegrationState } from "@shared/types";
import { SettingsScreen } from "./SettingsScreen";

const setTimeZone = vi.fn();

const user: AuthenticatedUser = {
  id: 1,
  email: "ada@example.com",
  tracking_id: "tracking",
  totp_enabled: false,
  phone_number: "",
  phone_verified: false,
  mfa_delivery: "email",
  social_providers: [],
  time_zone: "America/Los_Angeles",
};

function integration(patch: Partial<CalendarIntegrationState> = {}): CalendarIntegrationState {
  return {
    google: { available: true, connecting: false, accounts: [] },
    apple: { access: "unsupported" },
    calendars: [],
    errors: [],
    ...patch,
  };
}

function snapshot(signedIn: boolean, calendarIntegration = integration()): AppSnapshot {
  return {
    auth: { user: signedIn ? user : null },
    settings: {
      startScreenTimeOnLaunch: true,
      launchAtLogin: true,
      appearance: "system",
      clockFormat: "24",
      apiBaseUrl: "https://example.test",
      syncEnabled: true,
      showCalendarEvents: false,
      appleCalendarIds: null,
      dailyWorkTargetSeconds: 8 * 60 * 60,
      timerBonusSeconds: 0,
      timerBonusDay: "",
      agentSendTitles: true,
      desktopWidgetVisible: true,
    },
    capabilities: { platform: "macos", urlCaptureNote: "Accessibility is required." },
    calendarWorkspace: { labels: [] },
    calendarIntegration,
    logs: { network: "/tmp/network.log", observability: "/tmp/observability.log" },
  } as unknown as AppSnapshot;
}

beforeEach(() => {
  setTimeZone.mockClear();
  window.stopscrolling = {
    updateSettings: vi.fn(),
    setTimeZone,
    requestAccessibility: vi.fn(),
    googleConnect: vi.fn().mockResolvedValue(undefined),
    googleDisconnect: vi.fn().mockResolvedValue(undefined),
    appleCalendarRequestAccess: vi.fn().mockResolvedValue("fullAccess"),
    refreshCalendarSources: vi.fn().mockResolvedValue(undefined),
    setCalendarSelected: vi.fn().mockResolvedValue(undefined),
    linkRiot: vi.fn(),
    disconnectRiot: vi.fn(),
    connectSteam: vi.fn(),
    disconnectSteam: vi.fn(),
    upsertCalendarLabel: vi.fn(),
    deleteCalendarLabel: vi.fn(),
    syncAll: vi.fn(),
    pullFromServer: vi.fn(),
    openPath: vi.fn(),
  } as unknown as Window["stopscrolling"];
});

describe("Settings time zone", () => {
  it("saves the selected zone when signed in", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    const picker = screen.getByTestId("settings-time-zone");
    expect(picker).toBeEnabled();
    expect(picker).toHaveValue("America/Los_Angeles");
    await userEvents.selectOptions(picker, "America/New_York");
    expect(setTimeZone).toHaveBeenCalledWith("America/New_York");
  });

  it("saves a 12-hour clock", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    await userEvents.selectOptions(screen.getByTestId("settings-clock-format"), "12");
    expect(window.stopscrolling.updateSettings).toHaveBeenCalledWith({ clockFormat: "12" });
  });

  it("opens and closes the desktop widget", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    await userEvents.click(screen.getByTestId("settings-desktop-widget"));
    expect(window.stopscrolling.updateSettings).toHaveBeenCalledWith({ desktopWidgetVisible: false });
  });

  it("toggles whether window titles are sent to Jev", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    await userEvents.click(screen.getByTestId("settings-nav-sync"));
    await userEvents.click(screen.getByTestId("settings-agent-send-titles"));
    expect(window.stopscrolling.updateSettings).toHaveBeenCalledWith({ agentSendTitles: false });
  });

  it("keeps the picker disabled until the account is signed in", () => {
    render(<SettingsScreen state={snapshot(false)} />);
    expect(screen.getByTestId("settings-time-zone")).toBeDisabled();
    expect(screen.getByText("Sign in to save a time zone on your account.")).toBeVisible();
  });

  it("shows separate marks for Riot and Steam", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    await userEvents.click(screen.getByTestId("settings-nav-games"));
    expect(screen.getByTestId("settings-riot-mark")).toBeVisible();
    expect(screen.getByTestId("settings-steam-mark")).toBeVisible();
  });

  it("links a Riot ID", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    await userEvents.click(screen.getByTestId("settings-nav-games"));
    await userEvents.type(screen.getByTestId("settings-riot-id"), "Player#NA1");
    await userEvents.click(screen.getByTestId("settings-riot-link"));
    expect(window.stopscrolling.linkRiot).toHaveBeenCalledWith("Player#NA1");
  });

  it("shows one pane at a time", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    expect(screen.getByRole("heading", { name: "General" })).toBeVisible();
    await userEvents.click(screen.getByTestId("settings-nav-diagnostics"));
    expect(screen.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    expect(screen.getByTestId("settings-nav-diagnostics")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("settings-time-zone")).not.toBeInTheDocument();
  });
});

describe("Settings calendar", () => {
  it("connects Google Calendar through the account and hides Apple off macOS", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true)} />);
    await userEvents.click(screen.getByTestId("settings-nav-calendar"));
    expect(screen.queryByLabelText("Google OAuth client ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Apple Calendar" })).not.toBeInTheDocument();
    await userEvents.click(screen.getByTestId("settings-google-calendar-connect"));
    expect(window.stopscrolling.googleConnect).toHaveBeenCalled();
  });

  it("asks for sign-in before linking Google", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(false, integration({
      google: { available: false, connecting: false, accounts: [] },
    }))} />);
    await userEvents.click(screen.getByTestId("settings-nav-calendar"));
    expect(screen.getByTestId("settings-google-calendar-connect")).toBeDisabled();
    expect(screen.getByText("Sign in to link Google Calendar.")).toBeVisible();
  });

  it("lists linked accounts and calendars, and offers reconnect when access expired", async () => {
    const userEvents = userEvent.setup();
    render(<SettingsScreen state={snapshot(true, integration({
      google: { available: true, connecting: false, accounts: [{ id: 7, email: "ada@example.com", needsReauth: true }] },
      calendars: [{
        id: "12",
        provider: "google",
        name: "Team",
        accountLabel: "ada@example.com",
        colorHex: "#0b8043",
        selected: false,
        coveredByGoogle: false,
      }],
    }))} />);
    await userEvents.click(screen.getByTestId("settings-nav-calendar"));
    await userEvents.click(screen.getByTestId("settings-calendar-google-12"));
    expect(window.stopscrolling.setCalendarSelected).toHaveBeenCalledWith({ provider: "google", id: "12", selected: true });
    await userEvents.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(window.stopscrolling.googleConnect).toHaveBeenCalled();
    await userEvents.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(window.stopscrolling.googleDisconnect).toHaveBeenCalledWith(7);
  });

  it("asks macOS for Apple Calendar access and greys out calendars the Google link already shows", async () => {
    const userEvents = userEvent.setup();
    const { rerender } = render(<SettingsScreen state={snapshot(true, integration({ apple: { access: "notDetermined" } }))} />);
    await userEvents.click(screen.getByTestId("settings-nav-calendar"));
    await userEvents.click(screen.getByTestId("settings-apple-calendar-allow"));
    expect(window.stopscrolling.appleCalendarRequestAccess).toHaveBeenCalled();

    rerender(<SettingsScreen state={snapshot(true, integration({
      apple: { access: "fullAccess" },
      calendars: [
        { id: "home", provider: "apple", name: "Home", accountLabel: "iCloud", colorHex: null, selected: true, coveredByGoogle: false },
        { id: "gmail", provider: "apple", name: "Work", accountLabel: "ada@example.com", colorHex: null, selected: false, coveredByGoogle: true },
      ],
    }))} />);
    expect(screen.getByTestId("settings-calendar-apple-gmail")).toBeDisabled();
    expect(screen.getByText("Shown through your linked Google account")).toBeVisible();
    await userEvents.click(screen.getByTestId("settings-calendar-apple-home"));
    expect(window.stopscrolling.setCalendarSelected).toHaveBeenCalledWith({ provider: "apple", id: "home", selected: false });
  });
});

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { AuthenticatedUser } from "@shared/types";
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

function snapshot(signedIn: boolean): AppSnapshot {
  return {
    auth: { user: signedIn ? user : null },
    settings: {
      startScreenTimeOnLaunch: true,
      appearance: "system",
      clockFormat: "24",
      apiBaseUrl: "https://example.test",
      syncEnabled: true,
      showGoogleCalendarEvents: false,
      googleClientId: "",
      dailyWorkTargetSeconds: 8 * 60 * 60,
      timerBonusSeconds: 0,
      timerBonusDay: "",
    },
    capabilities: { platform: "macos", urlCaptureNote: "Accessibility is required." },
    calendarWorkspace: { labels: [] },
    googleCalendarConnected: false,
    googleCalendarStatus: "Not connected",
    typesafeApiKeyConfigured: false,
    logs: { network: "/tmp/network.log", observability: "/tmp/observability.log" },
  } as unknown as AppSnapshot;
}

beforeEach(() => {
  setTimeZone.mockClear();
  window.stopscrolling = {
    updateSettings: vi.fn(),
    setTimeZone,
    setTypesafeApiKey: vi.fn(),
    requestAccessibility: vi.fn(),
    googleConnect: vi.fn(),
    googleDisconnect: vi.fn(),
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

  it("keeps the picker disabled until the account is signed in", () => {
    render(<SettingsScreen state={snapshot(false)} />);
    expect(screen.getByTestId("settings-time-zone")).toBeDisabled();
    expect(screen.getByText("Sign in to save a time zone on your account.")).toBeVisible();
  });
});

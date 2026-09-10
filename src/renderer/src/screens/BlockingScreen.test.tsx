// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { BlockingScreen } from "./BlockingScreen";

function snapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    navigation: "blocking",
    devices: [],
    ...patch,
  } as AppSnapshot;
}

describe("BlockingScreen", () => {
  it("renders the preview banner, demo devices, sessions, and blocklists", () => {
    render(<BlockingScreen state={snapshot()} />);
    expect(screen.getByText(/restrict apps or websites yet/i)).toBeVisible();
    expect(screen.getByText("This Mac")).toBeVisible();
    expect(screen.getByText("Windows PC")).toBeVisible();
    expect(screen.getByText("Current Session")).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
    expect(screen.getByText("News")).toBeVisible();
    expect(screen.getByText("Games")).toBeVisible();
  });

  it("uses connected devices when they exist", () => {
    render(
      <BlockingScreen
        state={snapshot({
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
        })}
      />,
    );
    expect(screen.getByText("Studio Mac")).toBeVisible();
    expect(screen.queryByText("This Mac")).toBeNull();
  });

  it("toggles locked mode and adds sessions and blocklists", async () => {
    const user = userEvent.setup();
    render(<BlockingScreen state={snapshot()} />);

    const locked = screen.getByTestId("blocking-locked-mode");
    expect(locked).not.toBeChecked();
    await user.click(locked);
    expect(locked).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add Session" }));
    expect(screen.getByText("Session 3")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add Blocklist" }));
    expect(screen.getByText("Blocklist 4")).toBeVisible();
  });

  it("switches between session tabs", async () => {
    const user = userEvent.setup();
    render(<BlockingScreen state={snapshot()} />);
    expect(screen.getByText("Current Session")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Session History" }));
    expect(screen.queryByText("Current Session")).toBeNull();
    expect(screen.getByText("Yesterday · 2 hours")).toBeVisible();
  });
});

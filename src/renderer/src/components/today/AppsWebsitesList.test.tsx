// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import { AppsWebsitesList } from "./AppsWebsitesList";

const desktop = {
  selectInspector: vi.fn(),
};

function snapshot(): AppSnapshot {
  return {
    snapshot: {
      apps: [
        { key: "app|Cursor", label: "Cursor", subtitle: "Development", category: "Development", seconds: 3600, percentage: 0.6 },
        { key: "web|github.com", label: "github.com", subtitle: "Safari", category: "Development", seconds: 2400, percentage: 0.4 },
      ],
    },
  } as AppSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.stopscrolling = desktop as unknown as Window["stopscrolling"];
});

describe("AppsWebsitesList", () => {
  it("selects a row and does not open the inspector", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AppsWebsitesList state={snapshot()} selectedKey={null} onSelect={onSelect} onLabelApp={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(onSelect).toHaveBeenCalledWith("app|Cursor");
    expect(desktop.selectInspector).not.toHaveBeenCalled();
  });

  it("clears the selection when the same row is clicked again", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AppsWebsitesList state={snapshot()} selectedKey="app|Cursor" onSelect={onSelect} onLabelApp={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Highlight Cursor on the timeline" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("lists apps from most time spent to least", () => {
    render(<AppsWebsitesList
      state={{
        snapshot: {
          apps: [
            { key: "notes", label: "Notes", subtitle: "Productivity", category: "Productivity", seconds: 600, percentage: 0.2 },
            { key: "cursor", label: "Cursor", subtitle: "Development", category: "Development", seconds: 2400, percentage: 0.8 },
          ],
        },
      } as AppSnapshot}
      selectedKey={null}
      onSelect={vi.fn()}
      onLabelApp={vi.fn()}
    />);
    const rows = screen.getAllByRole("button", { name: /Highlight .+ on the timeline/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Highlight Cursor on the timeline",
      "Highlight Notes on the timeline",
    ]);
  });

  it("does not show a system icon beside an application name", () => {
    render(<AppsWebsitesList
      state={{
        snapshot: {
          apps: [
            { key: "app|Cursor", label: "Cursor", subtitle: "Development", category: "Development", seconds: 2400, percentage: 0.5 },
            { key: "app|Valorant", label: "Valorant", subtitle: "Gaming", category: "Gaming", seconds: 300, percentage: 0.1, assetId: "riot/Jett" },
          ],
        },
      } as AppSnapshot}
      selectedKey={null}
      onSelect={vi.fn()}
      onLabelApp={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Highlight Cursor on the timeline" }).querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Highlight Valorant on the timeline" }).querySelector("img"))
      .toHaveAttribute("src", "game-asset://cache/riot/Jett");
  });

  it("shows the top apps and expands to the full list", async () => {
    const user = userEvent.setup();
    const apps = Array.from({ length: 12 }, (_, index) => ({
      key: `app-${index}`,
      label: `App ${index}`,
      subtitle: "Development",
      category: "Development",
      seconds: 1200 - index * 60,
      percentage: 0.1,
    }));
    const state = { snapshot: { apps } } as unknown as AppSnapshot;
    const { rerender } = render(<AppsWebsitesList state={state} selectedKey={null} onSelect={vi.fn()} onLabelApp={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /^Highlight / })).toHaveLength(8);
    expect(screen.queryByText("App 8")).toBeNull();

    rerender(<AppsWebsitesList state={state} selectedKey="app-10" onSelect={vi.fn()} onLabelApp={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^Highlight / })).toHaveLength(9);
    expect(screen.getByText("App 10")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getAllByRole("button", { name: /^Highlight / })).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByRole("button", { name: /^Highlight / })).toHaveLength(9);
  });

  it("has no toggle when every app fits", () => {
    render(<AppsWebsitesList state={snapshot()} selectedKey={null} onSelect={vi.fn()} onLabelApp={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});

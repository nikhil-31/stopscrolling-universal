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
});

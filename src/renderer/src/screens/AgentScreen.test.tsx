// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentState } from "@shared/jev-productivity";
import type { AppSnapshot } from "@shared/snapshot";
import { AgentScreen } from "./AgentScreen";

function agentState(patch: Partial<AgentState> = {}): AgentState {
  return {
    items: [
      {
        key: "web|youtube.com",
        label: "youtube.com",
        subtitle: "2 pages",
        seconds: 5400,
        category: "Video",
        verdict: "Distracting",
        confidence: 0.95,
        source: "jev",
        titles: [
          { key: "web|youtube.com#Funny Shorts", title: "Funny Shorts", seconds: 3600, verdict: "Distracting", confidence: 0.95, source: "jev" },
          { key: "web|youtube.com#Intro to Rust", title: "Intro to Rust", seconds: 1800, verdict: "Productive", confidence: 0.9, source: "jev" },
        ],
      },
      {
        key: "app|Cursor",
        label: "Cursor",
        subtitle: "Development",
        seconds: 1800,
        category: "Development",
        verdict: null,
        confidence: null,
        source: null,
        titles: [{ key: "app|Cursor#main.ts", title: "main.ts", seconds: 1800, verdict: null, confidence: null, source: null }],
      },
    ],
    totals: { Productive: 0, Neutral: 0, Distracting: 5400, unrated: 1800 },
    reviewing: false,
    progress: { done: 0, total: 0 },
    lastReviewAt: null,
    keyConfigured: true,
    ...patch,
  };
}

function state(agent: AgentState): AppSnapshot {
  return { agent } as AppSnapshot;
}

beforeEach(() => {
  window.stopscrolling = {
    agentReviewAll: vi.fn(),
    agentOverride: vi.fn(),
    openSettings: vi.fn(),
  } as unknown as Window["stopscrolling"];
});

describe("AgentScreen", () => {
  it("shows time per verdict and reviews on demand", async () => {
    const user = userEvent.setup();
    render(<AgentScreen state={state(agentState())} />);
    expect(screen.getAllByText("1h 30m").length).toBeGreaterThan(0);
    expect(screen.getByText("youtube.com")).toBeInTheDocument();
    expect(screen.getByText("Last review: never")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review now" }));
    expect(window.stopscrolling.agentReviewAll).toHaveBeenCalledTimes(1);
  });

  it("filters the list", async () => {
    const user = userEvent.setup();
    render(<AgentScreen state={state(agentState())} />);
    await user.click(screen.getByRole("tab", { name: "Unrated" }));
    expect(screen.queryByText("youtube.com")).not.toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
  });

  it("expands a site into its pages and overrides a page verdict", async () => {
    const user = userEvent.setup();
    render(<AgentScreen state={state(agentState())} />);
    await user.click(screen.getByRole("button", { name: "Show pages for youtube.com" }));
    const page = screen.getByText("Intro to Rust").closest(".agent-title");
    expect(page).not.toBeNull();
    await user.click(within(page as HTMLElement).getByRole("button", { name: "Productive" }));
    expect(window.stopscrolling.agentOverride).toHaveBeenCalledWith("web|youtube.com#Intro to Rust", "Productive");
  });

  it("asks for an API key when none is configured", async () => {
    const user = userEvent.setup();
    render(<AgentScreen state={state(agentState({ keyConfigured: false, items: [], totals: { Productive: 0, Neutral: 0, Distracting: 0, unrated: 0 } }))} />);
    expect(screen.getByText(/Add a Typesafe API key/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(window.stopscrolling.openSettings).toHaveBeenCalledTimes(1);
  });
});

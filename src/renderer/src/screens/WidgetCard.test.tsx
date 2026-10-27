// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DesktopWidgetSummary } from "@shared/desktop-widget";
import { WidgetCard } from "./WidgetCard";

function summary(patch: Partial<DesktopWidgetSummary> = {}): DesktopWidgetSummary {
  return {
    productiveSeconds: 3600,
    neutralSeconds: 120,
    distractingSeconds: 45,
    unratedSeconds: 0,
    top: [
      { key: "web|news.ycombinator.com", label: "news.ycombinator.com", seconds: 3000 },
      { key: "app|Xcode", label: "Xcode", seconds: 1200 },
      { key: "app|Slack", label: "Slack", seconds: 600 },
      { key: "web|youtube.com", label: "youtube.com", seconds: 180 },
      { key: "app|Mail", label: "Mail", seconds: 90 },
    ],
    ...patch,
  };
}

describe("WidgetCard", () => {
  it("shows the three totals and the five apps from the snapshot", async () => {
    const onOpenToday = vi.fn();
    const onHide = vi.fn();
    render(<WidgetCard summary={summary()} onOpenToday={onOpenToday} onHide={onHide} />);

    expect(screen.getByText("Productive")).toBeVisible();
    expect(screen.getByText("1h")).toBeVisible();
    expect(screen.getByText("Neutral")).toBeVisible();
    expect(screen.getByText("2m")).toBeVisible();
    expect(screen.getByText("Distracting")).toBeVisible();
    expect(screen.getByText("45s")).toBeVisible();
    expect(screen.queryByText("Unrated")).not.toBeInTheDocument();

    const apps = within(screen.getByRole("list", { name: "Apps and websites" })).getAllByRole("listitem");
    expect(apps).toHaveLength(5);
    expect(apps[0]).toHaveTextContent("80%");
    expect(apps[0]).toHaveTextContent("news.ycombinator.com");
    expect(apps[0]).toHaveTextContent("50m");
    expect(apps[4]).toHaveTextContent("Mail");

    await userEvent.click(screen.getByText("Productive"));
    expect(onOpenToday).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByText("Stop Scrolling"));
    expect(onOpenToday).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "Hide desktop widget" }));
    expect(onHide).toHaveBeenCalledOnce();
    expect(onOpenToday).toHaveBeenCalledTimes(2);
  });

  it("shows unrated time only when the snapshot has some", () => {
    render(
      <WidgetCard
        summary={summary({ unratedSeconds: 30, top: [] })}
        onOpenToday={() => {}}
        onHide={() => {}}
      />,
    );

    expect(screen.getByText("Unrated")).toBeVisible();
    expect(screen.getByText("30s")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Apps and websites" })).not.toBeInTheDocument();
  });

  it("shows an empty state when the snapshot has no tracked time", async () => {
    const onOpenToday = vi.fn();
    render(
      <WidgetCard
        summary={summary({
          productiveSeconds: 0,
          neutralSeconds: 0,
          distractingSeconds: 0,
          unratedSeconds: 0,
          top: [],
        })}
        onOpenToday={onOpenToday}
        onHide={() => {}}
      />,
    );

    expect(screen.getByText("No tracked time in this period.")).toBeVisible();
    expect(screen.queryByText("Productive")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("No tracked time in this period."));
    expect(onOpenToday).toHaveBeenCalledOnce();
  });
});

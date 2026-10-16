// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NudgeCard } from "./NudgeCard";

describe("NudgeCard", () => {
  it("names the distracting window and dismisses", async () => {
    const onDismiss = vi.fn();
    render(<NudgeCard label="Funny Shorts" site="youtube.com" onDismiss={onDismiss} />);

    expect(screen.getByRole("heading", { name: "Funny Shorts" })).toBeVisible();
    expect(screen.getByText("youtube.com")).toBeVisible();
    expect(screen.getByText("This looks distracting")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();

    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("shows a gif and a custom support line", () => {
    const gif = "http://127.0.0.1:9/media/wave.gif";
    render(<NudgeCard label="youtube.com" detail="Put it down." image={gif} onDismiss={() => {}} />);

    expect(screen.getByText("Put it down.")).toBeVisible();
    expect(document.querySelector("img")).toHaveAttribute("src", gif);
  });
});

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FreedomScreen } from "./FreedomScreen";

describe("FreedomScreen", () => {
  it("shows the free screen and dismisses on click", async () => {
    const onDismiss = vi.fn();
    render(<FreedomScreen onDismiss={onDismiss} />);

    const screenButton = screen.getByRole("button", { name: /you are free\.\s*do what matters\.\s*stop scrolling/i });
    await userEvent.click(screenButton);

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

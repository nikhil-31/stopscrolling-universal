// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BlockScreenEditor, emptyBlockScreenDraft } from "./BlockScreenEditor";

describe("BlockScreenEditor", () => {
  it("offers built-in images and a file chooser", async () => {
    const onChange = vi.fn();
    window.stopscrolling = {
      listBlockScreenPresets: vi.fn().mockResolvedValue([
        { id: "pulse.gif", label: "Pulse", imageUrl: "http://127.0.0.1/presets/pulse.gif" },
      ]),
      chooseBlockScreenImage: vi.fn(),
    } as unknown as Window["stopscrolling"];

    render(<BlockScreenEditor value={emptyBlockScreenDraft()} onChange={onChange} hint="Shown when a block starts." />);

    expect(await screen.findByRole("option", { name: "Pulse" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose from your files" })).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: "Pulse" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageFile: "preset:pulse.gif" }));
  });
});

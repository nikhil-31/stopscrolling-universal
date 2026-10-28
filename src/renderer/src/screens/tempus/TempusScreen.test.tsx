// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "@shared/snapshot";
import type { TempusAction, TempusConversation, TempusMessage } from "@shared/tempus";
import { TempusScreen } from "./TempusScreen";

const conversation: TempusConversation = {
  id: "c1",
  kind: "chat",
  title: "This week",
  plan_date: null,
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T10:00:00Z",
};

function message(id: number, role: TempusMessage["role"], content: string): TempusMessage {
  return { id, role, content, tool_calls: [], tool_call_id: "", name: "", card: null, created_at: `2026-10-28T10:00:0${id}Z` };
}

const pendingAction: TempusAction = {
  id: "a1",
  tool: "create_blocking_schedule",
  arguments: {},
  summary: "Block YouTube from 9 to 11 on weekdays",
  status: "pending",
  result: null,
  error: "",
  created_at: "2026-10-28T10:00:03Z",
  resolved_at: null,
};

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const signedIn = { isAuthenticated: true } as AppSnapshot;

let bridge: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  bridge = {
    navigate: vi.fn(),
    tempusConversations: vi.fn(() => ok([])),
    tempusConversation: vi.fn(() => ok({ ...conversation, messages: [], actions: [] })),
    tempusSend: vi.fn(),
    tempusPlan: vi.fn(),
    tempusResolveAction: vi.fn(),
    tempusDigests: vi.fn(() => ok([])),
    tempusRequestDigest: vi.fn(),
  };
  window.stopscrolling = bridge as unknown as Window["stopscrolling"];
});

describe("TempusScreen", () => {
  it("asks signed-out people to sign in", async () => {
    const user = userEvent.setup();
    render(<TempusScreen state={{ isAuthenticated: false } as AppSnapshot} />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(bridge.navigate).toHaveBeenCalledWith("account");
    expect(bridge.tempusConversations).not.toHaveBeenCalled();
  });

  it("sends a suggestion and shows the reply", async () => {
    let finish!: (value: unknown) => void;
    bridge.tempusSend.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<TempusScreen state={signedIn} />);

    await user.click(await screen.findByRole("button", { name: "What distracts me most?" }));

    expect(bridge.tempusSend).toHaveBeenCalledWith(null, "What distracts me most?");
    expect(screen.getByText("What distracts me most?")).toBeInTheDocument();
    expect(screen.getByText("Tempus is thinking…")).toBeInTheDocument();

    finish({
      ok: true,
      data: { conversation, messages: [message(1, "user", "What distracts me most?"), message(2, "assistant", "Mostly **YouTube**.")], actions: [] },
    });

    expect(await screen.findByText("YouTube")).toBeInTheDocument();
    expect(screen.queryByText("Tempus is thinking…")).not.toBeInTheDocument();
  });

  it("confirms a proposed change and reloads the conversation", async () => {
    bridge.tempusConversations.mockReturnValue(ok([conversation]));
    bridge.tempusConversation.mockReturnValue(
      ok({ ...conversation, messages: [message(1, "user", "Block YouTube"), message(2, "assistant", "Confirm below.")], actions: [pendingAction] }),
    );
    bridge.tempusResolveAction.mockReturnValue(ok({ ...pendingAction, status: "applied" }));
    const user = userEvent.setup();
    render(<TempusScreen state={signedIn} />);

    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(bridge.tempusResolveAction).toHaveBeenCalledWith("a1", "confirm");
    await waitFor(() => expect(bridge.tempusConversation).toHaveBeenCalledTimes(2));
  });

  it("explains when Tempus is off on the server", async () => {
    bridge.tempusConversations.mockReturnValue(Promise.resolve({ ok: false, status: 503, message: "off" }));
    render(<TempusScreen state={signedIn} />);

    expect(await screen.findByText("Tempus isn't enabled on this server yet.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message Tempus" })).toBeDisabled();
  });

  it("keeps the draft when the daily limit is reached", async () => {
    bridge.tempusSend.mockReturnValue(Promise.resolve({ ok: false, status: 429, message: "limit" }));
    const user = userEvent.setup();
    render(<TempusScreen state={signedIn} />);
    const composer = await screen.findByRole("textbox", { name: "Message Tempus" });

    await user.type(composer, "One more question{Enter}");

    expect(await screen.findByText("You've reached today's Tempus limit. Try again tomorrow.")).toBeInTheDocument();
    expect(composer).toHaveValue("One more question");
  });
});

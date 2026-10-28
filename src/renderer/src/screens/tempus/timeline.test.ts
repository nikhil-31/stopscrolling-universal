import { describe, expect, it } from "vitest";
import type { TempusAction, TempusMessage, TempusUsageCard } from "@shared/tempus";
import { timelineRows } from "./timeline";

const card: TempusUsageCard = {
  type: "usage",
  title: "This week",
  total: "12h",
  total_seconds: 43_200,
  timeline: { kind: "day", bars: [] },
  categories: [],
  apps: [],
};

function message(id: number, patch: Partial<TempusMessage>): TempusMessage {
  return {
    id,
    role: "assistant",
    content: "",
    tool_calls: [],
    tool_call_id: "",
    name: "",
    card: null,
    created_at: `2026-10-28T10:00:0${id}Z`,
    ...patch,
  };
}

function action(id: string, createdAt: string): TempusAction {
  return {
    id,
    tool: "create_blocking_schedule",
    arguments: {},
    summary: "Block YouTube 9–11",
    status: "pending",
    result: null,
    error: "",
    created_at: createdAt,
    resolved_at: null,
  };
}

describe("timelineRows", () => {
  it("hides tool results and shows their card after the next answer", () => {
    const rows = timelineRows(
      [
        message(1, { role: "user", content: "How was my week?" }),
        message(2, { tool_calls: [{ id: "t", name: "get_usage_summary", arguments: {} }] }),
        message(3, { role: "tool", content: "{}", card }),
        message(4, { content: "Mostly video." }),
        message(5, { role: "event", content: "Schedule created." }),
      ],
      [],
    );

    expect(rows.map((row) => row.kind)).toEqual(["user", "tool", "assistant", "card", "event"]);
    expect(rows[1]).toMatchObject({ label: "Checked your screen time" });
  });

  it("places actions where they were proposed and keeps the rest at the end", () => {
    const rows = timelineRows(
      [message(1, { role: "user", content: "Block YouTube" }), message(5, { content: "Confirm below." })],
      [action("late", "2026-10-28T11:00:00Z"), action("early", "2026-10-28T10:00:03Z")],
    );

    expect(rows.map((row) => row.key)).toEqual(["m1", "aearly", "m5", "alate"]);
  });

  it("names unknown tools as a drafted change", () => {
    const rows = timelineRows([message(1, { tool_calls: [{ id: "t", name: "create_blocklist", arguments: {} }] })], []);

    expect(rows).toEqual([{ kind: "tool", key: "m1", label: "Drafted a change for you" }]);
  });
});

import type { TempusAction, TempusMessage, TempusUsageCard } from "@shared/tempus";

export type TempusRow =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; text: string }
  | { kind: "tool"; key: string; label: string }
  | { kind: "event"; key: string; text: string }
  | { kind: "card"; key: string; card: TempusUsageCard }
  | { kind: "action"; key: string; action: TempusAction };

const TOOL_LABELS: Record<string, string> = {
  get_usage_summary: "Checked your screen time",
  get_calendar_events: "Checked your calendar",
  list_blocking_schedules: "Looked at your schedules",
  list_blocklists: "Looked at your blocklists",
  list_devices: "Looked at your devices",
};

export function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? "Drafted a change for you";
}

function messageRow(message: TempusMessage): TempusRow | null {
  const key = `m${message.id}`;
  if (message.role === "user") return { kind: "user", key, text: message.content };
  if (message.role === "event") return { kind: "event", key, text: message.content };
  if (message.role !== "assistant") return null;
  const text = message.content.trim();
  if (text) return { kind: "assistant", key, text };
  const call = message.tool_calls[0];
  return call ? { kind: "tool", key, label: toolLabel(call.name) } : null;
}

/**
 * Messages in order, each action where it was proposed, and each usage card after the
 * answer it supports (the next assistant text), or at the end if none follows. Tool
 * results themselves are hidden.
 */
export function timelineRows(messages: TempusMessage[], actions: TempusAction[]): TempusRow[] {
  const rows: TempusRow[] = [];
  const remaining = [...actions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let pendingCards: TempusRow[] = [];
  const flushCards = () => {
    rows.push(...pendingCards);
    pendingCards = [];
  };
  for (const message of messages) {
    while (remaining.length && Date.parse(remaining[0].created_at) < Date.parse(message.created_at)) {
      const action = remaining.shift()!;
      rows.push({ kind: "action", key: `a${action.id}`, action });
    }
    if (message.role === "user") flushCards();
    if (message.card) pendingCards.push({ kind: "card", key: `c${message.id}`, card: message.card });
    const row = messageRow(message);
    if (row) {
      rows.push(row);
      if (row.kind === "assistant") flushCards();
    }
  }
  flushCards();
  rows.push(...remaining.map((action): TempusRow => ({ kind: "action", key: `a${action.id}`, action })));
  return rows;
}

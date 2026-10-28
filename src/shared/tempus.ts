/** Shapes of the Tempus assistant API (`backend/tempus/serializers.py`). */

export type TempusPeriod = "daily" | "weekly";

export interface TempusUsageCard {
  type: "usage";
  title: string;
  total: string;
  total_seconds: number;
  /** `categories` (largest first) is missing on cards saved before the server split bars by category. */
  timeline: { kind: "hour" | "day"; bars: Array<{ label: string; seconds: number; categories?: Array<{ name: string; seconds: number }> }> };
  /** `time` and `share` are display strings, e.g. "1h 20m" and "34%". */
  categories: Array<{ name: string; seconds: number; time: string; share: string }>;
  apps: Array<{ name: string; category: string; is_website: boolean; seconds: number; time: string; share: string }>;
}

export interface TempusConversation {
  id: string;
  kind: "chat" | "plan";
  title: string;
  plan_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TempusMessage {
  id: number;
  role: "user" | "assistant" | "tool" | "event";
  content: string;
  tool_calls: Array<{ id: string; name: string; arguments: unknown }>;
  tool_call_id: string;
  name: string;
  card: TempusUsageCard | null;
  created_at: string;
}

export interface TempusAction {
  id: string;
  tool: string;
  arguments: unknown;
  summary: string;
  status: "pending" | "applied" | "rejected" | "failed";
  result: unknown;
  error: string;
  created_at: string;
  resolved_at: string | null;
}

export interface TempusConversationDetail extends TempusConversation {
  messages: TempusMessage[];
  actions: TempusAction[];
}

/** Everything one turn saved, starting with the user's message. */
export interface TempusTurn {
  conversation: TempusConversation;
  messages: TempusMessage[];
  actions: TempusAction[];
}

export interface TempusDigest {
  id: string;
  period: TempusPeriod;
  period_start: string;
  time_zone: string;
  status: "pending" | "processing" | "ready" | "failed";
  content: string;
  card: TempusUsageCard | null;
  model: string;
  generated_at: string | null;
  updated_at: string;
}

/** IPC results keep the HTTP status so the screen can tell "not enabled" (503) and "limit reached" (429) apart. */
export type TempusResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

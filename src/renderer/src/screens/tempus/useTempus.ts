import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TempusAction,
  TempusConversation,
  TempusDigest,
  TempusMessage,
  TempusPeriod,
  TempusResult,
  TempusTurn,
} from "@shared/tempus";

const DIGEST_POLL_MS = 3_000;
const DIGEST_POLL_ATTEMPTS = 40;

export const TEMPUS_PERIODS: TempusPeriod[] = ["daily", "weekly"];

function finished(digest: TempusDigest) {
  return digest.status === "ready" || digest.status === "failed";
}

function mergeActions(current: TempusAction[], incoming: TempusAction[]) {
  const byId = new Map(current.map((action) => [action.id, action]));
  for (const action of incoming) byId.set(action.id, action);
  return [...byId.values()];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tempus chat and digest state for one visit to the screen. The main process makes the
 * requests; nothing here is kept in the app snapshot.
 */
export function useTempus(signedIn: boolean) {
  const [conversations, setConversations] = useState<TempusConversation[]>([]);
  const [conversation, setConversation] = useState<TempusConversation | null>(null);
  const [messages, setMessages] = useState<TempusMessage[]>([]);
  const [actions, setActions] = useState<TempusAction[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [digests, setDigests] = useState<Record<TempusPeriod, TempusDigest | null>>({ daily: null, weekly: null });
  const [generating, setGenerating] = useState<TempusPeriod[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Unwraps a result, showing its failure. Returns null when the call failed or the screen closed. */
  const settle = useCallback(<T,>(result: TempusResult<T>): T | null => {
    if (!alive.current) return null;
    if (result.ok) return result.data;
    if (result.status === 503) setUnavailable("Tempus isn't enabled on this server yet.");
    else if (result.status === 429) setError("You've reached today's Tempus limit. Try again tomorrow.");
    else setError(result.message);
    return null;
  }, []);

  const showConversation = useCallback(async (target: TempusConversation) => {
    const detail = settle(await window.stopscrolling.tempusConversation(target.id));
    if (!detail) return;
    setConversation(target);
    setMessages(detail.messages);
    setActions(detail.actions);
  }, [settle]);

  const loadConversations = useCallback(async () => {
    const list = settle(await window.stopscrolling.tempusConversations());
    if (list) setConversations(list);
    return list ?? [];
  }, [settle]);

  const refreshDigests = useCallback(async () => {
    for (const period of TEMPUS_PERIODS) {
      const list = settle(await window.stopscrolling.tempusDigests(period));
      if (list) setDigests((current) => ({ ...current, [period]: list[0] ?? null }));
    }
  }, [settle]);

  /** Opens the most recent conversation, as the mobile apps do. */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(null);
    const list = await loadConversations();
    if (list[0]) await showConversation(list[0]);
    if (alive.current) setLoading(false);
    await refreshDigests();
  }, [loadConversations, refreshDigests, showConversation]);

  useEffect(() => {
    if (signedIn) {
      void load();
      return;
    }
    setConversations([]);
    setConversation(null);
    setMessages([]);
    setActions([]);
    setDigests({ daily: null, weekly: null });
  }, [signedIn, load]);

  const applyTurn = useCallback((turn: TempusTurn, fresh: boolean) => {
    setConversation(turn.conversation);
    setMessages((current) => (fresh ? turn.messages : [...current, ...turn.messages]));
    setActions((current) => mergeActions(fresh ? [] : current, turn.actions));
    setConversations((current) => [turn.conversation, ...current.filter((item) => item.id !== turn.conversation.id)]);
  }, []);

  /** Returns false when the message wasn't sent, so the composer can keep the draft. */
  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return false;
    setError(null);
    setPendingText(content);
    setThinking(true);
    const turn = settle(await window.stopscrolling.tempusSend(conversation?.id ?? null, content));
    if (!alive.current) return false;
    setPendingText(null);
    setThinking(false);
    if (turn) applyTurn(turn, false);
    return Boolean(turn);
  }, [applyTurn, conversation, settle, thinking]);

  const planDay = useCallback(async () => {
    if (thinking) return;
    setError(null);
    setConversation(null);
    setMessages([]);
    setActions([]);
    setPendingText("Plan my day");
    setThinking(true);
    const turn = settle(await window.stopscrolling.tempusPlan());
    if (!alive.current) return;
    setPendingText(null);
    setThinking(false);
    if (turn) applyTurn(turn, true);
  }, [applyTurn, settle, thinking]);

  const newChat = useCallback(() => {
    if (thinking) return;
    setConversation(null);
    setMessages([]);
    setActions([]);
    setError(null);
  }, [thinking]);

  const open = useCallback(async (target: TempusConversation) => {
    if (thinking) return;
    setError(null);
    await showConversation(target);
  }, [showConversation, thinking]);

  /** Confirming runs the change on the server; reloading picks up the event message it adds. */
  const resolve = useCallback(async (action: TempusAction, decision: "confirm" | "reject") => {
    setError(null);
    setResolvingId(action.id);
    const updated = settle(await window.stopscrolling.tempusResolveAction(action.id, decision));
    if (!alive.current) return;
    setResolvingId(null);
    if (!updated) return;
    setActions((current) => mergeActions(current, [updated]));
    if (conversation) await showConversation(conversation);
  }, [conversation, settle, showConversation]);

  /** Queues a digest, then polls until it is written or about two minutes pass. */
  const generateDigest = useCallback(async (period: TempusPeriod) => {
    if (generating.includes(period)) return;
    setError(null);
    setGenerating((current) => [...current, period]);
    let digest = settle(await window.stopscrolling.tempusRequestDigest(period));
    for (let attempt = 0; digest && !finished(digest) && attempt < DIGEST_POLL_ATTEMPTS; attempt += 1) {
      const queued: TempusDigest = digest;
      setDigests((current) => ({ ...current, [period]: queued }));
      await sleep(DIGEST_POLL_MS);
      if (!alive.current) return;
      const list = settle(await window.stopscrolling.tempusDigests(period));
      if (!list) break;
      digest = list.find((item) => item.id === queued.id) ?? queued;
    }
    if (!alive.current) return;
    if (digest) {
      const latest: TempusDigest = digest;
      setDigests((current) => ({ ...current, [period]: latest }));
    }
    setGenerating((current) => current.filter((item) => item !== period));
  }, [generating, settle]);

  return {
    conversations,
    conversation,
    messages,
    actions,
    pendingText,
    loading,
    thinking,
    resolvingId,
    error,
    unavailable,
    digests,
    generating,
    load,
    loadConversations,
    send,
    planDay,
    newChat,
    open,
    resolve,
    generateDigest,
  };
}

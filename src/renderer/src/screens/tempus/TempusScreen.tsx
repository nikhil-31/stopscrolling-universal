import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarClock, History, Hourglass, MessageSquare, SendHorizontal, SquarePen, X } from "lucide-react";
import type { AppSnapshot } from "@shared/snapshot";
import type { TempusConversation, TempusDigest, TempusPeriod } from "@shared/tempus";
import { Banner, Button, EmptyState, IconButton, LoadingState, Tabs } from "../../components/ui";
import { TempusActionCard, TempusMarkdown, TempusUsageCardView } from "./TempusComponents";
import { timelineRows } from "./timeline";
import { TEMPUS_PERIODS, useTempus } from "./useTempus";
import "./tempus.css";

type TempusTab = "chat" | "digest";

const TABS: Array<{ value: TempusTab; label: string }> = [
  { value: "chat", label: "Chat" },
  { value: "digest", label: "Digest" },
];

const SUGGESTIONS = ["How did I spend this week?", "What distracts me most?", "Help me cut down on YouTube"];

const PERIOD_LABELS: Record<TempusPeriod, string> = { daily: "Daily", weekly: "Weekly" };

function updatedLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Thinking() {
  return (
    <div className="tempus-thinking" role="status">
      <span className="spinner" aria-hidden="true" />
      Tempus is thinking…
    </div>
  );
}

function HistoryDialog({
  conversations,
  currentId,
  onOpen,
  onClose,
}: {
  conversations: TempusConversation[];
  currentId: string | null;
  onOpen: (conversation: TempusConversation) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="calendar-dialog-scrim" onClick={onClose}>
      <div className="calendar-dialog tempus-history" role="dialog" aria-modal="true" aria-label="Conversations" onClick={(event) => event.stopPropagation()}>
        <IconButton className="calendar-dialog-close" label="Close" icon={X} onClick={onClose} />
        <h3>Conversations</h3>
        {conversations.length ? (
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={conversation.id === currentId ? "is-current" : ""}
                  onClick={() => onOpen(conversation)}
                >
                  {conversation.kind === "plan" ? <CalendarClock size={15} aria-hidden="true" /> : <MessageSquare size={15} aria-hidden="true" />}
                  <span className="tempus-history-title">{conversation.title || "New chat"}</span>
                  <span className="tempus-muted">{conversation.kind === "plan" ? "Day plan" : "Chat"} · {updatedLabel(conversation.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tempus-muted">No conversations yet.</p>
        )}
      </div>
    </div>
  );
}

function DigestCard({
  period,
  digest,
  generating,
  available,
  onGenerate,
}: {
  period: TempusPeriod;
  digest: TempusDigest | null;
  generating: boolean;
  available: boolean;
  onGenerate: () => void;
}) {
  const working = generating || digest?.status === "pending" || digest?.status === "processing";
  return (
    <section className="tempus-digest" aria-label={`${PERIOD_LABELS[period]} review`}>
      <header className="tempus-digest-header">
        <strong>{PERIOD_LABELS[period]} review</strong>
        {digest?.period_start ? <span className="tempus-muted">{digest.period_start}</span> : null}
        <Button size="sm" disabled={working || !available} onClick={onGenerate}>
          {working ? "Writing…" : "Generate"}
        </Button>
      </header>
      {working ? (
        <Thinking />
      ) : digest?.status === "ready" ? (
        <>
          <TempusMarkdown text={digest.content} />
          {digest.card ? <TempusUsageCardView card={digest.card} /> : null}
        </>
      ) : digest?.status === "failed" ? (
        <p className="tempus-error">Tempus couldn't write this review. Try again.</p>
      ) : (
        <p className="tempus-muted">No {period} review yet. Choose Generate to have Tempus write one.</p>
      )}
    </section>
  );
}

export function TempusScreen({ state }: { state: AppSnapshot }) {
  const tempus = useTempus(state.isAuthenticated);
  const [tab, setTab] = useState<TempusTab>("chat");
  const [draft, setDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => timelineRows(tempus.messages, tempus.actions), [tempus.messages, tempus.actions]);
  const available = !tempus.unavailable;
  const empty = !rows.length && !tempus.pendingText;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [rows.length, tempus.pendingText]);

  const send = async (text: string) => {
    if (tempus.thinking || !text.trim()) return;
    setDraft("");
    const sent = await tempus.send(text);
    if (!sent) setDraft((current) => current || text);
  };

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    void tempus.loadConversations();
  };

  if (!state.isAuthenticated) {
    return (
      <div className="tempus-screen">
        <Banner tone="warning" action={<Button size="sm" onClick={() => window.stopscrolling.navigate("account")}>Sign in</Button>}>
          Sign in to ask Tempus about your time. It reads the screen time and calendar saved to your account.
        </Banner>
        <EmptyState icon={Hourglass} title="Ask Tempus where your time goes" body="Tempus answers questions about your screen time and plans focus blocks around your calendar." />
      </div>
    );
  }

  return (
    <div className="tempus-screen">
      <header className="tempus-header">
        <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="Tempus view" />
        {tab === "chat" && available ? (
          <div className="tempus-header-actions">
            <IconButton label="History" icon={History} disabled={tempus.thinking} onClick={openHistory} />
            <IconButton label="Plan my day" icon={CalendarClock} disabled={tempus.thinking} onClick={() => void tempus.planDay()} />
            <IconButton label="New chat" icon={SquarePen} disabled={tempus.thinking} onClick={tempus.newChat} />
          </div>
        ) : null}
      </header>

      {tempus.unavailable ? (
        <Banner tone="warning" action={<Button size="sm" onClick={() => void tempus.load()}>Try again</Button>}>
          {tempus.unavailable}
        </Banner>
      ) : null}
      {tempus.error ? <Banner tone="danger">{tempus.error}</Banner> : null}

      {tab === "digest" ? (
        <div className="tempus-digests">
          {TEMPUS_PERIODS.map((period) => (
            <DigestCard
              key={period}
              period={period}
              digest={tempus.digests[period]}
              generating={tempus.generating.includes(period)}
              available={available}
              onGenerate={() => void tempus.generateDigest(period)}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="tempus-timeline" aria-live="polite">
            {tempus.loading && empty ? (
              <LoadingState label="Loading Tempus…" />
            ) : empty ? (
              <EmptyState
                icon={Hourglass}
                title="Ask Tempus where your time goes"
                body="Tempus can read your screen time, calendar and blocking setup. Nothing changes until you confirm it."
                action={
                  <div className="tempus-suggestions">
                    <button type="button" className="tempus-chip tempus-chip-button" disabled={!available} onClick={() => void tempus.planDay()}>
                      <CalendarClock size={14} aria-hidden="true" /> Plan my day
                    </button>
                    {SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} type="button" className="tempus-chip tempus-chip-button" disabled={!available} onClick={() => void send(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                }
              />
            ) : (
              rows.map((row) => {
                switch (row.kind) {
                  case "user":
                    return <div key={row.key} className="tempus-bubble tempus-bubble-user">{row.text}</div>;
                  case "assistant":
                    return <div key={row.key} className="tempus-bubble tempus-bubble-assistant"><TempusMarkdown text={row.text} /></div>;
                  case "tool":
                    return <div key={row.key} className="tempus-tool"><span className="tempus-chip">{row.label}</span></div>;
                  case "event":
                    return <p key={row.key} className="tempus-event">{row.text}</p>;
                  case "card":
                    return <TempusUsageCardView key={row.key} card={row.card} />;
                  case "action":
                    return (
                      <TempusActionCard
                        key={row.key}
                        action={row.action}
                        busy={tempus.resolvingId === row.action.id}
                        onResolve={(decision) => void tempus.resolve(row.action, decision)}
                      />
                    );
                }
              })
            )}
            {tempus.pendingText ? <div className="tempus-bubble tempus-bubble-user">{tempus.pendingText}</div> : null}
            {tempus.thinking ? <Thinking /> : null}
            <div ref={endRef} />
          </div>

          <form
            className="tempus-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              aria-label="Message Tempus"
              placeholder="Ask Tempus…"
              rows={1}
              maxLength={4000}
              value={draft}
              disabled={!available}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKey}
            />
            <IconButton
              type="submit"
              label="Send"
              icon={SendHorizontal}
              className="tempus-send"
              disabled={!available || tempus.thinking || !draft.trim()}
            />
          </form>
        </>
      )}

      {showHistory ? (
        <HistoryDialog
          conversations={tempus.conversations}
          currentId={tempus.conversation?.id ?? null}
          onClose={() => setShowHistory(false)}
          onOpen={(conversation) => {
            setShowHistory(false);
            void tempus.open(conversation);
          }}
        />
      ) : null}
    </div>
  );
}

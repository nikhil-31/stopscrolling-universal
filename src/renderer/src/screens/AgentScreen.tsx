import { useState } from "react";
import { formatDuration } from "@shared/timeline";
import type { AgentItem, AgentTitleVerdict, ProductivityVerdict } from "@shared/jev-productivity";
import type { DistractionResponse } from "@shared/types";
import type { AppSnapshot } from "@shared/snapshot";
import { Bot, ChevronDown, ChevronRight, Minus, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Banner, Button, EmptyState, Grouped, MetricCard, Tabs } from "../components/ui";

const VERDICTS: ProductivityVerdict[] = ["Productive", "Neutral", "Distracting"];

type AgentFilter = "all" | "distracting" | "neutral" | "productive" | "unrated";

const RESPONSES: Array<{ value: DistractionResponse; label: string }> = [
  { value: "off", label: "Don't block" },
  { value: "popup", label: "Popup" },
  { value: "block", label: "Block screen" },
];

function distractionResponse(value: string | undefined): DistractionResponse {
  if (value === "off") return "off";
  if (value === "block" || value === "screen" || value === "both") return "block";
  return "popup";
}

const FILTERS: Array<{ value: AgentFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "distracting", label: "Distracting" },
  { value: "neutral", label: "Neutral" },
  { value: "productive", label: "Productive" },
  { value: "unrated", label: "Unrated" },
];

function verdictLabel(verdict: AgentTitleVerdict) {
  if (verdict.verdict) return verdict.verdict;
  return verdict.confidence !== null ? "Unsure" : "Unrated";
}

function verdictClass(verdict: string | null) {
  return `agent-verdict agent-verdict-${(verdict ?? "unrated").toLowerCase()}`;
}

function matchesFilter(item: AgentItem, filter: AgentFilter) {
  if (filter === "all") return true;
  if (filter === "unrated") return item.verdict === null;
  return item.verdict?.toLowerCase() === filter;
}

function OverrideControl({ current, onPick }: { current: string | null; onPick: (verdict: ProductivityVerdict) => void }) {
  return (
    <div className="agent-override" role="group" aria-label="Set verdict">
      {VERDICTS.map((verdict) => (
        <button
          key={verdict}
          type="button"
          className={current === verdict ? "active" : ""}
          aria-pressed={current === verdict}
          onClick={() => onPick(verdict)}
        >
          {verdict}
        </button>
      ))}
    </div>
  );
}

function PreviewButtons({ label, site, name }: { label: string; site: string; name: string }) {
  return (
    <div className="agent-preview">
      <Button size="sm" variant="ghost" aria-label={`Block screen for ${name}`} onClick={() => window.stopscrolling.previewBlockScreen()}>
        Block screen
      </Button>
      <Button size="sm" variant="ghost" aria-label={`Popup for ${name}`} onClick={() => window.stopscrolling.previewDistractionPopup(label, site)}>
        Popup
      </Button>
    </div>
  );
}

function pageSite(title: string, parentLabel: string) {
  return title.toLowerCase() === parentLabel.toLowerCase() ? "" : parentLabel;
}

function AgentRow({ item }: { item: AgentItem }) {
  const [open, setOpen] = useState(false);
  const expandable = item.titles.length > 1;
  return (
    <article className="agent-row">
      <div className="agent-row-main">
        {expandable ? (
          <button type="button" className="button button-ghost button-sm" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} pages for ${item.label}`} onClick={() => setOpen((value) => !value)}>
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : null}
        <div className="agent-row-copy">
          <span className="agent-row-label">{item.label}</span>
          <span className="agent-row-subtitle">{item.subtitle}</span>
        </div>
        <span className="agent-row-time">{formatDuration(item.seconds)}</span>
        <span className={verdictClass(item.verdict)}>{item.verdict ?? "Unrated"}</span>
        {item.source ? <span className="agent-source">{item.source === "user" ? "You" : "JEV"}</span> : null}
        {item.verdict === "Distracting" ? <PreviewButtons label={item.label} site="" name={item.label} /> : null}
        <OverrideControl current={item.verdict} onPick={(verdict) => window.stopscrolling.agentOverride(item.key, verdict)} />
      </div>
      {open ? (
        <div className="agent-titles">
          {item.titles.map((title) => (
            <div className="agent-title" key={title.key}>
              <span className="agent-title-label">{title.title}</span>
              <span className="agent-row-time">{formatDuration(title.seconds)}</span>
              <span className={verdictClass(title.verdict)}>{verdictLabel(title)}</span>
              {title.verdict === "Distracting" ? (
                <PreviewButtons label={title.title} site={pageSite(title.title, item.label)} name={title.title} />
              ) : null}
              <OverrideControl current={title.verdict} onPick={(verdict) => window.stopscrolling.agentOverride(title.key, verdict)} />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function AgentScreen({ state }: { state: AppSnapshot }) {
  const [filter, setFilter] = useState<AgentFilter>("all");
  const { agent } = state;
  const total = agent.totals.Productive + agent.totals.Neutral + agent.totals.Distracting + agent.totals.unrated;
  const share = (seconds: number) => (total ? (seconds / total) * 100 : 0);
  const visible = agent.items.filter((item) => matchesFilter(item, filter));
  const reviewed = agent.lastReviewAt ? new Date(agent.lastReviewAt).toLocaleString() : "never";

  return (
    <div className="agent-screen">
      <header className="agent-header">
        <div className="agent-header-copy">
          <h1>Agent</h1>
          <p>Last review: {reviewed}</p>
        </div>
        <div className="agent-header-actions">
          {agent.reviewing ? (
            <span className="agent-progress">{agent.progress.done} of {agent.progress.total}</span>
          ) : null}
          <Button icon={Sparkles} variant="primary" disabled={agent.reviewing || !agent.ratingAvailable} onClick={() => window.stopscrolling.agentReviewAll()}>
            {agent.reviewing ? "Reviewing…" : "Review now"}
          </Button>
        </div>
      </header>

      {agent.ratingAvailable ? null : state.isAuthenticated ? (
        <Banner tone="warning">
          Ratings are unavailable right now. Check that sync is on in Settings; ratings resume when the server is reachable.
        </Banner>
      ) : (
        <Banner tone="warning" action={<Button size="sm" onClick={() => window.stopscrolling.navigate("account")}>Sign in</Button>}>
          Sign in so the agent can rate what you use. Ratings are saved to your account.
        </Banner>
      )}

      <section className="stats">
        <MetricCard icon={ThumbsUp} tone="success" label="Productive" value={formatDuration(agent.totals.Productive)} />
        <MetricCard icon={Minus} tone="accent" label="Neutral" value={formatDuration(agent.totals.Neutral)} />
        <MetricCard icon={ThumbsDown} tone="orange" label="Distracting" value={formatDuration(agent.totals.Distracting)} />
      </section>

      <div className="agent-bar" aria-hidden="true">
        <div className="agent-bar-segment agent-bar-productive" style={{ width: `${share(agent.totals.Productive)}%` }} />
        <div className="agent-bar-segment agent-bar-neutral" style={{ width: `${share(agent.totals.Neutral)}%` }} />
        <div className="agent-bar-segment agent-bar-distracting" style={{ width: `${share(agent.totals.Distracting)}%` }} />
      </div>

      <Grouped title="When Jev rates the front window distracting">
        <Tabs
          items={RESPONSES}
          value={distractionResponse(state.settings.distractionResponse)}
          onChange={(distractionResponse) => window.stopscrolling.updateSettings({ distractionResponse })}
          ariaLabel="Distraction response"
        />
      </Grouped>

      <Tabs items={FILTERS} value={filter} onChange={setFilter} ariaLabel="Filter by verdict" />

      {visible.length ? (
        <div className="agent-list">
          {visible.map((item) => <AgentRow key={item.key} item={item} />)}
        </div>
      ) : (
        <EmptyState
          icon={Bot}
          title={agent.items.length ? "Nothing matches" : "No activity yet"}
          body={agent.items.length ? "Nothing matches this filter." : "The agent reviews apps and sites after you spend a moment with them."}
        />
      )}
    </div>
  );
}

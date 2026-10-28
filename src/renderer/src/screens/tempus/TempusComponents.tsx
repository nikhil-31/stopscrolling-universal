import type { CSSProperties } from "react";
import { Wand2 } from "lucide-react";
import { appShareBarPercent, colorForCategory } from "@shared/timeline";
import type { TempusAction, TempusUsageCard } from "@shared/tempus";
import { CategoryMark } from "../../components/GameMark";
import { Badge, Button } from "../../components/ui";
import { parseMarkdown, type MdSpan } from "./markdown";

function Spans({ spans }: { spans: MdSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.code) return <code key={index}>{span.text}</code>;
        if (span.bold) return <strong key={index}>{span.text}</strong>;
        if (span.italic) return <em key={index}>{span.text}</em>;
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

export function TempusMarkdown({ text }: { text: string }) {
  return (
    <div className="tempus-markdown">
      {parseMarkdown(text).map((block, index) => {
        switch (block.kind) {
          case "heading":
            return <p key={index} className={`tempus-md-heading tempus-md-h${Math.min(block.level, 3)}`}><Spans spans={block.spans} /></p>;
          case "bullet":
            return <p key={index} className="tempus-md-item"><span className="tempus-md-marker" aria-hidden="true">•</span><span><Spans spans={block.spans} /></span></p>;
          case "numbered":
            return <p key={index} className="tempus-md-item"><span className="tempus-md-marker">{block.number}</span><span><Spans spans={block.spans} /></span></p>;
          case "paragraph":
            return <p key={index}><Spans spans={block.spans} /></p>;
          case "divider":
            return <hr key={index} />;
          case "table":
            return (
              <div key={index} className="tempus-md-table">
                <table>
                  {block.header.length ? (
                    <thead>
                      <tr>{block.header.map((cell, column) => <th key={column}><Spans spans={cell} /></th>)}</tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>{row.map((cell, column) => <td key={column}><Spans spans={cell} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

export function TempusUsageCardView({ card }: { card: TempusUsageCard }) {
  const bars = card.timeline.bars;
  const peak = Math.max(1, ...bars.map((bar) => bar.seconds));
  const hourly = card.timeline.kind === "hour";
  return (
    <section className="tempus-usage" aria-label={card.title}>
      <header className="tempus-usage-header">
        <span className="tempus-usage-eyebrow">Screen time</span>
        <strong>{card.title}</strong>
        <span className="tempus-usage-total">{card.total}</span>
      </header>
      {bars.length ? (
        <div className={`tempus-usage-bars ${hourly ? "is-hourly" : "is-daily"}`} aria-hidden="true">
          {bars.map((bar, index) => (
            <div key={`${bar.label}-${index}`} className="tempus-usage-bar" title={bar.label}>
              <span
                className={`tempus-usage-bar-fill ${bar.categories?.length ? "is-stacked" : ""}`}
                style={{ height: `${(bar.seconds / peak) * 100}%` }}
              >
                {bar.categories?.map((category) => (
                  <span key={category.name} style={{ flexGrow: category.seconds, background: colorForCategory(category.name) }} />
                ))}
              </span>
              {!hourly || index % 6 === 0 ? <span className="tempus-usage-bar-label">{bar.label}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {card.categories.length ? (
        <>
          <div className="tempus-usage-split" aria-hidden="true">
            {card.categories.map((category) => (
              <span key={category.name} style={{ flexGrow: category.seconds, background: colorForCategory(category.name) }} />
            ))}
          </div>
          <div className="tempus-usage-categories">
            {card.categories.map((category) => (
              <span key={category.name} className="tempus-chip">
                <span className="legend-dot" style={{ ["--swatch" as string]: colorForCategory(category.name) }} />
                {category.name} <span className="tempus-muted">{category.time}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
      {card.apps.length ? (
        <ul className="tempus-usage-apps">
          {card.apps.map((app) => (
            <li key={app.name} style={{ "--bar-color": colorForCategory(app.category) } as CSSProperties}>
              <CategoryMark color={colorForCategory(app.category)} />
              <span className="tempus-usage-app-copy">
                <span className="tempus-usage-app-name">
                  {app.name}
                  {app.category ? <span className="tempus-muted"> · {app.category}</span> : null}
                </span>
                <span className="activity-app-bar" aria-hidden="true">
                  <span style={{ width: `${appShareBarPercent(card.total_seconds ? app.seconds / card.total_seconds : 0)}%` }} />
                </span>
              </span>
              <span className="tempus-usage-app-time">{app.time}</span>
              <span className="tempus-muted tempus-usage-app-share">{app.share}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const ACTION_STATUS: Record<TempusAction["status"], { label: string; tone: "neutral" | "accent" | "success" | "danger" }> = {
  pending: { label: "Waiting for you", tone: "accent" },
  applied: { label: "Applied", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export function TempusActionCard({
  action,
  busy,
  onResolve,
}: {
  action: TempusAction;
  busy: boolean;
  onResolve: (decision: "confirm" | "reject") => void;
}) {
  const status = ACTION_STATUS[action.status];
  return (
    <section className="tempus-action" aria-label="Proposed change">
      <header className="tempus-action-header">
        <Wand2 size={15} aria-hidden="true" />
        <strong>Proposed change</strong>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <p>{action.summary}</p>
      {action.status === "failed" && action.error ? <p className="tempus-error">{action.error}</p> : null}
      {action.status === "pending" ? (
        <div className="tempus-action-buttons">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onResolve("reject")}>Reject</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => onResolve("confirm")}>Confirm</Button>
        </div>
      ) : null}
    </section>
  );
}

import { formatClock, formatDuration } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import { Clock3, Globe2, Laptop2, Layers3, X } from "lucide-react";
import { Badge, IconButton } from "./ui";

export function Inspector({ state }: { state: AppSnapshot }) {
  if (state.inspector.kind === "none") return null;
  if (state.inspector.kind === "segment" && state.inspector.segment) {
    const segment = state.inspector.segment;
    const duration = (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000;
    return (
      <aside className="inspector" aria-label="Session inspector">
        <IconButton
          className="inspector-close"
          label="Close inspector"
          icon={X}
          onClick={() => window.stopscrolling.selectInspector({ kind: "none" })}
        />
        <div className="inspector-kicker">Session details</div>
        <h2>{segment.label}</h2>
        <p className="muted">{segment.appName}</p>
        <div className="inspector-meta">
          <Badge tone="accent">{segment.category}</Badge>
          <Badge><Laptop2 size={11} aria-hidden="true" />{segment.deviceName}</Badge>
          {segment.isLive ? <Badge tone="danger" dot>Live</Badge> : null}
        </div>
        <div className="inspector-duration">
          <span className="small muted">Time tracked</span>
          <strong>{formatDuration(duration)}</strong>
          <span className="small muted">
            <Clock3 size={11} aria-hidden="true" />{" "}
            {formatClock(segment.start)} – {formatClock(segment.end)}
          </span>
        </div>
        {segment.url ? (
          <div>
            <div className="inspector-kicker"><Globe2 size={11} aria-hidden="true" /> URL</div>
            <p className="inspector-url" title={segment.url}>{segment.url}</p>
          </div>
        ) : null}
      </aside>
    );
  }
  if (state.inspector.block) {
    const block = state.inspector.block;
    return (
      <aside className="inspector" aria-label="Activity block inspector">
        <IconButton
          className="inspector-close"
          label="Close inspector"
          icon={X}
          onClick={() => window.stopscrolling.selectInspector({ kind: "none" })}
        />
        <div className="inspector-kicker">Activity block</div>
        <h2>{block.title}</h2>
        <p className="muted">{block.subtitle}</p>
        <div className="inspector-meta">
          <Badge tone="accent">{block.category}</Badge>
          <Badge><Laptop2 size={11} aria-hidden="true" />{block.deviceName}</Badge>
          <Badge><Layers3 size={11} aria-hidden="true" />{block.items.length} sessions</Badge>
        </div>
        <div className="inspector-duration">
          <span className="small muted">Focused block</span>
          <strong>{formatDuration(block.durationSeconds)}</strong>
          <span className="small muted">{formatClock(block.start)} – {formatClock(block.end)}</span>
        </div>
        <div className="inspector-kicker">Activity</div>
        {block.items.map((item) => (
          <div className="data-row" key={item.id}>
            <span className="row-copy">
              <span className="row-title">{item.title}</span>
              <span className="row-subtitle">{item.appName}</span>
            </span>
            <span className="row-value">{formatDuration(item.durationSeconds)}</span>
          </div>
        ))}
      </aside>
    );
  }
  return null;
}

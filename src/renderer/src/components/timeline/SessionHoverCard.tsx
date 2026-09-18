import { formatClock, formatDuration } from "@shared/timeline";
import type { ScreenTimeSessionBlock } from "@shared/types";
import { AppWindow, Clock3, Globe2, Layers3 } from "lucide-react";
import { createPortal } from "react-dom";
import { Badge } from "../ui";

const CARD_WIDTH = 240;
const CARD_HEIGHT = 168;
const OFFSET = 12;

export function hoverCardPosition(clientX: number, clientY: number) {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 720 : window.innerHeight;
  let left = clientX + OFFSET;
  let top = clientY + OFFSET;
  if (left + CARD_WIDTH > vw - 8) left = clientX - CARD_WIDTH - OFFSET;
  if (left < 8) left = 8;
  if (top + CARD_HEIGHT > vh - 8) top = clientY - CARD_HEIGHT - OFFSET;
  if (top < 8) top = 8;
  return { left, top };
}

export function SessionHoverCard({
  block,
  x,
  y,
}: {
  block: ScreenTimeSessionBlock;
  x: number;
  y: number;
}) {
  const { left, top } = hoverCardPosition(x, y);
  return createPortal(
    <div
      className="native-hover-card"
      data-testid="session-hover-card"
      style={{ left, top }}
    >
      {block.title ? <div className="native-hover-title">{block.title}</div> : null}
      <div className="native-hover-heading">
        <strong>{formatClock(block.start)} – {formatClock(block.end)}</strong>
        {block.category ? <Badge tone="accent">{block.category}</Badge> : null}
      </div>
      <div className="native-hover-meta">
        <span><Clock3 size={11} />{formatDuration(block.durationSeconds)}</span>
        <span><Layers3 size={11} />{block.items.length} {block.items.length === 1 ? "item" : "items"}</span>
      </div>
      {block.items.length ? (
        <div className="native-hover-items">
          {block.items.slice(0, 4).map((item) => (
            <div key={item.id}>
              {item.url ? <Globe2 size={11} /> : <AppWindow size={11} />}
              <span>{item.appName}</span>
              <span>{formatDuration(item.durationSeconds)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

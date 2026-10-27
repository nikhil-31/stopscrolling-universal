import { appShareBarPercent, colorForCategory, formatDuration, percentLabel, rankedAppsBySeconds } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { gameAssetUrl } from "@shared/game-assets";
import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, SquarePen } from "lucide-react";
import { IconButton } from "../ui";

/** Rows shown before "Show all", sized to match the Focus and category column beside it. */
export const COLLAPSED_APP_ROWS = 8;

/** Share-bar fills for the Focus rows, keyed by verdict. */
export const FOCUS_COLORS: Record<string, string> = {
  Productive: "var(--success)",
  Neutral: "var(--text-tertiary)",
  Distracting: "var(--orange)",
  Unrated: "var(--line-strong)",
};

export function AppsWebsitesShareRow({
  app,
  selected,
  onSelect,
  color,
}: {
  app: ScreenTimeAppBreakdown;
  selected: boolean;
  onSelect: () => void;
  /** Fill for the share bar; the brand color when absent. */
  color?: string;
}) {
  return (
    <button
      type="button"
      className="activity-app-main"
      style={color ? ({ "--bar-color": color } as CSSProperties) : undefined}
      aria-pressed={selected}
      aria-label={`Highlight ${app.label} on the timeline`}
      onClick={onSelect}
    >
      <span className="activity-app-pct">{percentLabel(app.percentage)}</span>
      <span className="activity-app-bar" aria-hidden="true">
        <span style={{ width: `${appShareBarPercent(app.percentage)}%` }} />
      </span>
      <span className="activity-app-name">
        {app.assetId ? <img className="game-asset game-asset-inline" alt="" src={gameAssetUrl(app.assetId)} /> : null}
        <span>{app.label}</span>
      </span>
      <span className="activity-app-time">{formatDuration(app.seconds)}</span>
    </button>
  );
}

export function FocusList({
  rows,
  selectedKey = null,
  onSelect,
}: {
  rows: ScreenTimeAppBreakdown[];
  selectedKey?: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <section className="activity-panel" aria-label="Focus">
      <div className="activity-panel-label">Focus</div>
      {rows.length ? (
        <div className="activity-app-list">
          {rows.map((row) => {
            const selected = selectedKey === row.key;
            return (
              <div key={row.key} className={`activity-app-row ${selected ? "is-selected" : ""}`}>
                <AppsWebsitesShareRow
                  app={row}
                  selected={selected}
                  onSelect={() => onSelect(selected ? null : row.key)}
                  color={FOCUS_COLORS[row.key]}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="calendar-empty-copy">No tracked time in this period.</p>
      )}
    </section>
  );
}

export function AppsWebsitesList({
  state,
  selectedKey = null,
  onSelect,
  onLabelApp,
}: {
  state: AppSnapshot;
  selectedKey?: string | null;
  onSelect: (key: string | null) => void;
  onLabelApp: (app: ScreenTimeAppBreakdown) => void;
}) {
  const apps = rankedAppsBySeconds(state.snapshot.apps);
  const [expanded, setExpanded] = useState(false);
  const collapsible = apps.length > COLLAPSED_APP_ROWS;
  const visible = expanded || !collapsible ? apps : collapsedApps(apps, selectedKey);

  return (
    <section className="activity-panel" aria-label="Apps and websites">
      <div className="activity-panel-label">Apps & Websites</div>
      {apps.length ? (
        <div className="activity-app-list">
          {visible.map((app) => {
            const selected = selectedKey === app.key;
            return (
              <div
                key={app.key}
                className={`activity-app-row ${selected ? "is-selected" : ""}`}
              >
                <AppsWebsitesShareRow
                  app={app}
                  selected={selected}
                  onSelect={() => onSelect(selected ? null : app.key)}
                  color={colorForCategory(app.category)}
                />
                <IconButton
                  label={`Label ${app.label}`}
                  icon={SquarePen}
                  onClick={() => onLabelApp(app)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="calendar-empty-copy">No apps tracked in this period.</p>
      )}
      {collapsible ? (
        <button
          type="button"
          className="activity-list-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : `Show all ${apps.length}`}
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      ) : null}
    </section>
  );
}

function collapsedApps(apps: ScreenTimeAppBreakdown[], selectedKey: string | null) {
  const top = apps.slice(0, COLLAPSED_APP_ROWS);
  const selected = selectedKey ? apps.find((app) => app.key === selectedKey) : undefined;
  return selected && !top.includes(selected) ? [...top, selected] : top;
}

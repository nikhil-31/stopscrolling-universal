import { appShareBarPercent, formatDuration, percentLabel, rankedAppsBySeconds } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { gameAssetUrl } from "@shared/game-assets";
import { SquarePen } from "lucide-react";
import { IconButton } from "../ui";

export function AppsWebsitesShareRow({
  app,
  selected,
  onSelect,
}: {
  app: ScreenTimeAppBreakdown;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="activity-app-main"
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

  return (
    <section className="activity-panel" aria-label="Apps and websites">
      <div className="activity-panel-label">Apps & Websites</div>
      {apps.length ? (
        <div className="activity-app-list">
          {apps.map((app) => {
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
    </section>
  );
}

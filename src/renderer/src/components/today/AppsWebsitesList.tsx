import { formatDuration, percentLabel } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { SquarePen } from "lucide-react";
import { IconButton } from "../ui";

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
  const apps = state.snapshot.apps;

  return (
    <section className="activity-panel" aria-label="Apps and websites">
      <div className="activity-panel-label">Apps & Websites</div>
      {apps.length ? (
        <div className="activity-app-list">
          {apps.map((app) => {
            const percent = percentLabel(app.percentage);
            const bar = Math.min(100, Math.max(3, app.percentage > 1 ? app.percentage : app.percentage * 100));
            const selected = selectedKey === app.key;
            return (
              <div
                key={app.key}
                className={`activity-app-row ${selected ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="activity-app-main"
                  aria-pressed={selected}
                  aria-label={`Highlight ${app.label} on the timeline`}
                  onClick={() => onSelect(selected ? null : app.key)}
                >
                  <span className="activity-app-pct">{percent}</span>
                  <span className="activity-app-bar" aria-hidden="true">
                    <span style={{ width: `${bar}%` }} />
                  </span>
                  <span className="activity-app-name">{app.label}</span>
                  <span className="activity-app-time">{formatDuration(app.seconds)}</span>
                </button>
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

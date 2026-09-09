import { formatHourMinute } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { SquarePen } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../ui";

export function AppsWebsitesList({
  state,
  onLabelApp,
}: {
  state: AppSnapshot;
  onLabelApp: (app: ScreenTimeAppBreakdown) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const apps = state.snapshot.apps;

  return (
    <section className="activity-panel" aria-label="Apps and websites">
      <div className="activity-panel-label">Apps & Websites</div>
      {apps.length ? (
        <div className="activity-app-list">
          {apps.map((app) => {
            const percent = Math.round(app.percentage * 100);
            return (
              <div
                key={app.key}
                className={`activity-app-row ${selected === app.key ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="activity-app-main"
                  onClick={() => {
                    setSelected(app.key);
                    const segment = state.snapshot.listSegments.find((item) => (
                      `${item.appName}|${item.subtitle}|${item.category}` === app.key
                    ));
                    if (segment) window.stopscrolling.selectInspector({ kind: "segment", segment });
                  }}
                >
                  <span className="activity-app-pct">{percent < 1 ? "<1%" : `${percent}%`}</span>
                  <span className="activity-app-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.max(3, percent))}%` }} />
                  </span>
                  <span className="activity-app-name">{displayName(app)}</span>
                  <span className="activity-app-time">{formatHourMinute(app.seconds)}</span>
                </button>
                <IconButton
                  label={`Label ${displayName(app)}`}
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

function displayName(app: ScreenTimeAppBreakdown) {
  const source = app.subtitle || app.label;
  try {
    if (source.startsWith("http://") || source.startsWith("https://")) {
      return new URL(source).hostname.replace(/^www\./, "");
    }
  } catch {
    return app.label;
  }
  return app.label;
}

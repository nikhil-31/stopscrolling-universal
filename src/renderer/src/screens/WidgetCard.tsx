import type { DesktopWidgetSummary } from "@shared/desktop-widget";
import { appShareBarPercent, formatTrackedDuration, percentLabel } from "@shared/timeline";
import "./WidgetCard.css";

const VERDICTS = [
  { key: "productive", label: "Productive", field: "productiveSeconds" },
  { key: "neutral", label: "Neutral", field: "neutralSeconds" },
  { key: "distracting", label: "Distracting", field: "distractingSeconds" },
] as const;

function share(seconds: number, total: number) {
  if (total <= 0 || seconds <= 0) return 0;
  return (seconds / total) * 100;
}

export function WidgetCard({
  summary,
  onOpenToday,
  onHide,
}: {
  summary: DesktopWidgetSummary;
  onOpenToday: () => void;
  onHide: () => void;
}) {
  const unrated = summary.unratedSeconds;
  const total = summary.productiveSeconds + summary.neutralSeconds + summary.distractingSeconds + unrated;
  const shareBase = total > 0 ? total : summary.top.reduce((sum, app) => sum + app.seconds, 0);
  const empty = total <= 0 && summary.top.length === 0;
  const segments = [
    ...VERDICTS.map((verdict) => ({ ...verdict, seconds: summary[verdict.field] })),
    ...(unrated > 0 ? [{ key: "unrated" as const, label: "Unrated", seconds: unrated }] : []),
  ];

  return (
    <div className="widget-shell">
      <section className="widget-card" aria-label="Time" onClick={onOpenToday}>
        <header className="widget-header">
          <span>Stop Scrolling</span>
          <button
            type="button"
            className="widget-hide"
            aria-label="Hide desktop widget"
            onClick={(event) => {
              event.stopPropagation();
              onHide();
            }}
          >
            Hide
          </button>
        </header>
        {empty ? (
          <p className="widget-empty">No tracked time in this period.</p>
        ) : (
          <div className="widget-body">
            <div className="widget-open">
              {total > 0 ? (
                <span className="widget-bar" aria-hidden="true">
                  {segments.map((segment) => (
                    <span
                      key={segment.key}
                      className={`widget-bar-segment widget-bar-${segment.key}`}
                      style={{ width: `${share(segment.seconds, total)}%` }}
                    />
                  ))}
                </span>
              ) : null}
              <ul className="widget-verdicts" aria-label="Focus">
                {segments.map((segment) => (
                  <li key={segment.key}>
                    <span className={`widget-swatch widget-swatch-${segment.key}`} aria-hidden="true" />
                    <span>{segment.label}</span>
                    <span className="widget-time">{formatTrackedDuration(segment.seconds)}</span>
                  </li>
                ))}
              </ul>
              {summary.top.length ? (
                <>
                  <span className="widget-apps-label">Apps & Websites</span>
                  <ol className="widget-apps" aria-label="Apps and websites">
                    {summary.top.map((app) => {
                      const share = shareBase > 0 ? app.seconds / shareBase : 0;
                      return (
                        <li key={app.key}>
                          <span className="widget-app-pct">{percentLabel(share)}</span>
                          <span className="widget-app-meter" aria-hidden="true">
                            <span style={{ width: `${appShareBarPercent(share)}%` }} />
                          </span>
                          <span className="widget-app-name">{app.label}</span>
                          <span className="widget-time">{formatTrackedDuration(app.seconds)}</span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

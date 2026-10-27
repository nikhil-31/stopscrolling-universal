import type { ThemePreference } from "./types";
import type { ScreenTimeAppBreakdown, ScreenTimeTimelineSegment } from "./types";
import { productivityBreakdown } from "./jev-productivity";
import { rankedAppsBySeconds } from "./timeline";

export interface DesktopWidgetApp {
  key: string;
  label: string;
  seconds: number;
}

/** Totals copied from a snapshot the main window already published. */
export interface DesktopWidgetSummary {
  productiveSeconds: number;
  neutralSeconds: number;
  distractingSeconds: number;
  unratedSeconds: number;
  top: DesktopWidgetApp[];
}

export interface DesktopWidgetState extends DesktopWidgetSummary {
  appearance: ThemePreference;
  /** Matches the main snapshot version so a late reply cannot overwrite a newer one. */
  dataVersion: number;
}

const TOP_APP_LIMIT = 5;

function verdictSeconds(
  rows: ReturnType<typeof productivityBreakdown>,
  key: string,
) {
  return rows.find((row) => row.key === key)?.seconds ?? 0;
}

/**
 * Sums verdicts already stored on `listSegments` and keeps the first five apps
 * already ranked on the snapshot. This does not classify or look up a cache.
 */
export function desktopWidgetSummary(snapshot: {
  listSegments: Array<Pick<ScreenTimeTimelineSegment, "start" | "end" | "verdict">>;
  apps: ScreenTimeAppBreakdown[];
}): DesktopWidgetSummary {
  const rows = productivityBreakdown(snapshot.listSegments);
  return {
    productiveSeconds: verdictSeconds(rows, "Productive"),
    neutralSeconds: verdictSeconds(rows, "Neutral"),
    distractingSeconds: verdictSeconds(rows, "Distracting"),
    unratedSeconds: verdictSeconds(rows, "Unrated"),
    top: rankedAppsBySeconds(snapshot.apps).slice(0, TOP_APP_LIMIT).map((app) => ({
      key: app.key,
      label: app.label,
      seconds: app.seconds,
    })),
  };
}

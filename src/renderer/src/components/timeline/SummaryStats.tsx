import { formatDuration, percentLabel } from "@shared/timeline";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { Clock3, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { MetricCard, Skeleton } from "../ui";

/** Tracked, productive, and distracting time plus the top app, shown above Today and Insights. */
export function SummaryStats({
  trackedSeconds,
  trackedDetail,
  focus,
  topApp,
}: {
  trackedSeconds: number;
  trackedDetail: string;
  focus: ScreenTimeAppBreakdown[];
  topApp: ScreenTimeAppBreakdown | undefined;
}) {
  const productive = focus.find((row) => row.key === "Productive");
  const distracting = focus.find((row) => row.key === "Distracting");
  return (
    <section className="stats summary-stats">
      <MetricCard
        label="Tracked time"
        value={formatDuration(trackedSeconds)}
        detail={trackedDetail}
        icon={Clock3}
      />
      <MetricCard
        label="Productive"
        value={formatDuration(productive?.seconds ?? 0)}
        detail={productive ? `${percentLabel(productive.percentage)} of tracked time` : "Nothing rated productive"}
        icon={ThumbsUp}
        tone="success"
      />
      <MetricCard
        label="Distracting"
        value={formatDuration(distracting?.seconds ?? 0)}
        detail={distracting ? `${percentLabel(distracting.percentage)} of tracked time` : "Nothing rated distracting"}
        icon={ThumbsDown}
        tone="orange"
      />
      <MetricCard
        label="Top app or website"
        value={topApp ? <span className="metric-value-text" title={topApp.label}>{topApp.label}</span> : "None"}
        detail={topApp ? `${formatDuration(topApp.seconds)} · ${percentLabel(topApp.percentage)}` : "No app data yet"}
        icon={Sparkles}
        tone="violet"
      />
    </section>
  );
}

export function SummaryStatsSkeleton() {
  return (
    <section className="stats summary-stats" aria-hidden="true">
      <Skeleton className="insights-skeleton-metric" />
      <Skeleton className="insights-skeleton-metric" />
      <Skeleton className="insights-skeleton-metric" />
      <Skeleton className="insights-skeleton-metric" />
    </section>
  );
}

import type { AppSnapshot } from "@shared/snapshot";
import { TimelineGroup } from "../timeline";

export function ActivityTimeline({
  state,
  highlightedAppKey = null,
}: {
  state: AppSnapshot;
  highlightedAppKey?: string | null;
}) {
  return (
    <section className="activity-panel activity-timeline-panel" aria-label="Timeline">
      <div className="activity-panel-label">Timeline</div>
      <TimelineGroup
        timelines={state.timelines}
        devices={state.devices}
        highlightedAppKey={highlightedAppKey}
      />
    </section>
  );
}

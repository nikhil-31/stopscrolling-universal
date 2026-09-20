import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeDeviceTimeline } from "@shared/types";
import { TimelineGroup } from "../timeline";

export function ActivityTimeline({
  state,
  timelines = state.timelines,
}: {
  state: AppSnapshot;
  timelines?: ScreenTimeDeviceTimeline[];
}) {
  return (
    <section className="activity-panel activity-timeline-panel" aria-label="Timeline">
      <div className="activity-panel-label">Timeline</div>
      <TimelineGroup
        timelines={timelines}
        devices={state.devices}
      />
    </section>
  );
}

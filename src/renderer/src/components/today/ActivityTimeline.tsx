import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeDeviceTimeline } from "@shared/types";
import { TimelineGroup } from "../timeline";
import { PanelHeader } from "./PanelHeader";

export function ActivityTimeline({
  state,
  timelines = state.timelines,
}: {
  state: AppSnapshot;
  timelines?: ScreenTimeDeviceTimeline[];
}) {
  return (
    <section className="activity-panel activity-timeline-panel" aria-label="Timeline">
      <PanelHeader title="Timeline" subtitle="Activity across your visible devices" />
      <TimelineGroup
        timelines={timelines}
        devices={state.devices}
      />
    </section>
  );
}

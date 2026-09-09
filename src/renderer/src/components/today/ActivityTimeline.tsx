import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeDeviceTimeline } from "@shared/types";
import { todayPeriodBounds } from "@shared/timeline";
import { TimelineGroup } from "../timeline";

export function ActivityTimeline({ state }: { state: AppSnapshot }) {
  const bounds = todayPeriodBounds(state.todayPeriod, new Date(state.todayDay));
  return (
    <section className="activity-panel activity-timeline-panel" aria-label="Timeline">
      <div className="activity-panel-label">Timeline</div>
      <TimelineGroup timelines={compactTimelines(state.timelines, bounds)} compact />
    </section>
  );
}

function compactTimelines(
  timelines: ScreenTimeDeviceTimeline[],
  bounds: { start: Date; end: Date },
): ScreenTimeDeviceTimeline[] {
  const window = {
    dayStart: bounds.start.toISOString(),
    dayEnd: bounds.end.toISOString(),
  };
  if (!timelines.length) {
    return [{
      id: "activity",
      deviceName: "This device",
      devicePlatform: "",
      timeZoneIdentifier: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...window,
      segments: [],
      blocks: [],
    }];
  }
  if (timelines.length === 1) {
    return [{ ...timelines[0], ...window }];
  }
  return [{
    id: "activity",
    deviceName: timelines[0].deviceName,
    devicePlatform: timelines[0].devicePlatform,
    timeZoneIdentifier: timelines[0].timeZoneIdentifier,
    ...window,
    segments: timelines.flatMap((timeline) => timeline.segments),
    blocks: timelines.flatMap((timeline) => timeline.blocks),
  }];
}

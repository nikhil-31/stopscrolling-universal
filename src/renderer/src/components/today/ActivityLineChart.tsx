import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimePeriodBucket } from "@shared/types";
import { DeviceLineChart } from "../timeline";

export function ActivityLineChart({
  state,
  buckets,
}: {
  state: AppSnapshot;
  buckets: ScreenTimePeriodBucket[];
}) {
  return (
    <section className="activity-panel activity-line-panel" aria-label="Activity by device">
      <div className="activity-panel-label">Activity by device</div>
      <DeviceLineChart buckets={buckets} period={state.todayPeriod} devices={state.devices} />
    </section>
  );
}

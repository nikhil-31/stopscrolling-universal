import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimePeriodBucket } from "@shared/types";
import { DeviceLineChart } from "../timeline";
import { PanelHeader } from "./PanelHeader";

export function ActivityLineChart({
  state,
  buckets,
}: {
  state: AppSnapshot;
  buckets: ScreenTimePeriodBucket[];
}) {
  return (
    <section className="activity-panel activity-line-panel" aria-label="Activity by device">
      <PanelHeader title="Activity by device" subtitle="Tracked time across this day" />
      <DeviceLineChart buckets={buckets} period={state.todayPeriod} devices={state.devices} />
    </section>
  );
}

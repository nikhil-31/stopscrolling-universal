import type { AppSnapshot } from "@shared/snapshot";
import { PieChart } from "../timeline";

export function ActivityPie({ state }: { state: AppSnapshot }) {
  return (
    <section className="activity-panel activity-pie-panel" aria-label="Time by category">
      <div className="activity-panel-label">Time by category</div>
      <PieChart categories={state.snapshot.categories} />
    </section>
  );
}

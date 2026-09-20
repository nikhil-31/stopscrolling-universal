import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeCategoryBreakdown } from "@shared/types";
import { PieChart } from "../timeline";

export function ActivityPie({
  state,
  categories = state.snapshot.categories,
}: {
  state: AppSnapshot;
  categories?: ScreenTimeCategoryBreakdown[];
}) {
  return (
    <section className="activity-panel activity-pie-panel" aria-label="Time by category">
      <div className="activity-panel-label">Time by category</div>
      <PieChart categories={categories} />
    </section>
  );
}

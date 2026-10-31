import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeCategoryBreakdown } from "@shared/types";
import { PieChart } from "../timeline";
import { PanelHeader } from "./PanelHeader";

export function ActivityPie({
  state,
  categories = state.snapshot.categories,
}: {
  state: AppSnapshot;
  categories?: ScreenTimeCategoryBreakdown[];
}) {
  return (
    <section className="activity-panel activity-pie-panel" aria-label="Time by category">
      <PanelHeader title="Time by category" subtitle="Your activity mix" />
      <PieChart categories={categories} />
    </section>
  );
}

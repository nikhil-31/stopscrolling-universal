import { colorForCategory, formatDuration } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeCategoryBreakdown } from "@shared/types";
import { Shapes } from "lucide-react";
import { EmptyState } from "../ui";

export function CategoriesList({
  state,
  categories = state.snapshot.categories,
}: {
  state: AppSnapshot;
  categories?: ScreenTimeCategoryBreakdown[];
}) {
  return (
    <section className="activity-panel" aria-label="Categories">
      <div className="activity-panel-label">Categories</div>
      {categories.length ? categories.map((item) => (
        <div className="data-row" key={item.category}>
          <span className="row-main">
            <span
              className="category-swatch"
              style={{ ["--swatch" as string]: colorForCategory(item.category) }}
            />
            <span className="row-copy">
              <span className="row-title">{item.category}</span>
              <span className="progress-track">
                <span
                  className="progress-fill"
                  style={{
                    ["--progress" as string]: `${Math.min(100, item.percentage * 100)}%`,
                    ["--swatch" as string]: colorForCategory(item.category),
                  }}
                />
              </span>
            </span>
          </span>
          <span className="row-value">{formatDuration(item.seconds)} · {Math.round(item.percentage * 100)}%</span>
        </div>
      )) : (
        <EmptyState title="No categories" body="Category totals will appear here." icon={Shapes} />
      )}
    </section>
  );
}

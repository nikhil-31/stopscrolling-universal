import type { ReactNode } from "react";

export function PanelHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="activity-panel-header">
      <h3 className="data-card-title">{title}</h3>
      {subtitle ? <div className="data-card-subtitle">{subtitle}</div> : null}
    </div>
  );
}

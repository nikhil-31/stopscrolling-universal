import { displayNameForDevice } from "@shared/device";
import {
  colorForCategory,
  formatClock,
  formatDuration,
} from "@shared/timeline";
import type {
  DeviceListEntry,
  ScreenTimeAppBreakdown,
  ScreenTimeCategoryBreakdown,
  ScreenTimeDeviceTimeline,
  ScreenTimeTimelineSegment,
} from "@shared/types";
import { Boxes, List, Shapes } from "lucide-react";
import { Card, EmptyState, Grouped } from "../ui";
import { PieChart } from "./Charts";

export function EventLog({ segments }: { segments: ScreenTimeTimelineSegment[] }) {
  if (!segments.length) {
    return <EmptyState title="No events yet" body="Individual sessions will collect here." icon={List} />;
  }
  return (
    <Card className="data-card">
      <div className="data-card-header">
        <div>
          <h3 className="data-card-title">Session log</h3>
          <div className="data-card-subtitle">{segments.length} recorded sessions</div>
        </div>
      </div>
      <div className="list">
        {segments.map((segment) => (
          <button
            key={segment.id}
            className="data-row"
            onClick={() => window.stopscrolling.selectInspector({ kind: "segment", segment })}
          >
            <span className="row-main">
              <span
                className="category-swatch"
                style={{ ["--swatch" as string]: colorForCategory(segment.category) }}
              />
              <span className="row-copy">
                <span className="row-title">{segment.label}</span>
                <span className="row-subtitle">{segment.subtitle || segment.category}</span>
              </span>
            </span>
            <span className="row-value">{formatClock(segment.start)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function BlockList({ timelines, devices = [] }: { timelines: ScreenTimeDeviceTimeline[]; devices?: DeviceListEntry[] }) {
  const blocks = timelines.flatMap((timeline) => timeline.blocks);
  if (!blocks.length) {
    return <EmptyState title="No focused blocks" body="Nearby sessions are grouped into blocks after you track activity." icon={Boxes} />;
  }
  return (
    <Card className="data-card">
      <div className="data-card-header">
        <div>
          <h3 className="data-card-title">Focused blocks</h3>
          <div className="data-card-subtitle">Sessions grouped within five minutes</div>
        </div>
      </div>
      <div className="list">
        {blocks.map((block) => (
          <button
            key={block.id}
            className="data-row"
            onClick={() => window.stopscrolling.selectInspector({ kind: "block", block })}
          >
            <span className="row-main">
              <span
                className="category-swatch"
                style={{ ["--swatch" as string]: colorForCategory(block.category) }}
              />
              <span className="row-copy">
                <span className="row-title">{block.title}</span>
                <span className="row-subtitle">{block.subtitle} · {displayNameForDevice(block.devicePlatform, block.deviceName, devices)}</span>
              </span>
            </span>
            <span className="row-value">{formatDuration(block.durationSeconds)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function BreakdownList({
  categories,
  apps,
  selectedAppKey = null,
  onSelectApp,
}: {
  categories: ScreenTimeCategoryBreakdown[];
  apps: ScreenTimeAppBreakdown[];
  selectedAppKey?: string | null;
  onSelectApp?: (key: string | null) => void;
}) {
  return (
    <div className="breakdown-layout">
      <Card className="data-card">
        <div className="data-card-header">
          <div>
            <h3 className="data-card-title">Time by category</h3>
            <div className="data-card-subtitle">Your activity mix</div>
          </div>
        </div>
        <PieChart categories={categories} />
      </Card>
      <Grouped title="Categories" description="Where your tracked time is concentrated">
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
        )) : <EmptyState title="No categories" body="Category totals will appear here." icon={Shapes} />}
      </Grouped>
      <Grouped title="Apps & websites" description="Your most-used destinations">
        {apps.length ? apps.slice(0, 12).map((item) => {
          const selected = selectedAppKey === item.key;
          return (
            <button
              type="button"
              className={`data-row ${selected ? "is-selected" : ""}`}
              key={item.key}
              aria-pressed={selected}
              aria-label={`Highlight ${item.label} on the timeline`}
              onClick={() => onSelectApp?.(selected ? null : item.key)}
            >
              <span className="row-main">
                <span className="avatar">{item.label.slice(0, 2).toUpperCase()}</span>
                <span className="row-copy">
                  <span className="row-title">{item.label}</span>
                  <span className="row-subtitle">{item.subtitle || item.category}</span>
                </span>
              </span>
              <span className="row-value">{formatDuration(item.seconds)}</span>
            </button>
          );
        }) : <EmptyState title="No apps yet" body="App totals will appear here." />}
      </Grouped>
    </div>
  );
}

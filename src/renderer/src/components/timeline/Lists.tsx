import { memo, useEffect, useMemo, useRef, useState } from "react";
import { displayNameForDevice } from "@shared/device";
import {
  colorForCategory,
  formatClock,
  formatDuration,
  rankedAppsBySeconds,
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
import { AppsWebsitesShareRow } from "../today/AppsWebsitesList";
import { PieChart } from "./Charts";

export const SESSION_LOG_PAGE_SIZE = 30;

export const EventLog = memo(function EventLog({
  segments,
  pageSize,
}: {
  segments: ScreenTimeTimelineSegment[];
  pageSize?: number;
}) {
  const paginated = pageSize != null && pageSize > 0;
  const [limit, setLimit] = useState(paginated ? pageSize : segments.length);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => {
    if (!paginated) return segments;
    return segments
      .map((segment) => ({ segment, start: Date.parse(segment.start) }))
      .sort((a, b) => b.start - a.start)
      .map((item) => item.segment);
  }, [paginated, segments]);

  const previousList = useRef<{ oldestId: string | undefined; length: number } | null>(null);
  useEffect(() => {
    const oldestId = ordered[ordered.length - 1]?.id;
    const previous = previousList.current;
    previousList.current = { oldestId, length: ordered.length };
    // Newly recorded sessions only prepend to the log, so keep the loaded pages for those.
    const onlyPrepended = previous !== null && previous.oldestId === oldestId && ordered.length >= previous.length;
    if (!onlyPrepended) setLimit(paginated ? pageSize : ordered.length);
  }, [paginated, pageSize, ordered]);

  const visible = paginated ? ordered.slice(0, limit) : ordered;
  const hasMore = paginated && limit < ordered.length;

  useEffect(() => {
    if (!hasMore || !paginated || !sentinelRef.current || typeof IntersectionObserver === "undefined") return;
    const node = sentinelRef.current;
    const root = node.closest(".content-area");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(current + pageSize, ordered.length));
        }
      },
      { root: root instanceof Element ? root : null, rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, ordered.length, pageSize, paginated, limit]);

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
        {visible.map((segment) => (
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
        {hasMore ? <div ref={sentinelRef} data-testid="session-log-sentinel" aria-hidden="true" /> : null}
      </div>
    </Card>
  );
});

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

export const BreakdownList = memo(function BreakdownList({
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
        {apps.length ? (
          <div className="activity-app-list">
            {rankedAppsBySeconds(apps).slice(0, 12).map((item) => {
              const selected = selectedAppKey === item.key;
              return (
                <div
                  key={item.key}
                  className={`activity-app-row ${selected ? "is-selected" : ""}`}
                >
                  <AppsWebsitesShareRow
                    app={item}
                    selected={selected}
                    onSelect={() => onSelectApp?.(selected ? null : item.key)}
                  />
                </div>
              );
            })}
          </div>
        ) : <EmptyState title="No apps yet" body="App totals will appear here." />}
      </Grouped>
    </div>
  );
});

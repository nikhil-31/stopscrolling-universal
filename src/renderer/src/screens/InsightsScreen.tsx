import { useState } from "react";
import { displayNameForDevice } from "@shared/device";
import {
  formatDuration,
  normalizeInsightsDeviceKey,
  normalizeInsightsTab,
} from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import {
  BarChart3,
  Clock3,
  Layers3,
  List,
  Sparkles,
} from "lucide-react";
import { DevicePicker, visibleDevicesForPicker } from "../components/DevicePicker";
import { BreakdownList, EventLog, TimelineCard, TrendCard } from "../components/timeline";
import { LoadingState, MetricCard, Tabs } from "../components/ui";

export function InsightsScreen({ state }: { state: AppSnapshot }) {
  const [highlightedAppKey, setHighlightedAppKey] = useState<string | null>(null);
  if (state.loadingEntries) return <LoadingState label="Building your insights…" />;
  const tab = normalizeInsightsTab(state.insightsTab);
  const visibleDevices = visibleDevicesForPicker(state.devices, state.hiddenDeviceKeys);
  const deviceKey = normalizeInsightsDeviceKey(
    state.insightsDeviceKey,
    visibleDevices.map((device) => device.visibilityKey),
  );
  const selectedDevice = visibleDevices.find((device) => device.visibilityKey === deviceKey);
  const scopeDetail = selectedDevice
    ? `On ${displayNameForDevice(selectedDevice.devicePlatform, selectedDevice.deviceName, visibleDevices)} this ${state.insightsPeriod}`
    : `Across this ${state.insightsPeriod}`;
  const topCategory = state.snapshot.categories[0];
  const average = state.snapshot.sessionCount
    ? state.snapshot.totalSeconds / state.snapshot.sessionCount
    : 0;
  return (
    <div>
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Patterns</div>
          <h2>Understand your attention</h2>
          <p>Zoom out from individual sessions to see the habits shaping your screen time.</p>
        </div>
        <DevicePicker
          devices={state.devices}
          hiddenDeviceKeys={state.hiddenDeviceKeys}
          value={state.insightsDeviceKey}
          onChange={(key) => window.stopscrolling.setInsightsDevice(key)}
          ariaLabel="Insights devices"
        />
      </header>
      <section className="stats">
        <MetricCard
          label="Tracked time"
          value={formatDuration(state.snapshot.totalSeconds)}
          detail={scopeDetail}
          icon={Clock3}
        />
        <MetricCard
          label="Average session"
          value={formatDuration(average)}
          detail={`${state.snapshot.sessionCount} sessions total`}
          icon={Layers3}
          tone="violet"
        />
        <MetricCard
          label="Leading category"
          value={topCategory?.category ?? "None"}
          detail={topCategory ? `${Math.round(topCategory.percentage * 100)}% of total time` : "No category data yet"}
          icon={Sparkles}
          tone="orange"
        />
      </section>

      <Tabs
        ariaLabel="Insights views"
        value={tab}
        onChange={(next) => window.stopscrolling.setInsightsTab(next)}
        items={[
          { value: "overview", label: "Overview", icon: BarChart3 },
          { value: "sessions", label: "Sessions", icon: List },
        ]}
      />

      {tab === "overview" ? (
        <div className="stack">
          <TrendCard buckets={state.snapshot.buckets} period={state.insightsPeriod} />
          {state.insightsPeriod === "day" ? (
            <TimelineCard
              timelines={state.timelines}
              devices={state.devices}
              highlightedAppKey={highlightedAppKey}
            />
          ) : null}
          <BreakdownList
            categories={state.snapshot.categories}
            apps={state.snapshot.apps}
            selectedAppKey={highlightedAppKey}
            onSelectApp={setHighlightedAppKey}
          />
        </div>
      ) : null}
      {tab === "sessions" ? <EventLog segments={state.snapshot.listSegments} /> : null}
    </div>
  );
}

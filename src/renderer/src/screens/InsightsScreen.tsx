import { useMemo, useState } from "react";
import { displayNameForDevice } from "@shared/device";
import {
  buildBreakdowns,
  buildPeriodBuckets,
  filterSegmentsForApp,
  filterTimelinesForApp,
  formatDuration,
  formatPeriod,
  formatTodayPeriod,
  normalizeInsightsDeviceKey,
  normalizeInsightsTab,
  percentLabel,
  rankedAppsBySeconds,
} from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import {
    BarChart3,
    Clock3,
    List,
    Sparkles,
} from "lucide-react";
import { DevicePicker, visibleDevicesForPicker } from "../components/DevicePicker";
import { BreakdownList, EventLog, TimelineCard, TrendCard } from "../components/timeline";
import { Banner, Button, LoadingState, MetricCard, Tabs } from "../components/ui";

export function InsightsScreen({ state }: { state: AppSnapshot }) {
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null);
  const apps = rankedAppsBySeconds(state.snapshot.apps);
  const selectedApp = selectedAppKey
    ? apps.find((app) => app.key === selectedAppKey) ?? null
    : null;
  const filteredSegments = useMemo(
    () => selectedAppKey
      ? filterSegmentsForApp(
        state.snapshot.listSegments.length ? state.snapshot.listSegments : state.snapshot.timelineSegments,
        selectedAppKey,
      )
      : state.snapshot.listSegments,
    [selectedAppKey, state.snapshot.listSegments, state.snapshot.timelineSegments],
  );
  const filteredTimelines = useMemo(
    () => selectedAppKey ? filterTimelinesForApp(state.timelines, selectedAppKey) : state.timelines,
    [selectedAppKey, state.timelines],
  );
  const filteredBuckets = useMemo(
    () => selectedAppKey
      ? buildPeriodBuckets(filteredSegments, state.insightsPeriod, new Date(state.insightsAnchor))
      : state.snapshot.buckets,
    [selectedAppKey, filteredSegments, state.insightsPeriod, state.insightsAnchor, state.snapshot.buckets],
  );
  const filteredCategories = useMemo(
    () => selectedAppKey ? buildBreakdowns(filteredSegments).categories : state.snapshot.categories,
    [selectedAppKey, filteredSegments, state.snapshot.categories],
  );
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
  const topApp = apps[0];
  const trackedSeconds = selectedApp ? selectedApp.seconds : state.snapshot.totalSeconds;
  const trackedDetail = selectedApp ? `${scopeDetail} · ${selectedApp.label}` : scopeDetail;
  const clearFilter = () => setSelectedAppKey(null);
  return (
    <div>
      <header className="today-chrome">
        <h2 className="today-chrome-title">
          <span>Activity</span>
          <span className="today-chrome-slash">/</span>
          <span>
            {state.insightsPeriod === "day"
              ? formatTodayPeriod("day", new Date(state.insightsAnchor))
              : formatPeriod(state.insightsPeriod, new Date(state.insightsAnchor))}
          </span>
        </h2>
        <div className="today-chrome-controls">
          <DevicePicker
            devices={state.devices}
            hiddenDeviceKeys={state.hiddenDeviceKeys}
            value={state.insightsDeviceKey}
            onChange={(key) => window.stopscrolling.setInsightsDevice(key)}
            ariaLabel="Insights devices"
          />
        </div>
      </header>
      <section className="stats">
        <MetricCard
          label="Tracked time"
          value={formatDuration(trackedSeconds)}
          detail={trackedDetail}
          icon={Clock3}
        />
        <MetricCard
          label="Leading app/website"
          value={topApp ? formatDuration(topApp.seconds) : "None"}
          detail={topApp ? `${topApp.label} · ${percentLabel(topApp.percentage)}` : "No app data yet"}
          icon={Sparkles}
          tone="orange"
        />
      </section>
      {selectedApp ? (
        <div className="insights-filter-banner">
          <Banner
            action={<Button size="sm" variant="ghost" onClick={clearFilter}>Show all</Button>}
          >
            Showing only {selectedApp.label}
          </Banner>
        </div>
      ) : null}

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
          <TrendCard buckets={filteredBuckets} period={state.insightsPeriod} />
          {state.insightsPeriod === "day" ? (
            <TimelineCard
              timelines={filteredTimelines}
              devices={state.devices}
              subtitle={selectedApp ? `${selectedApp.label} across your visible devices` : undefined}
            />
          ) : null}
          <BreakdownList
            categories={filteredCategories}
            apps={apps}
            selectedAppKey={selectedAppKey}
            onSelectApp={setSelectedAppKey}
          />
        </div>
      ) : null}
      {tab === "sessions" ? <EventLog segments={filteredSegments} /> : null}
    </div>
  );
}

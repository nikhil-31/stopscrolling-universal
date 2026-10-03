import { useMemo, useState } from "react";
import { displayNameForDevice } from "@shared/device";
import { effectiveTimeZone } from "@shared/platform";
import { productivityBreakdown } from "@shared/jev-productivity";
import {
  buildBreakdowns,
  buildPeriodBuckets,
  filterSegmentsForApp,
  filterSegmentsForVerdict,
  filterTimelinesForApp,
  filterTimelinesForVerdict,
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
import { BreakdownList, EventLog, SESSION_LOG_PAGE_SIZE, TimelineCard, TrendCard } from "../components/timeline";
import { Banner, Button, MetricCard, Skeleton, Tabs } from "../components/ui";

function InsightsSkeleton() {
  return (
    <div className="insights-skeleton" role="status" aria-live="polite">
      <span className="sr-only">Building your insights…</span>
      <section className="stats" aria-hidden="true">
        <Skeleton className="insights-skeleton-metric" />
        <Skeleton className="insights-skeleton-metric" />
      </section>
      <Skeleton className="insights-skeleton-tabs" />
      <div className="stack" aria-hidden="true">
        <Skeleton className="insights-skeleton-chart" />
        <Skeleton className="insights-skeleton-list" />
      </div>
    </div>
  );
}

export function InsightsScreen({ state }: { state: AppSnapshot }) {
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<string | null>(null);
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const apps = useMemo(() => rankedAppsBySeconds(state.snapshot.apps), [state.snapshot.apps]);
  const selectedApp = selectedAppKey
    ? apps.find((app) => app.key === selectedAppKey) ?? null
    : null;
  const sourceSegments = state.snapshot.listSegments.length ? state.snapshot.listSegments : state.snapshot.timelineSegments;
  const filteredSegments = useMemo(
    () => {
      if (selectedAppKey) return filterSegmentsForApp(sourceSegments, selectedAppKey);
      if (selectedVerdict) return filterSegmentsForVerdict(sourceSegments, selectedVerdict);
      return state.snapshot.listSegments;
    },
    [selectedAppKey, selectedVerdict, sourceSegments, state.snapshot.listSegments],
  );
  const filteredTimelines = useMemo(
    () => {
      if (selectedAppKey) return filterTimelinesForApp(state.timelines, selectedAppKey);
      if (selectedVerdict) return filterTimelinesForVerdict(state.timelines, selectedVerdict);
      return state.timelines;
    },
    [selectedAppKey, selectedVerdict, state.timelines],
  );
  const filteredBuckets = useMemo(
    () => selectedAppKey || selectedVerdict
      ? buildPeriodBuckets(filteredSegments, state.insightsPeriod, new Date(state.insightsAnchor), undefined, timeZone)
      : state.snapshot.buckets,
    [selectedAppKey, selectedVerdict, filteredSegments, state.insightsPeriod, state.insightsAnchor, state.snapshot.buckets, timeZone],
  );
  const focusRows = useMemo(
    () => productivityBreakdown(selectedAppKey ? filterSegmentsForApp(sourceSegments, selectedAppKey) : sourceSegments),
    [selectedAppKey, sourceSegments],
  );
  const filteredCategories = useMemo(
    () => selectedAppKey || selectedVerdict ? buildBreakdowns(filteredSegments).categories : state.snapshot.categories,
    [selectedAppKey, selectedVerdict, filteredSegments, state.snapshot.categories],
  );
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
  const clearFilter = () => {
    setSelectedAppKey(null);
    setSelectedVerdict(null);
  };
  const selectApp = (key: string | null) => {
    setSelectedAppKey(key);
    if (key) setSelectedVerdict(null);
  };
  const selectVerdict = (key: string | null) => {
    setSelectedVerdict(key);
    if (key) setSelectedAppKey(null);
  };
  return (
    <div>
      <header className="today-chrome">
        <h2 className="today-chrome-title">
          <span>Activity</span>
          <span className="today-chrome-slash">/</span>
          <span>
            {state.insightsPeriod === "day"
              ? formatTodayPeriod("day", new Date(state.insightsAnchor), timeZone)
              : formatPeriod(state.insightsPeriod, new Date(state.insightsAnchor), timeZone)}
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
      {state.loadingEntries ? <InsightsSkeleton /> : (
        <>
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
          {selectedApp || selectedVerdict ? (
            <div className="insights-filter-banner">
              <Banner
                action={<Button size="sm" variant="ghost" onClick={clearFilter}>Show all</Button>}
              >
                Showing only {selectedApp?.label ?? selectedVerdict}
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
              <TrendCard buckets={filteredBuckets} period={state.insightsPeriod} devices={visibleDevices} />
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
                focus={focusRows}
                selectedAppKey={selectedAppKey}
                selectedVerdict={selectedVerdict}
                onSelectApp={selectApp}
                onSelectVerdict={selectVerdict}
              />
            </div>
          ) : null}
          {tab === "sessions" ? <EventLog segments={filteredSegments} pageSize={SESSION_LOG_PAGE_SIZE} /> : null}
        </>
      )}
    </div>
  );
}

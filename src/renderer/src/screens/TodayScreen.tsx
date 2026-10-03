import { useMemo, useState } from "react";
import { effectiveTimeZone } from "@shared/platform";
import { productivityBreakdown } from "@shared/jev-productivity";
import {
  buildBreakdowns,
  buildPeriodBuckets,
  filterSegmentsForApp,
  filterSegmentsForVerdict,
  filterTimelinesForApp,
  filterTimelinesForVerdict,
  normalizeTodayTab,
  rankedAppsBySeconds,
} from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { Banner, Button, Tabs } from "../components/ui";
import { CalendarDialogs } from "../components/calendar/CalendarDialogs";
import type { CalendarPrompt } from "../components/calendar/types";
import { EventLog } from "../components/timeline";
import { ActivityLineChart } from "../components/today/ActivityLineChart";
import { ActivityPie } from "../components/today/ActivityPie";
import { ActivityTimeline } from "../components/today/ActivityTimeline";
import { AppsWebsitesList, FocusList } from "../components/today/AppsWebsitesList";
import { CategoriesList } from "../components/today/CategoriesList";
import { TodayChrome } from "../components/today/TodayChrome";

export function TodayScreen({ state }: { state: AppSnapshot }) {
  const [prompt, setPrompt] = useState<CalendarPrompt>(null);
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<string | null>(null);
  const apps = rankedAppsBySeconds(state.snapshot.apps);
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
  const focusRows = useMemo(
    () => productivityBreakdown(selectedAppKey ? filterSegmentsForApp(sourceSegments, selectedAppKey) : sourceSegments),
    [selectedAppKey, sourceSegments],
  );
  const filteredCategories = useMemo(
    () => selectedAppKey || selectedVerdict ? buildBreakdowns(filteredSegments).categories : state.snapshot.categories,
    [selectedAppKey, selectedVerdict, filteredSegments, state.snapshot.categories],
  );
  const tab = normalizeTodayTab(state.todayTab);
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const lineBuckets = useMemo(
    () => buildPeriodBuckets(
      selectedAppKey || selectedVerdict ? filteredSegments : state.snapshot.timelineSegments,
      state.todayPeriod ?? "day",
      new Date(state.todayDay),
      undefined,
      timeZone,
    ),
    [selectedAppKey, selectedVerdict, filteredSegments, state.snapshot.timelineSegments, state.todayPeriod, state.todayDay, timeZone],
  );
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
    <div className="today-page" data-testid="today-page">
      <TodayChrome state={state} onOpenMore={() => setPrompt({ kind: "labels" })} />

      <div className="alert-stack">
        {!state.isAuthenticated ? (
          <Banner
            action={<Button size="sm" variant="ghost" onClick={() => window.stopscrolling.navigate("account")}>Sign in</Button>}
          >
            Sign in to sync timelines across devices. Local tracking continues privately.
          </Banner>
        ) : null}
        {!state.capabilities.accessibilityGranted && state.capabilities.platform === "macos" ? (
          <Banner
            tone="warning"
            action={<Button size="sm" onClick={() => window.stopscrolling.requestAccessibility()}>Grant access</Button>}
          >
            {state.capabilities.urlCaptureNote}
          </Banner>
        ) : null}
      </div>

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
        ariaLabel="Today views"
        value={tab}
        onChange={(next) => window.stopscrolling.setTodayTab(next)}
        items={[
          { value: "timeline", label: "Timeline" },
          { value: "eventLog", label: "Event Log" },
        ]}
      />

      {tab === "timeline" ? (
        <div className="activity-board">
          <ActivityLineChart state={state} buckets={lineBuckets} />
          <ActivityTimeline state={state} timelines={filteredTimelines} />
          <div className="activity-split">
            <ActivityPie state={state} categories={filteredCategories} />
            <CategoriesList state={state} categories={filteredCategories} />
            <FocusList rows={focusRows} selectedKey={selectedVerdict} onSelect={selectVerdict} />
            <AppsWebsitesList
              state={state}
              selectedKey={selectedAppKey}
              onSelect={selectApp}
              onLabelApp={(app: ScreenTimeAppBreakdown) => setPrompt({
                kind: "app-label",
                appKey: app.key,
                appName: app.label,
              })}
            />
          </div>
        </div>
      ) : (
        <div className="activity-board">
          <section className="activity-panel" aria-label="Event log">
            <div className="activity-panel-label">Event Log</div>
            <EventLog segments={filteredSegments} />
          </section>
        </div>
      )}

      <CalendarDialogs state={state} prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  buildBreakdowns,
  filterSegmentsForApp,
  filterTimelinesForApp,
  normalizeTodayTab,
  rankedAppsBySeconds,
} from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { Banner, Button, Tabs } from "../components/ui";
import { CalendarDialogs } from "../components/calendar/CalendarDialogs";
import type { CalendarPrompt } from "../components/calendar/types";
import { EventLog } from "../components/timeline";
import { ActivityPie } from "../components/today/ActivityPie";
import { ActivityTimeline } from "../components/today/ActivityTimeline";
import { AppsWebsitesList } from "../components/today/AppsWebsitesList";
import { CategoriesList } from "../components/today/CategoriesList";
import { TodayChrome } from "../components/today/TodayChrome";

export function TodayScreen({ state }: { state: AppSnapshot }) {
  const [prompt, setPrompt] = useState<CalendarPrompt>(null);
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
  const filteredCategories = useMemo(
    () => selectedAppKey ? buildBreakdowns(filteredSegments).categories : state.snapshot.categories,
    [selectedAppKey, filteredSegments, state.snapshot.categories],
  );
  const tab = normalizeTodayTab(state.todayTab);
  const clearFilter = () => setSelectedAppKey(null);

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
          <ActivityTimeline state={state} timelines={filteredTimelines} />
          <div className="activity-split">
            <ActivityPie state={state} categories={filteredCategories} />
            <CategoriesList state={state} categories={filteredCategories} />
            <AppsWebsitesList
              state={state}
              selectedKey={selectedAppKey}
              onSelect={setSelectedAppKey}
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

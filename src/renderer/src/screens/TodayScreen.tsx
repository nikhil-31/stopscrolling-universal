import { useState } from "react";
import { normalizeTodayTab } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeAppBreakdown } from "@shared/types";
import { Banner, Button, Tabs } from "../components/ui";
import { CalendarDialogs } from "../components/calendar/CalendarDialogs";
import type { CalendarPrompt } from "../components/calendar/types";
import { EventLog } from "../components/timeline";
import { ActivityPie } from "../components/today/ActivityPie";
import { ActivityTimeline } from "../components/today/ActivityTimeline";
import { AppsWebsitesList } from "../components/today/AppsWebsitesList";
import { TodayChrome } from "../components/today/TodayChrome";

export function TodayScreen({ state }: { state: AppSnapshot }) {
  const [prompt, setPrompt] = useState<CalendarPrompt>(null);
  const tab = normalizeTodayTab(state.todayTab);

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
          <ActivityTimeline state={state} />
          <div className="activity-split">
            <ActivityPie state={state} />
            <AppsWebsitesList
              state={state}
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
            <EventLog segments={state.snapshot.listSegments} />
          </section>
        </div>
      )}

      <CalendarDialogs state={state} prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

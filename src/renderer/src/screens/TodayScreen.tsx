import { colorForCategory, formatDuration } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import {
  Activity,
  Clock3,
  Layers3,
  List,
  PieChart,
  Shapes,
  TimerReset,
} from "lucide-react";
import { BlockList, BreakdownList, EventLog, TimelineCard, VerticalDay } from "../components/timeline";
import {
  Banner,
  Button,
  Card,
  LoadingState,
  MetricCard,
  Tabs,
} from "../components/ui";

export function TodayScreen({ state }: { state: AppSnapshot }) {
  if (state.loadingEntries) return <LoadingState label="Fetching today’s timeline…" />;
  const topCategory = state.snapshot.categories[0];
  return (
    <div>
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Daily focus</div>
          <h2>Your day at a glance</h2>
          <p>See the rhythm behind your screen time and choose what deserves your attention.</p>
        </div>
      </header>

      {state.isTracking && state.currentContext ? (
        <section className="live-hero" aria-label="Currently tracking">
          <span className="live-hero-icon"><Activity size={18} aria-hidden="true" /></span>
          <div className="live-hero-copy">
            <div className="live-hero-label"><span className="record-dot" /> Live now</div>
            <div className="live-hero-title">{state.currentContext.title || state.currentContext.appName}</div>
            <div className="live-hero-meta">{state.currentContext.appName} · {state.currentContext.category}</div>
          </div>
        </section>
      ) : null}

      <div className="alert-stack">
        {!state.isAuthenticated ? (
          <Banner
            action={<Button size="sm" variant="ghost" onClick={() => window.stopscrolling.navigate("account")}>Sign in</Button>}
          >
            Sign in to sync timelines across devices. Local tracking continues privately.
          </Banner>
        ) : null}
        {state.pendingUploadCount > 0 ? (
          <Banner
            tone="warning"
            action={<Button size="sm" onClick={() => window.stopscrolling.syncAll()}>Retry sync</Button>}
          >
            {state.pendingUploadCount} session{state.pendingUploadCount === 1 ? "" : "s"} waiting to sync.
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
        {state.capabilities.waylandLimited || !state.capabilities.urlCaptureSupported ? (
          <Banner>{state.capabilities.urlCaptureNote}</Banner>
        ) : null}
      </div>

      <section className="stats">
        <MetricCard
          label="Tracked time"
          value={formatDuration(state.snapshot.totalSeconds)}
          detail="Across visible devices"
          icon={Clock3}
        />
        <MetricCard
          label="Sessions"
          value={state.snapshot.sessionCount}
          detail={`${state.timelines.flatMap((timeline) => timeline.blocks).length} focused blocks`}
          icon={Layers3}
          tone="violet"
        />
        <MetricCard
          label="Top category"
          value={topCategory?.category ?? "None"}
          detail={topCategory ? `${Math.round(topCategory.percentage * 100)}% of tracked time` : "Start tracking to see your mix"}
          icon={Shapes}
          tone="success"
        />
      </section>

      <Tabs
        ariaLabel="Today views"
        value={state.todayTab}
        onChange={(tab) => window.stopscrolling.setTodayTab(tab)}
        items={[
          { value: "overview", label: "Overview", icon: Activity },
          { value: "blocks", label: "Blocks", icon: TimerReset },
          { value: "eventLog", label: "Event log", icon: List },
          { value: "breakdown", label: "Breakdown", icon: PieChart },
        ]}
      />

      {state.todayTab === "overview" ? (
        <div className="overview-grid">
          <TimelineCard timelines={state.timelines} />
          <Card className="data-card">
            <div className="data-card-header">
              <div>
                <h3 className="data-card-title">Top categories</h3>
                <div className="data-card-subtitle">What held your attention</div>
              </div>
            </div>
            <div className="list">
              {state.snapshot.categories.slice(0, 5).map((category) => (
                <div className="data-row" key={category.category}>
                  <span className="row-main">
                    <span
                      className="category-swatch"
                      style={{ ["--swatch" as string]: colorForCategory(category.category) }}
                    />
                    <span className="row-copy">
                      <span className="row-title">{category.category}</span>
                      <span className="progress-track">
                        <span
                          className="progress-fill"
                          style={{
                            ["--progress" as string]: `${Math.min(100, category.percentage * 100)}%`,
                            ["--swatch" as string]: colorForCategory(category.category),
                          }}
                        />
                      </span>
                    </span>
                  </span>
                  <span className="row-value">{formatDuration(category.seconds)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
      {state.todayTab === "blocks" ? (
        <div className="stack">
          <Card className="data-card">
            <div className="data-card-header">
              <div>
                <h3 className="data-card-title">Day timeline</h3>
                <div className="data-card-subtitle">Focused blocks arranged through the day</div>
              </div>
            </div>
          <VerticalDay timelines={state.timelines} />
          </Card>
          <BlockList timelines={state.timelines} />
        </div>
      ) : null}
      {state.todayTab === "eventLog" ? <EventLog segments={state.snapshot.listSegments} /> : null}
      {state.todayTab === "breakdown" ? (
        <BreakdownList categories={state.snapshot.categories} apps={state.snapshot.apps} />
      ) : null}
    </div>
  );
}

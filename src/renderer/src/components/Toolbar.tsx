import { formatPeriod, localTimeZoneLabel } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Hand,
  RefreshCw,
  Settings,
} from "lucide-react";
import { Button, IconButton, Tooltip } from "./ui";

const subtitles: Record<AppSnapshot["navigation"], string> = {
  today: "Your activity, one intentional day at a time",
  timer: "Remaining focus time for today",
  calendar: "See where your time went",
  insights: "Patterns across your digital life",
  blocking: "Sessions, schedules, and lists",
  leaderboard: "A little friendly accountability",
  account: "Profile, sync, and connected devices",
};

export function Toolbar({ state }: { state: AppSnapshot }) {
  const title = state.navigation[0].toUpperCase() + state.navigation.slice(1);
  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="toolbar-title">
        <h1>{title}</h1>
        <div className="toolbar-subtitle">{subtitles[state.navigation]}</div>
      </div>
      <div className="toolbar-center">
        {state.navigation === "insights" ? (
          <div className="seg" aria-label="Insights period">
            {(["day", "week", "month", "year"] as const).map((period) => (
              <button
                key={period}
                className={state.insightsPeriod === period ? "active" : ""}
                aria-pressed={state.insightsPeriod === period}
                onClick={() => window.stopscrolling.setInsightsPeriod(period)}
              >
                {period[0].toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>
        ) : null}
        {state.navigation === "insights" ? (
          <DateNav
            label={formatPeriod(state.insightsPeriod, new Date(state.insightsAnchor))}
            onPrev={() => shiftPeriod(state, -1)}
            onNext={() => shiftPeriod(state, 1)}
            onCurrent={() => window.stopscrolling.setInsightsAnchor(new Date().toISOString())}
          />
        ) : null}
        {!["today", "timer", "calendar", "insights"].includes(state.navigation) ? (
          <span className="timezone">{localTimeZoneLabel()}</span>
        ) : null}
      </div>
      <div className="toolbar-actions">
        <Tooltip label="Refresh timeline">
          <IconButton label="Refresh timeline" icon={RefreshCw} onClick={() => window.stopscrolling.refresh()} />
        </Tooltip>
        {["today", "timer", "calendar", "insights"].includes(state.navigation) ? (
          <Tooltip label="Accessibility permission">
            <IconButton label="Accessibility permission" icon={Hand} onClick={() => window.stopscrolling.requestAccessibility()} />
          </Tooltip>
        ) : null}
        <Button
          className={`record-button ${state.isTracking ? "is-active" : ""}`}
          variant="secondary"
          onClick={() => window.stopscrolling.toggleTracking()}
        >
          <span className="record-dot" aria-hidden="true" />
          <span className="button-label-optional">{state.isTracking ? "Recording" : "Start"}</span>
        </Button>
        <Tooltip label="Settings">
          <IconButton label="Settings" icon={Settings} onClick={() => window.stopscrolling.openSettings()} />
        </Tooltip>
      </div>
    </header>
  );
}

function DateNav({
  label,
  onPrev,
  onNext,
  onCurrent,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
}) {
  return (
    <div className="date-nav">
      <IconButton label="Previous period" icon={ChevronLeft} onClick={onPrev} />
      <strong className="date-label">{label}</strong>
      <IconButton label="Next period" icon={ChevronRight} onClick={onNext} />
      <Tooltip label="Jump to current period">
        <IconButton label="Jump to current period" icon={CalendarClock} onClick={onCurrent} />
      </Tooltip>
    </div>
  );
}

function shiftPeriod(state: AppSnapshot, direction: number) {
  const date = new Date(state.insightsAnchor);
  if (state.insightsPeriod === "day") date.setDate(date.getDate() + direction);
  if (state.insightsPeriod === "week") date.setDate(date.getDate() + direction * 7);
  if (state.insightsPeriod === "month") {
    date.setDate(1);
    date.setMonth(date.getMonth() + direction);
  }
  if (state.insightsPeriod === "year") date.setFullYear(date.getFullYear() + direction);
  window.stopscrolling.setInsightsAnchor(date.toISOString());
}

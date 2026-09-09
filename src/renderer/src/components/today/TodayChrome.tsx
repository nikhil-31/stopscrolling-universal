import type { TodayPeriod } from "@shared/types";
import { formatTodayPeriod, shiftTodayAnchor } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarClock, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { IconButton, Tooltip } from "../ui";

const periods: TodayPeriod[] = ["day", "week", "month"];

export function TodayChrome({
  state,
  onOpenMore,
}: {
  state: AppSnapshot;
  onOpenMore: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = new Date(state.todayDay);

  return (
    <header className="today-chrome">
      <h2 className="today-chrome-title">
        <span>Activity</span>
        <span className="today-chrome-slash">/</span>
        <span>{formatTodayPeriod(state.todayPeriod, anchor)}</span>
      </h2>
      <div className="today-chrome-controls">
        <div className="calendar-chrome-nav">
          <IconButton
            label="Previous period"
            icon={ChevronLeft}
            onClick={() => window.stopscrolling.setTodayDay(shiftTodayAnchor(state.todayPeriod, anchor, -1).toISOString())}
          />
          <Tooltip label="Jump to today">
            <IconButton
              label="Jump to today"
              icon={CalendarClock}
              onClick={() => window.stopscrolling.setTodayDay(new Date().toISOString())}
            />
          </Tooltip>
          <IconButton
            label="Next period"
            icon={ChevronRight}
            onClick={() => window.stopscrolling.setTodayDay(shiftTodayAnchor(state.todayPeriod, anchor, 1).toISOString())}
          />
        </div>
        <div className="seg calendar-view-switch" aria-label="Activity period">
          {periods.map((period) => (
            <button
              key={period}
              className={state.todayPeriod === period ? "active" : ""}
              aria-pressed={state.todayPeriod === period}
              onClick={() => window.stopscrolling.setTodayPeriod(period)}
            >
              {period[0].toUpperCase() + period.slice(1)}
            </button>
          ))}
          <div className="calendar-more">
            <IconButton label="More activity options" icon={Ellipsis} onClick={() => setMenuOpen((open) => !open)} />
            {menuOpen ? (
              <div className="calendar-more-menu" role="menu">
                <button type="button" className="calendar-more-action" onClick={() => { setMenuOpen(false); onOpenMore(); }}>
                  Manage labels
                </button>
                <button type="button" className="calendar-more-action" onClick={() => { setMenuOpen(false); window.stopscrolling.navigate("account"); }}>
                  Sign in & sync
                </button>
                <button type="button" className="calendar-more-action" onClick={() => { setMenuOpen(false); window.stopscrolling.requestAccessibility(); }}>
                  Accessibility permission
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

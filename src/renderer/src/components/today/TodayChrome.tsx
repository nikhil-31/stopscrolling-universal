import { ALL_DEVICES, formatTodayPeriod, shiftTodayAnchor } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarClock, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { DevicePicker } from "../DevicePicker";
import { IconButton, Tooltip } from "../ui";

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
        <span>{formatTodayPeriod("day", anchor)}</span>
      </h2>
      <div className="today-chrome-controls">
        <div className="calendar-chrome-nav">
          <IconButton
            label="Previous day"
            icon={ChevronLeft}
            onClick={() => window.stopscrolling.setTodayDay(shiftTodayAnchor("day", anchor, -1).toISOString())}
          />
          <Tooltip label="Jump to today">
            <IconButton
              label="Jump to today"
              icon={CalendarClock}
              onClick={() => window.stopscrolling.setTodayDay(new Date().toISOString())}
            />
          </Tooltip>
          <IconButton
            label="Next day"
            icon={ChevronRight}
            onClick={() => window.stopscrolling.setTodayDay(shiftTodayAnchor("day", anchor, 1).toISOString())}
          />
        </div>
        <DevicePicker
          devices={state.devices}
          hiddenDeviceKeys={state.hiddenDeviceKeys}
          value={state.todayDeviceKey ?? ALL_DEVICES}
          onChange={(key) => window.stopscrolling.setTodayDevice(key)}
          ariaLabel="Today devices"
        />
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
                {state.capabilities.accessibilityGranted ? "Accessibility granted" : "Grant Accessibility"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

import { effectiveTimeZone, toDateInput } from "@shared/platform";
import { ALL_DEVICES, formatTodayPeriod, shiftTodayAnchor } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { DevicePicker } from "../DevicePicker";
import { IconButton, Tooltip } from "../ui";

export function TodayChrome({ state }: { state: AppSnapshot }) {
  const anchor = new Date(state.todayDay);
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const awayFromToday = toDateInput(anchor, timeZone) !== toDateInput(new Date(), timeZone);

  return (
    <header className="today-chrome">
      <h2 className="today-chrome-title">
        <span>Activity</span>
        <span className="today-chrome-slash">/</span>
        <span>{formatTodayPeriod("day", anchor, timeZone)}</span>
      </h2>
      <div className="today-chrome-controls">
        <div className="calendar-chrome-nav">
          <IconButton
            label="Previous day"
            icon={ChevronLeft}
            onClick={() => window.stopscrolling.setTodayDay(shiftTodayAnchor("day", anchor, -1, timeZone).toISOString())}
          />
          <Tooltip label="Jump to today">
            <IconButton
              label="Jump to today"
              icon={CalendarClock}
              dot={awayFromToday}
              onClick={() => window.stopscrolling.setTodayDay(new Date().toISOString())}
            />
          </Tooltip>
          <IconButton
            label="Next day"
            icon={ChevronRight}
            onClick={() => window.stopscrolling.setTodayDay(shiftTodayAnchor("day", anchor, 1, timeZone).toISOString())}
          />
        </div>
        <DevicePicker
          devices={state.devices}
          hiddenDeviceKeys={state.hiddenDeviceKeys}
          value={state.todayDeviceKey ?? ALL_DEVICES}
          onChange={(key) => window.stopscrolling.setTodayDevice(key)}
          ariaLabel="Today devices"
        />
      </div>
    </header>
  );
}

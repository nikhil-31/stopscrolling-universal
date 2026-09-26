import { websiteHostname } from "@shared/browser";
import { clipInterval, formatHourMinute, mondayMonthGridDays } from "@shared/calendar-workspace";
import { deviceColor, deviceKey } from "@shared/device";
import { effectiveTimeZone, endOfDay, startOfDay, startOfMonth, toDateInput } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import { formatMonthLabel, itemBreakdownKey } from "@shared/timeline";
import type { ScreenTimeSessionBlock } from "@shared/types";

const VISIBLE_CHIPS = 4;

type DayChip = {
  key: string;
  label: string;
  seconds: number;
  color: string;
  block: ScreenTimeSessionBlock;
};

export function MonthBoard({ state }: { state: AppSnapshot }) {
  const timeZone = effectiveTimeZone(state.auth?.user?.time_zone);
  const month = new Date(state.calendarMonth);
  const days = mondayMonthGridDays(month, timeZone);
  const monthKey = toDateInput(startOfMonth(month, timeZone), timeZone).slice(0, 7);
  const todayKey = toDateInput(new Date(), timeZone);
  const weekdays = days.slice(0, 7).map((day) => weekdayName(day, timeZone));

  return (
    <div className="calendar-month-board" data-testid="calendar-month-board">
      <div className="calendar-month-grid" aria-label={formatMonthLabel(month, timeZone)}>
        {weekdays.map((label) => (
          <div key={label} className="calendar-month-weekday">{label}</div>
        ))}
        {days.map((day) => {
          const key = toDateInput(day, timeZone);
          const chips = chipsForDay(day, state, timeZone);
          const visible = chips.slice(0, VISIBLE_CHIPS);
          const hidden = chips.length - visible.length;
          return (
            <div
              key={key}
              className={`calendar-month-cell ${key.startsWith(monthKey) ? "" : "is-outside"} ${key === todayKey ? "is-today" : ""}`}
              data-testid={`calendar-month-day-${key}`}
            >
              <span className="calendar-month-date">{dayNumber(day, timeZone)}</span>
              {visible.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="calendar-month-chip"
                  style={{ ["--block-color" as string]: chip.color }}
                  onClick={() => window.stopscrolling.selectInspector({ kind: "block", block: chip.block })}
                >
                  <strong>{chip.label}</strong>
                  <span>{formatHourMinute(chip.seconds)}</span>
                </button>
              ))}
              {hidden > 0 ? (
                <button type="button" className="calendar-month-more" onClick={() => openDay(day)}>
                  {hidden} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function chipsForDay(day: Date, state: AppSnapshot, timeZone: string): DayChip[] {
  const dayStart = startOfDay(day, timeZone);
  const dayEnd = endOfDay(day, timeZone);
  const totals = new Map<string, DayChip & { blockSeconds: number; deviceSeconds: Map<string, number> }>();
  for (const timeline of state.timelines) {
    for (const block of timeline.blocks) {
      const sourceKey = deviceKey(block.devicePlatform || timeline.devicePlatform, block.deviceName || timeline.deviceName);
      for (const item of block.items) {
        const clipped = clipInterval(item.start, item.end, dayStart, dayEnd);
        if (!clipped) continue;
        const seconds = (clipped[1] - clipped[0]) / 1000;
        const key = itemBreakdownKey(item);
        const existing = totals.get(key);
        const blockSeconds = (existing?.blockSeconds ?? 0) < seconds ? seconds : existing?.blockSeconds ?? 0;
        const deviceSeconds = new Map(existing?.deviceSeconds);
        deviceSeconds.set(sourceKey, (deviceSeconds.get(sourceKey) ?? 0) + seconds);
        totals.set(key, {
          key,
          label: websiteHostname(item.url) || item.appName || item.title,
          seconds: (existing?.seconds ?? 0) + seconds,
          color: "",
          block: blockSeconds === seconds ? block : existing?.block ?? block,
          blockSeconds,
          deviceSeconds,
        });
      }
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
    .map(({ blockSeconds: _blockSeconds, deviceSeconds, ...chip }) => ({
      ...chip,
      color: deviceColor(leadingDevice(deviceSeconds), state.devices),
    }));
}

function leadingDevice(deviceSeconds: Map<string, number>) {
  let key = "";
  let seconds = -1;
  for (const [device, amount] of deviceSeconds) {
    if (amount > seconds) {
      key = device;
      seconds = amount;
    }
  }
  return key;
}

function openDay(day: Date) {
  const iso = day.toISOString();
  window.stopscrolling.setCalendarAnchor(iso);
  window.stopscrolling.setCalendarMonth(iso);
  window.stopscrolling.setCalendarView("day");
}

function weekdayName(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone }).format(date);
}

function dayNumber(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone }).format(date);
}

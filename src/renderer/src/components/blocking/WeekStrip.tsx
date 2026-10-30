import { formatWeekdays, WEEKDAYS } from "@shared/blocking";

export function WeekStrip({ days }: { days: number[] }) {
  return (
    <div className="blocking-week-strip" aria-label={`Repeats ${formatWeekdays(days) || "no days"}`}>
      {WEEKDAYS.map((day) => (
        <span
          className={`blocking-week-chip ${days.includes(day.value) ? "is-on" : ""}`}
          key={day.value}
        >
          {day.label[0]}
        </span>
      ))}
    </div>
  );
}

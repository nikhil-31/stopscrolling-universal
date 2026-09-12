import { useState } from "react";
import type { AppSnapshot } from "@shared/snapshot";
import { CalendarChrome } from "../components/calendar/CalendarChrome";
import { CalendarDialogs } from "../components/calendar/CalendarDialogs";
import { DayBoard } from "../components/calendar/DayBoard";
import { MonthHeatmap, WeekStrip } from "../components/calendar/PeriodBoards";
import { SummarySidebar } from "../components/calendar/SummarySidebar";
import type { CalendarPrompt } from "../components/calendar/types";

export function CalendarScreen({ state }: { state: AppSnapshot }) {
  const [prompt, setPrompt] = useState<CalendarPrompt>(null);

  return (
    <div className="calendar-page" data-testid="calendar-page">
      <CalendarChrome state={state} />
      <div className="calendar-day-layout">
        {state.calendarView === "day" ? <DayBoard state={state} /> : null}
        {state.calendarView === "week" ? <WeekStrip state={state} /> : null}
        {state.calendarView === "month" ? <MonthHeatmap state={state} /> : null}
        <SummarySidebar state={state} onEditTarget={() => setPrompt({ kind: "target" })} />
      </div>
      <CalendarDialogs state={state} prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

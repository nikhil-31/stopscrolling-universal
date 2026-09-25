import { suggestLabel } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import type { ScreenTimeSessionBlock } from "@shared/types";
import { useState } from "react";
import { CalendarChrome } from "../components/calendar/CalendarChrome";
import { CalendarDialogs } from "../components/calendar/CalendarDialogs";
import { DayBoard } from "../components/calendar/DayBoard";
import { MonthHeatmap } from "../components/calendar/PeriodBoards";
import { SummarySidebar } from "../components/calendar/SummarySidebar";
import type { CalendarPrompt } from "../components/calendar/types";
import { WeekBoard } from "../components/calendar/WeekBoard";

export function CalendarScreen({ state }: { state: AppSnapshot }) {
  const [prompt, setPrompt] = useState<CalendarPrompt>(null);

  const week = state.calendarView === "week";

  return (
    <div className="calendar-page" data-testid="calendar-page">
      <CalendarChrome state={state} />
      <div className={`calendar-day-layout ${week ? "calendar-week-layout" : ""}`}>
        {state.calendarView === "day" ? <DayBoard state={state} /> : null}
        {week ? <WeekBoard state={state} onSuggest={(block) => setPrompt(suggestionPrompt(state, block))} /> : null}
        {state.calendarView === "month" ? <MonthHeatmap state={state} /> : null}
        {week ? null : <SummarySidebar state={state} onEditTarget={() => setPrompt({ kind: "target" })} />}
      </div>
      <CalendarDialogs state={state} prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

function suggestionPrompt(state: AppSnapshot, block: ScreenTimeSessionBlock): CalendarPrompt {
  return {
    kind: "label",
    start: block.start,
    end: block.end,
    blockId: block.id,
    suggestedLabelId: suggestLabel(block, state.calendarWorkspace.labels)?.id,
  };
}

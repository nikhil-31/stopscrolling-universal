import { lazy, Suspense, useEffect, useState } from "react";
import { navItemForDigit } from "@shared/navigation";
import type { BlockingSchedule } from "@shared/types";
import { CommandPalette } from "./components/CommandPalette";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { LoadingState } from "./components/ui";
import { ClockFormatProvider } from "./clock-format";
import { useAppState } from "./hooks/useAppState";
import { AccountScreen } from "./screens/AccountScreen";
import { BlockingScreen } from "./screens/BlockingScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { TimesheetScreen } from "./screens/TimesheetScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { TimerScreen } from "./screens/TimerScreen";
import { TodayScreen } from "./screens/TodayScreen";

const InsightsScreen = lazy(() => import("./screens/InsightsScreen").then((module) => ({ default: module.InsightsScreen })));

export function App() {
  const state = useAppState();
  const [editingSchedule, setEditingSchedule] = useState<BlockingSchedule | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.code.startsWith("Digit")) {
        const digit = Number(event.code.slice(5));
        const item = navItemForDigit(digit);
        if (item) {
          event.preventDefault();
          window.stopscrolling.navigate(item);
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.stopscrolling.setCommandPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (state?.navigation !== "blocking") setEditingSchedule(null);
  }, [state?.navigation]);

  if (!state) return <div className="loading-page">Loading Stop Scrolling…</div>;

  return (
    <ClockFormatProvider value={state.settings.clockFormat}>
    <div className="app-shell" data-testid="app-root">
      <Sidebar state={state} />
      <div className="main-column">
        <Toolbar state={state} />
        <div className="content-row">
          <main
            className="content-area"
            data-testid="content-area"
            aria-label={`${state.navigation} content`}
          >
            <div className={`content-canvas ${["today", "timer", "calendar", "timesheet"].includes(state.navigation) ? "content-canvas-calendar" : ""}`} key={state.navigation}>
              {state.navigation === "today" && <TodayScreen state={state} />}
              {state.navigation === "timer" && <TimerScreen state={state} />}
              {state.navigation === "calendar" && <CalendarScreen state={state} />}
              {state.navigation === "timesheet" && <TimesheetScreen state={state} />}
              {state.navigation === "insights" && (
                <Suspense fallback={<LoadingState label="Building your insights…" />}>
                  <InsightsScreen state={state} />
                </Suspense>
              )}
              {state.navigation === "blocking" && (
                <BlockingScreen
                  state={state}
                  editingSchedule={editingSchedule}
                  onCloseEdit={() => setEditingSchedule(null)}
                />
              )}
              {state.navigation === "leaderboard" && <LeaderboardScreen state={state} />}
              {state.navigation === "account" && <AccountScreen state={state} />}
            </div>
          </main>
          <Inspector state={state} onEditSchedule={setEditingSchedule} />
        </div>
      </div>
      {state.commandPaletteOpen ? <CommandPalette state={state} /> : null}
      <div className="sr-only" aria-live="polite">{state.statusMessage}</div>
    </div>
    </ClockFormatProvider>
  );
}

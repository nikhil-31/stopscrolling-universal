import { useEffect } from "react";
import { navItemForDigit } from "@shared/navigation";
import { CommandPalette } from "./components/CommandPalette";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { useAppState } from "./hooks/useAppState";
import { AccountScreen } from "./screens/AccountScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { TodayScreen } from "./screens/TodayScreen";

export function App() {
  const state = useAppState();

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

  if (!state) return <div className="loading-page">Loading stopscrolling…</div>;

  return (
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
            <div className="content-canvas" key={state.navigation}>
              {state.navigation === "today" && <TodayScreen state={state} />}
              {state.navigation === "calendar" && <CalendarScreen state={state} />}
              {state.navigation === "insights" && <InsightsScreen state={state} />}
              {state.navigation === "leaderboard" && <LeaderboardScreen state={state} />}
              {state.navigation === "account" && <AccountScreen state={state} />}
            </div>
          </main>
          <Inspector state={state} />
        </div>
      </div>
      {state.commandPaletteOpen ? <CommandPalette state={state} /> : null}
      <div className="sr-only" aria-live="polite">{state.statusMessage}</div>
    </div>
  );
}

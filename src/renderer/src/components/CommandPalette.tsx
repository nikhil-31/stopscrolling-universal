import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot } from "@shared/snapshot";
import {
  BarChart3,
  CalendarDays,
  CircleUserRound,
  Command,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Square,
  SunMedium,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "./ui";

interface PaletteAction {
  title: string;
  hint: string;
  group: "Navigate" | "Actions";
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette({ state }: { state: AppSnapshot }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const actions = useMemo(
    (): PaletteAction[] => [
      { title: "Go to Today", hint: "⌘1", group: "Navigate", icon: SunMedium, run: () => window.stopscrolling.navigate("today") },
      { title: "Go to Calendar", hint: "⌘2", group: "Navigate", icon: CalendarDays, run: () => window.stopscrolling.navigate("calendar") },
      { title: "Go to Insights", hint: "⌘3", group: "Navigate", icon: BarChart3, run: () => window.stopscrolling.navigate("insights") },
      { title: "Go to Blocking", hint: "⌘4", group: "Navigate", icon: Shield, run: () => window.stopscrolling.navigate("blocking") },
      { title: "Go to Account", hint: "⌘5", group: "Navigate", icon: CircleUserRound, run: () => window.stopscrolling.navigate("account") },
      {
        title: state.isTracking ? "Stop tracking" : "Start tracking",
        hint: "⇧⌘R",
        group: "Actions",
        icon: state.isTracking ? Square : Play,
        run: () => window.stopscrolling.toggleTracking(),
      },
      { title: "Open Settings", hint: "⌘,", group: "Actions", icon: Settings, run: () => window.stopscrolling.openSettings() },
      { title: "Refresh timeline", hint: "⌘R", group: "Actions", icon: RefreshCw, run: () => window.stopscrolling.refresh() },
    ],
    [state.isTracking],
  );
  const filtered = actions.filter((action) => action.title.toLowerCase().includes(query.toLowerCase()));
  const run = (action: PaletteAction) => {
    action.run();
    window.stopscrolling.setCommandPalette(false);
  };

  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.stopscrolling.setCommandPalette(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        run(filtered[activeIndex]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIndex]);

  const groups = (["Navigate", "Actions"] as const).map((group) => ({
    group,
    actions: filtered.filter((action) => action.group === group),
  })).filter((group) => group.actions.length);

  return (
    <div className="palette-scrim" onMouseDown={() => window.stopscrolling.setCommandPalette(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <Search size={18} aria-hidden="true" />
          <input
            autoFocus
            placeholder="Search commands…"
            aria-label="Search commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="command-palette-search"
          />
          <span className="palette-key">ESC</span>
        </div>
        <div className="palette-results">
          {groups.map(({ group, actions: groupActions }) => (
            <div key={group}>
              <div className="palette-group-label">{group}</div>
              {groupActions.map((action) => {
                const globalIndex = filtered.indexOf(action);
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    className={`palette-result ${globalIndex === activeIndex ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    onClick={() => run(action)}
                  >
                    <span className="palette-result-icon"><Icon size={14} aria-hidden="true" /></span>
                    <span className="palette-result-title">{action.title}</span>
                    <span className="palette-result-hint">{action.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!filtered.length ? (
            <EmptyState title="No matching command" body={`Nothing matches “${query}”.`} icon={Command} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

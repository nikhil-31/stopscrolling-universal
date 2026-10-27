import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopWidgetState } from "@shared/desktop-widget";
import "./design-system.css";
import { WidgetCard } from "./screens/WidgetCard";

function WidgetApp() {
  const [state, setState] = useState<DesktopWidgetState | null>(null);

  useEffect(() => {
    let disposed = false;
    const apply = (next: DesktopWidgetState) => {
      if (disposed) return;
      setState((current) => (current && next.dataVersion < current.dataVersion ? current : next));
    };
    void window.stopscrolling.getDesktopWidgetState().then(apply);
    const unsubscribe = window.stopscrolling.onDesktopWidgetState(apply);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!state || state.appearance === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", state.appearance);
  }, [state]);

  if (!state) return null;
  return (
    <WidgetCard
      summary={state}
      onOpenToday={() => window.stopscrolling.openToday()}
      onHide={() => window.stopscrolling.hideDesktopWidget()}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetApp />
  </StrictMode>,
);

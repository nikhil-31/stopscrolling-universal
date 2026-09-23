import { useEffect, useState } from "react";
import { applyStateMessage, type AppSnapshot } from "@shared/snapshot";

export function useAppState() {
  const [state, setState] = useState<AppSnapshot | null>(null);
  useEffect(() => {
    let current: AppSnapshot | null = null;
    let disposed = false;
    const apply = (next: AppSnapshot) => {
      current = next;
      setState(next);
    };
    const fetchFull = () => {
      void window.stopscrolling.getState().then((full) => {
        if (disposed) return;
        if (current && (full.dataVersion ?? 0) < (current.dataVersion ?? 0)) return;
        apply(full);
      });
    };
    fetchFull();
    const unsubscribe = window.stopscrolling.onState((message) => {
      const next = applyStateMessage(current, message);
      if (next) apply(next);
      else fetchFull();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const root = document.documentElement;
    if (state.appearance === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", state.appearance);
  }, [state?.appearance]);
  return state;
}

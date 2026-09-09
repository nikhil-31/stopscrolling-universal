import { useEffect, useState } from "react";
import type { AppSnapshot } from "@shared/snapshot";

export function useAppState() {
  const [state, setState] = useState<AppSnapshot | null>(null);
  useEffect(() => {
    void window.stopscrolling.getState().then(setState);
    return window.stopscrolling.onState(setState);
  }, []);
  useEffect(() => {
    if (!state) return;
    const root = document.documentElement;
    if (state.appearance === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", state.appearance);
  }, [state?.appearance]);
  return state;
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useAppState } from "./hooks/useAppState";
import "./styles.css";
import "./design-system.css";

function SettingsRoot() {
  const state = useAppState();
  if (!state) return <div className="loading-page">Loading settings…</div>;
  return <SettingsScreen state={state} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsRoot />
  </StrictMode>,
);

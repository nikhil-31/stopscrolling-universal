import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsScreen } from "./screens/SettingsScreen";
import { installRendererCrashReporting } from "./crash-reporting";
import { useAppState } from "./hooks/useAppState";
import { installWindowChrome } from "./window-chrome";
import "./styles.css";
import "./design-system.css";

installWindowChrome();
installRendererCrashReporting((report) => {
  window.stopscrolling?.reportCrash(report);
});

function SettingsRoot() {
  const state = useAppState();
  return (
    <>
      <div className="settings-window-drag" />
      {state ? <SettingsScreen state={state} /> : <div className="loading-page">Loading settings…</div>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsRoot />
  </StrictMode>,
);

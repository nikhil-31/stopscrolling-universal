import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installRendererCrashReporting } from "./crash-reporting";
import { installWindowChrome } from "./window-chrome";
import "./styles.css";
import "./design-system.css";

installWindowChrome();
installRendererCrashReporting((report) => {
  window.stopscrolling?.reportCrash(report);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

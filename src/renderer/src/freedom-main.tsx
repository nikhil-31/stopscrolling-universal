import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FreedomScreen } from "./screens/FreedomScreen";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FreedomScreen />
  </StrictMode>,
);

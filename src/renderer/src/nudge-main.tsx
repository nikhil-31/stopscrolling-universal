import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design-system.css";
import { NudgeCard } from "./screens/NudgeCard";

function copyFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    label: params.get("label") || "This app",
    site: params.get("site") || "",
    detail: params.get("detail") || "",
    image: params.get("image") || "",
  };
}

const copy = copyFromLocation();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NudgeCard
      label={copy.label}
      site={copy.site}
      detail={copy.detail}
      image={copy.image}
      onDismiss={() => window.close()}
    />
  </StrictMode>,
);

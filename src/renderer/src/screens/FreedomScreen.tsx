import { useEffect } from "react";
import mark from "../assets/freedom-mark.png";
import "./FreedomScreen.css";

function screenCopy() {
  const params = new URLSearchParams(window.location.search);
  return {
    header: params.get("header") || "You are free.",
    detail: params.get("detail") || "Do what matters.",
    image: params.get("image") || "",
  };
}

export function FreedomScreen({ onDismiss = () => window.close() }: { onDismiss?: () => void }) {
  const shown = screenCopy();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <button type="button" className="freedom-screen" onClick={onDismiss}>
      <span className="freedom-mark">
        <img
          className={shown.image ? "freedom-custom-image" : "freedom-butterfly"}
          src={shown.image || mark}
          alt=""
        />
        <span className="freedom-copy">
          <span>
            {shown.header}
            <br />
            {shown.detail}
          </span>
          <span className="freedom-name">Stop Scrolling</span>
        </span>
      </span>
    </button>
  );
}

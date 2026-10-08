import { useEffect } from "react";
import mark from "../assets/freedom-mark.png";
import "./FreedomScreen.css";

function Butterfly() {
  return <img className="freedom-butterfly" src={mark} alt="" />;
}

export function FreedomScreen({ onDismiss = () => window.close() }: { onDismiss?: () => void }) {
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
        <Butterfly />
        <span className="freedom-copy">
          <span>
            You are free.
            <br />
            Do what matters.
          </span>
          <span className="freedom-name">Stop Scrolling</span>
        </span>
      </span>
    </button>
  );
}

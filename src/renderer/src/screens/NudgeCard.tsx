import { useEffect } from "react";
import "./NudgeCard.css";

export function NudgeCard({
  label,
  site = "",
  detail = "",
  image = "",
  onDismiss,
}: {
  label: string;
  site?: string;
  detail?: string;
  image?: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const support = detail.trim() || "This looks distracting";

  return (
    <div className="nudge-shell">
      <section className="nudge-card" aria-label={label}>
        {image ? <img className="nudge-image" src={image} alt="" /> : null}
        <h1 className="nudge-name">{label}</h1>
        {site ? <p className="nudge-site">{site}</p> : null}
        <div className="nudge-footer">
          <p className="nudge-detail">{support}</p>
          <button type="button" className="button button-secondary button-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </section>
    </div>
  );
}

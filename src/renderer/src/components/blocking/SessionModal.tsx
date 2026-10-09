import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "../ui";

export function SessionModal({
  title,
  titleId,
  subtitle,
  closeLabel,
  onClose,
  front = false,
  size = "details",
  footer,
  children,
}: {
  title: string;
  titleId: string;
  subtitle?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  front?: boolean;
  size?: "details" | "form";
  footer?: ReactNode;
  children: ReactNode;
}) {
  return createPortal(
    <div className={`blocking-dialog-scrim${front ? " blocking-dialog-scrim-front" : ""}`} onClick={onClose}>
      <div
        className={`blocking-modal blocking-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="blocking-modal-header">
          <span className="row-copy">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </span>
          <IconButton label={closeLabel} icon={X} onClick={onClose} />
        </header>
        {children}
        {footer ? <footer className="blocking-modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function SessionModalBody({ children }: { children: ReactNode }) {
  return <div className="blocking-modal-body">{children}</div>;
}

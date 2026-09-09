import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

function join(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  children,
  icon: Icon,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={join("button", `button-${variant}`, `button-${size}`, className)}
      {...props}
    >
      {Icon ? <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon: Icon,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      className={join("icon-button", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

export function Card({
  children,
  className,
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return <div className={join("card", elevated && "card-elevated", className)}>{children}</div>;
}

export function Grouped({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={join("grouped-section", className)}>
      <header className="section-heading">
        <div>
          <h2 className="section-title">{title}</h2>
          {description ? <p className="section-description">{description}</p> : null}
        </div>
        {action ? <div className="section-action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export const Section = Grouped;

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <span className="badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusPill({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "success";
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: Array<{ value: T; label: string; icon?: LucideIcon }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={value === item.value}
            className={value === item.value ? "active" : ""}
            onClick={() => onChange(item.value)}
          >
            {Icon ? <Icon size={15} aria-hidden="true" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className={join("toggle-row", disabled && "is-disabled")}>
      <span className="toggle-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
      />
      <span className="toggle-control" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

export function TextField({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className={join("field", className)}>
      <span className="field-label">{label}</span>
      <input {...props} />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Banner({
  children,
  tone = "info",
  action,
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  action?: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <div className={`banner banner-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div className="banner-copy">{children}</div>
      {action ? <div className="banner-action">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  tone?: "accent" | "success" | "violet" | "orange";
}) {
  return (
    <Card className={`metric-card metric-${tone}`}>
      <div className="metric-icon"><Icon size={18} aria-hidden="true" /></div>
      <div className="metric-content">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
        {detail ? <span className="metric-detail">{detail}</span> : null}
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  icon: Icon = Info,
  action,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={22} aria-hidden="true" /></div>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={join("skeleton", className)} aria-hidden="true" />;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="tooltip" data-tooltip={label}>
      {children}
    </span>
  );
}

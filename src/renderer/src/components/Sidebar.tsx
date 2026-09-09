import { navigationItems, trackingItems } from "@shared/navigation";
import type { AppSnapshot } from "@shared/snapshot";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CircleUserRound,
  Sparkles,
  SunMedium,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { StatusPill, Tooltip } from "./ui";

const icons: Record<string, LucideIcon> = {
  today: SunMedium,
  calendar: CalendarDays,
  insights: BarChart3,
  leaderboard: Trophy,
  account: CircleUserRound,
};

export function Sidebar({ state }: { state: AppSnapshot }) {
  return (
    <aside className="sidebar" data-testid="sidebar" aria-label="Primary navigation">
      <div className="brand">
        <span className="brand-mark"><Sparkles size={17} aria-hidden="true" /></span>
        <span>stopscrolling</span>
      </div>
      <div className="nav-section">Tracking</div>
      <nav>
        {navigationItems.filter((item) => trackingItems.includes(item.id)).map((item) => {
          const Icon = icons[item.id];
          return (
            <Tooltip label={`${item.label} · ⌘${item.shortcutDigit}`} key={item.id}>
              <button
                className={`nav-item ${state.navigation === item.id ? "active" : ""}`}
                data-testid={`sidebar-${item.id}-item`}
                aria-current={state.navigation === item.id ? "page" : undefined}
                onClick={() => window.stopscrolling.navigate(item.id)}
              >
                <span className="nav-icon"><Icon size={15} aria-hidden="true" /></span>
                <span className="nav-copy">
                  <span className="nav-label">{item.label}</span>
                  <small className="nav-subtitle">{item.subtitle}</small>
                </span>
                <span className="nav-shortcut">⌘{item.shortcutDigit}</span>
              </button>
            </Tooltip>
          );
        })}
      </nav>
      <div className="nav-section">Account</div>
      <nav>
        <Tooltip label="Account · ⌘4">
          <button
            className={`nav-item ${state.navigation === "account" ? "active" : ""}`}
            data-testid="sidebar-account-item"
            aria-current={state.navigation === "account" ? "page" : undefined}
            onClick={() => window.stopscrolling.navigate("account")}
          >
            <span className="nav-icon"><CircleUserRound size={15} aria-hidden="true" /></span>
            <span className="nav-copy">
              <span className="nav-label">Account</span>
              <small className="nav-subtitle">Sign in & sync</small>
            </span>
            <span className="nav-shortcut">⌘4</span>
          </button>
        </Tooltip>
      </nav>
      <div className="sidebar-footer">
        <div className="pills">
          {state.isTracking ? <StatusPill>Recording</StatusPill> : <StatusPill>Paused</StatusPill>}
          {state.isAuthenticated ? <StatusPill tone="success">Signed in</StatusPill> : null}
        </div>
        {state.currentContext ? (
          <div className="sidebar-live">
            <span className="live-app-icon"><Activity size={14} aria-hidden="true" /></span>
            <span className="sidebar-live-copy">
              <span className="sidebar-live-title" title={state.currentContext.title || state.currentContext.appName}>
                {state.currentContext.title || state.currentContext.appName}
              </span>
              <span className="sidebar-live-meta">{state.currentContext.category}</span>
            </span>
          </div>
        ) : null}
        <div className="sidebar-status" data-testid="status-message" title={state.statusMessage}>
          {state.statusMessage}
        </div>
      </div>
    </aside>
  );
}

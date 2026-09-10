import type { NavigationItem } from "./types";

export const navigationItems: Array<{
  id: NavigationItem;
  label: string;
  subtitle: string;
  shortcutDigit: 1 | 2 | 3 | 4;
}> = [
  { id: "today", label: "Today", subtitle: "Timeline & sessions", shortcutDigit: 1 },
  { id: "calendar", label: "Calendar", subtitle: "Day, week & month", shortcutDigit: 2 },
  { id: "insights", label: "Insights", subtitle: "Charts & breakdowns", shortcutDigit: 3 },
  { id: "account", label: "Account", subtitle: "Sign in & sync", shortcutDigit: 4 },
];

export const trackingItems: NavigationItem[] = ["today", "calendar", "insights"];

export function navItemForDigit(digit: number): NavigationItem | null {
  const match = navigationItems.find((item) => item.shortcutDigit === digit);
  return match?.id ?? null;
}

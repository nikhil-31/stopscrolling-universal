import type { NavigationItem } from "./types";

export const navigationItems: Array<{
  id: NavigationItem;
  label: string;
  subtitle: string;
  shortcutDigit: 1 | 2 | 3 | 4 | 5 | 6;
}> = [
  { id: "today", label: "Today", subtitle: "Timeline & sessions", shortcutDigit: 1 },
  { id: "calendar", label: "Calendar", subtitle: "Day, week & month", shortcutDigit: 2 },
  { id: "timesheet", label: "Timesheet", subtitle: "Review & approve", shortcutDigit: 6 },
  { id: "insights", label: "Insights", subtitle: "Charts & breakdowns", shortcutDigit: 3 },
  { id: "blocking", label: "Blocking", subtitle: "Sessions & lists", shortcutDigit: 4 },
  { id: "account", label: "Account", subtitle: "Sign in & sync", shortcutDigit: 5 },
];

export const trackingItems: NavigationItem[] = ["today", "calendar", "timesheet", "insights", "blocking"];

export function navItemForDigit(digit: number): NavigationItem | null {
  const match = navigationItems.find((item) => item.shortcutDigit === digit);
  return match?.id ?? null;
}

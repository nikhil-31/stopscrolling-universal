import type { NavigationItem } from "./types";

export const TIMER_BONUS_STEP_SECONDS = 15 * 60;

export function usesTodayWindow(navigation: NavigationItem): boolean {
  return navigation === "today" || navigation === "timer";
}

export function effectiveTimerBonus(
  bonusSeconds: number | undefined,
  bonusDay: string | undefined,
  today: string,
): number {
  if (!bonusDay || bonusDay !== today) return 0;
  return Math.max(0, bonusSeconds ?? 0);
}

export function focusRemaining(input: {
  targetSeconds: number;
  trackedSeconds: number;
  bonusSeconds?: number;
}) {
  const target = Math.max(0, input.targetSeconds) + Math.max(0, input.bonusSeconds ?? 0);
  const tracked = Math.max(0, input.trackedSeconds);
  const remainingSeconds = Math.max(0, target - tracked);
  const usedSeconds = Math.min(target, tracked);
  return {
    remainingSeconds,
    usedSeconds,
    targetSeconds: target,
    usedFraction: target > 0 ? usedSeconds / target : 0,
  };
}

export function formatFocusClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

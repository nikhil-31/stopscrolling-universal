/** No keystroke or click for this long ends the open app session. */
export const IDLE_THRESHOLD_SECONDS = 60;

export interface IdleDecision {
  /** Close the open session before reading the foreground window. */
  close: boolean;
  /** End timestamp when closing. Null when the session stays open. */
  end: Date | null;
  /** The user is still away, so do not start a new session. */
  stillAway: boolean;
  /** Last input instant to remember while the user is active. */
  activeAt: Date;
}

/** Clock time of the most recent input. Idle seconds never move this into the future. */
export function lastInputAt(nowMs: number, idleSeconds: number): Date {
  const seconds = Number.isFinite(idleSeconds) && idleSeconds > 0 ? idleSeconds : 0;
  return new Date(nowMs - seconds * 1000);
}

/**
 * Decide whether the open session should stop, and at which instant.
 * A stalled sampler closes at the last remembered input even if the OS idle
 * clock reset (sleep). An idle clock at the threshold closes at last input.
 */
export function decideIdle(input: {
  nowMs: number;
  idleSeconds: number;
  lastActiveAt: Date | null;
  openStart: Date | null;
}): IdleDecision {
  const activeAt = lastInputAt(input.nowMs, input.idleSeconds);
  const thresholdMs = IDLE_THRESHOLD_SECONDS * 1000;
  const stalled =
    input.lastActiveAt != null && input.nowMs - input.lastActiveAt.getTime() >= thresholdMs;
  const idle = input.idleSeconds >= IDLE_THRESHOLD_SECONDS;
  if (!stalled && !idle) {
    return { close: false, end: null, stillAway: false, activeAt };
  }
  const endCandidate = stalled && input.lastActiveAt ? input.lastActiveAt : activeAt;
  const end =
    input.openStart && endCandidate.getTime() < input.openStart.getTime()
      ? input.openStart
      : endCandidate;
  return {
    close: input.openStart != null,
    end,
    stillAway: idle,
    activeAt,
  };
}

/** End a session recovered after restart. Missing lastActive must not extend to launch time. */
export function recoveredSessionEnd(checkpoint: { start: string; lastActive?: string }): Date {
  if (checkpoint.lastActive) {
    const lastActive = new Date(checkpoint.lastActive);
    if (!Number.isNaN(lastActive.getTime())) return lastActive;
  }
  return new Date(checkpoint.start);
}

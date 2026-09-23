import { useState } from "react";
import { effectiveTimeZone, toDateInput } from "@shared/platform";
import type { AppSnapshot } from "@shared/snapshot";
import {
  effectiveTimerBonus,
  focusRemaining,
  formatFocusClock,
  TIMER_BONUS_STEP_SECONDS,
} from "@shared/timer";
import { Play, Plus, Square } from "lucide-react";
import { VerticalDay } from "../components/timeline";
import { EmptyState, IconButton, Tooltip, Tabs } from "../components/ui";

export function TimerScreen({ state }: { state: AppSnapshot }) {
  const [rail, setRail] = useState<"session" | "timeline">("session");
  const today = toDateInput(new Date(state.todayDay), effectiveTimeZone(state.auth?.user?.time_zone));
  const bonus = effectiveTimerBonus(
    state.settings.timerBonusSeconds,
    state.settings.timerBonusDay,
    today,
  );
  const remaining = focusRemaining({
    targetSeconds: state.settings.dailyWorkTargetSeconds,
    trackedSeconds: state.snapshot.totalSeconds,
    bonusSeconds: bonus,
  });
  const usedPercent = Math.round(remaining.usedFraction * 1000) / 10;
  const clock = formatFocusClock(remaining.remainingSeconds);

  return (
    <div className="timer-page" data-testid="timer-screen">
      <div className="timer-stage">
        <div
          className="timer-ring"
          style={{
            background: `conic-gradient(from -90deg, var(--brand) ${usedPercent}%, var(--line) 0)`,
          }}
          role="img"
          aria-label={`${clock} focus time remaining`}
        >
          <div className="timer-ring-inner">
            <div className="timer-clock" data-testid="timer-clock">{clock}</div>
            <div className="timer-caption">Focus time remaining</div>
          </div>
        </div>
        <div className="timer-controls">
          <Tooltip label="Start recording">
            <IconButton
              className="timer-control"
              label="Start recording"
              icon={Play}
              disabled={state.isTracking}
              onClick={() => window.stopscrolling.startTracking()}
            />
          </Tooltip>
          <Tooltip label="Stop recording">
            <IconButton
              className="timer-control"
              label="Stop recording"
              icon={Square}
              disabled={!state.isTracking}
              onClick={() => window.stopscrolling.stopTracking()}
            />
          </Tooltip>
          <Tooltip label="Add 15 minutes">
            <IconButton
              className="timer-control"
              label="Add 15 minutes"
              icon={Plus}
              onClick={() => window.stopscrolling.addTimerBonus(TIMER_BONUS_STEP_SECONDS)}
            />
          </Tooltip>
        </div>
      </div>
      <aside className="timer-rail">
        <Tabs
          ariaLabel="Timer details"
          value={rail}
          onChange={setRail}
          items={[
            { value: "session", label: "Current Session" },
            { value: "timeline", label: "Timeline" },
          ]}
        />
        {rail === "session" ? (
          state.isTracking ? (
            <div className="timer-session" data-testid="timer-current-session">
              <div className="timer-session-app">
                {state.currentContext?.appName || "Recording"}
              </div>
              <div className="timer-session-title">
                {state.currentContext?.title || "Waiting for activity…"}
              </div>
              {state.currentContext?.category ? (
                <div className="timer-session-meta">{state.currentContext.category}</div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No current session"
              body="Start recording to begin a session."
            />
          )
        ) : (
          <VerticalDay timelines={state.timelines} devices={state.devices} className="timer-timeline" />
        )}
      </aside>
    </div>
  );
}

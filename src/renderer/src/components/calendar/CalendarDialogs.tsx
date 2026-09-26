import { formatHourMinute, suggestLabel, unlabeledBlocks } from "@shared/calendar-workspace";
import type { AppSnapshot } from "@shared/snapshot";
import { X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, TextField } from "../ui";
import type { CalendarPrompt } from "./types";

export function CalendarDialogs({
  state,
  prompt,
  onClose,
}: {
  state: AppSnapshot;
  prompt: CalendarPrompt;
  onClose: () => void;
}) {
  if (!prompt) return null;
  return (
    <div className="calendar-dialog-scrim" onClick={onClose}>
      <div className="calendar-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <IconButton className="calendar-dialog-close" label="Close" icon={X} onClick={onClose} />
        {prompt.kind === "label" ? <LabelPrompt key={`${prompt.start}-${prompt.assignmentId ?? prompt.blockId ?? ""}`} state={state} prompt={prompt} onClose={onClose} /> : null}
        {prompt.kind === "app-label" ? <AppLabelPrompt key={prompt.appKey} state={state} prompt={prompt} onClose={onClose} /> : null}
        {prompt.kind === "task" ? <TaskPrompt key={prompt.taskId ?? prompt.start} prompt={prompt} onClose={onClose} /> : null}
        {prompt.kind === "review" ? <ReviewPrompt state={state} blockIds={prompt.blockIds} onClose={onClose} /> : null}
        {prompt.kind === "target" ? <TargetPrompt state={state} onClose={onClose} /> : null}
        {prompt.kind === "labels" ? <LabelsPrompt state={state} onClose={onClose} /> : null}
      </div>
    </div>
  );
}

function LabelPrompt({
  state,
  prompt,
  onClose,
}: {
  state: AppSnapshot;
  prompt: Extract<CalendarPrompt, { kind: "label" }>;
  onClose: () => void;
}) {
  const selected = prompt.suggestedLabelId || state.calendarWorkspace.labels[0]?.id;
  const [labelId, setLabelId] = useState(selected);
  const [name, setName] = useState("");

  return (
    <>
      <h3>Apply label</h3>
      <p className="muted">Choose a label for this time range, or create a new one.</p>
      <div className="calendar-label-picks">
        {state.calendarWorkspace.labels.map((label) => (
          <button
            key={label.id}
            type="button"
            className={`calendar-label-pick ${labelId === label.id ? "is-selected" : ""}`}
            onClick={() => setLabelId(label.id)}
          >
            <span className="calendar-legend-dot" style={{ background: label.color }} />
            {label.name}
          </button>
        ))}
      </div>
      <TextField label="New label" placeholder="Optional name" value={name} onChange={(event) => setName(event.target.value)} />
      <div className="form-actions">
        {prompt.assignmentId ? (
          <Button variant="ghost" onClick={() => {
            window.stopscrolling.clearCalendarAssignment(prompt.assignmentId!);
            onClose();
          }}>
            Remove
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => {
          const nextId = name.trim()
            ? createLabel(state, name.trim())
            : labelId;
          if (!nextId) return;
          if (prompt.blockId) {
            const block = state.timelines.flatMap((timeline) => timeline.blocks).find((item) => item.id === prompt.blockId);
            if (block) {
              window.stopscrolling.reviewCalendarBlock({ block, labelId: nextId });
              onClose();
              return;
            }
          }
          window.stopscrolling.assignCalendarLabel({
            id: prompt.assignmentId,
            start: prompt.start,
            end: prompt.end,
            labelId: nextId,
            source: prompt.blockId ? "suggestion" : "manual",
            reviewed: true,
          });
          onClose();
        }}>
          Apply
        </Button>
      </div>
    </>
  );
}

function TaskPrompt({
  prompt,
  onClose,
}: {
  prompt: Extract<CalendarPrompt, { kind: "task" }>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(prompt.title || "");
  return (
    <>
      <h3>{prompt.taskId ? "Edit task" : "Add task"}</h3>
      <TextField label="Task title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write, review, ship…" />
      <div className="form-actions">
        {prompt.taskId ? (
          <Button variant="ghost" onClick={() => {
            window.stopscrolling.deleteCalendarTask(prompt.taskId!);
            onClose();
          }}>
            Delete
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={!title.trim()}
          onClick={() => {
            window.stopscrolling.upsertCalendarTask({
              id: prompt.taskId,
              title: title.trim(),
              start: prompt.start,
              end: prompt.end,
            });
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </>
  );
}

function ReviewPrompt({ state, blockIds, onClose }: { state: AppSnapshot; blockIds?: string[]; onClose: () => void }) {
  const blocks = blockIds ? periodUnlabeledBlocks(state, blockIds) : state.calendarDayStats.unlabeledBlocks;
  return (
    <>
      <h3>Review time entries</h3>
      <p className="muted">
        {blocks.length} unlabeled {blocks.length === 1 ? "block" : "blocks"} {blockIds ? "in this period" : "on this day"}.
      </p>
      <div className="calendar-review-list">
        {blocks.map((block) => {
          const suggested = suggestLabel(block, state.calendarWorkspace.labels);
          return (
            <div key={block.id} className="calendar-review-row">
              <div>
                <strong>{block.title}</strong>
                <span className="muted">{formatHourMinute(block.durationSeconds)}</span>
              </div>
              <div className="form-actions">
                <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.skipCalendarBlock(block.id)}>Skip</Button>
                {suggested ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => window.stopscrolling.reviewCalendarBlock({ block, labelId: suggested.id })}
                  >
                    Apply {suggested.name}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="form-actions">
        <Button onClick={onClose}>Done</Button>
      </div>
    </>
  );
}

function periodUnlabeledBlocks(state: AppSnapshot, blockIds: string[]) {
  const ids = new Set(blockIds);
  const seen = new Set<string>();
  const blocks = state.timelines.flatMap((timeline) => timeline.blocks).filter((block) => {
    if (!ids.has(block.id) || seen.has(block.id)) return false;
    seen.add(block.id);
    return true;
  });
  return unlabeledBlocks(blocks, state.calendarWorkspace);
}

function TargetPrompt({ state, onClose }: { state: AppSnapshot; onClose: () => void }) {
  const hours = Math.round((state.settings.dailyWorkTargetSeconds / 3600) * 10) / 10;
  const [value, setValue] = useState(String(hours));
  return (
    <>
      <h3>Work hours target</h3>
      <TextField
        label="Daily target (hours)"
        type="number"
        min={1}
        max={16}
        step={0.5}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="form-actions">
        <Button
          variant="primary"
          onClick={() => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            window.stopscrolling.updateSettings({ dailyWorkTargetSeconds: Math.round(parsed * 3600) });
            onClose();
          }}
        >
          Save target
        </Button>
      </div>
    </>
  );
}

function LabelsPrompt({ state, onClose }: { state: AppSnapshot; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <>
      <h3>Labels</h3>
      <div className="calendar-label-picks">
        {state.calendarWorkspace.labels.map((label) => (
          <div key={label.id} className="calendar-label-manage">
            <span className="calendar-legend-dot" style={{ background: label.color }} />
            <span>{label.name}</span>
            <Button size="sm" variant="ghost" onClick={() => window.stopscrolling.deleteCalendarLabel(label.id)}>Delete</Button>
          </div>
        ))}
      </div>
      <TextField label="Add label" value={name} onChange={(event) => setName(event.target.value)} placeholder="Research, Admin…" />
      <div className="form-actions">
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={() => {
            createLabel(state, name.trim());
            setName("");
          }}
        >
          Add
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </>
  );
}

function AppLabelPrompt({
  state,
  prompt,
  onClose,
}: {
  state: AppSnapshot;
  prompt: Extract<CalendarPrompt, { kind: "app-label" }>;
  onClose: () => void;
}) {
  const selected = state.calendarWorkspace.labels[0]?.id;
  const [labelId, setLabelId] = useState(selected);
  const [name, setName] = useState("");

  return (
    <>
      <h3>Label {prompt.appName}</h3>
      <p className="muted">Apply a label to every session of this app in the current period.</p>
      <div className="calendar-label-picks">
        {state.calendarWorkspace.labels.map((label) => (
          <button
            key={label.id}
            type="button"
            className={`calendar-label-pick ${labelId === label.id ? "is-selected" : ""}`}
            onClick={() => setLabelId(label.id)}
          >
            <span className="calendar-legend-dot" style={{ background: label.color }} />
            {label.name}
          </button>
        ))}
      </div>
      <TextField label="New label" placeholder="Optional name" value={name} onChange={(event) => setName(event.target.value)} />
      <div className="form-actions">
        <Button
          variant="primary"
          onClick={() => {
            const nextId = name.trim() ? createLabel(state, name.trim()) : labelId;
            if (!nextId) return;
            window.stopscrolling.assignCalendarLabelToApp({ appKey: prompt.appKey, labelId: nextId });
            onClose();
          }}
        >
          Apply
        </Button>
      </div>
    </>
  );
}

function createLabel(state: AppSnapshot, name: string) {
  const colors = ["#1fb894", "#478ff5", "#9e6bf0", "#2de2e2", "#fa8047"];
  const color = colors[state.calendarWorkspace.labels.length % colors.length];
  const id = `label-${crypto.randomUUID()}`;
  window.stopscrolling.upsertCalendarLabel({ id, name, color, bucket: "other", countsTowardWork: true });
  return id;
}

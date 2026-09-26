export type CalendarPrompt =
  | { kind: "label"; start: string; end: string; blockId?: string; assignmentId?: string; suggestedLabelId?: string }
  | { kind: "app-label"; appKey: string; appName: string }
  | { kind: "task"; start: string; end: string; taskId?: string; title?: string }
  | { kind: "review"; blockIds?: string[] }
  | { kind: "target" }
  | { kind: "labels" }
  | null;

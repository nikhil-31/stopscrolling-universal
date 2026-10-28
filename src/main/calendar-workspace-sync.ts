import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  defaultWorkspace,
  mergeWorkspaces,
  normalizeWorkspace,
  sameWorkspace,
  type CalendarWorkspace,
} from "@shared/calendar-workspace";
import { APIError, type RemoteCalendarWorkspace } from "./api-client";
import { logObservability } from "./logger";
import { calendarWorkspaceSyncPath } from "./paths";

/** What this device last agreed with the server on, kept next to the local workspace file. */
export interface WorkspaceSyncState {
  userId: number | null;
  version: number;
  base: CalendarWorkspace | null;
  dirty: boolean;
}

export interface WorkspaceSyncApi {
  calendarWorkspace(): Promise<RemoteCalendarWorkspace>;
  putCalendarWorkspace(baseVersion: number, data: CalendarWorkspace, deviceKey: string): Promise<RemoteCalendarWorkspace>;
}

export interface WorkspaceSyncHost {
  /** The signed-in account, or null when signed out (nothing syncs then). */
  userId(): number | null;
  deviceKey(): string;
  local(): CalendarWorkspace;
  /** Replace the local workspace with a merged or downloaded copy. */
  apply(workspace: CalendarWorkspace): void;
}

const PUSH_DELAY_MS = 1_500;
const MIN_PULL_INTERVAL_MS = 30_000;

export function loadWorkspaceSyncState(): WorkspaceSyncState {
  try {
    if (!existsSync(calendarWorkspaceSyncPath())) return emptyState();
    const parsed = JSON.parse(readFileSync(calendarWorkspaceSyncPath(), "utf8")) as Partial<WorkspaceSyncState>;
    return {
      userId: typeof parsed.userId === "number" ? parsed.userId : null,
      version: typeof parsed.version === "number" ? parsed.version : 0,
      base: parsed.base ? normalizeWorkspace(parsed.base) : null,
      dirty: parsed.dirty === true,
    };
  } catch {
    return emptyState();
  }
}

export function saveWorkspaceSyncState(state: WorkspaceSyncState) {
  mkdirSync(dirname(calendarWorkspaceSyncPath()), { recursive: true });
  writeFileSync(calendarWorkspaceSyncPath(), JSON.stringify(state), "utf8");
}

function emptyState(): WorkspaceSyncState {
  return { userId: null, version: 0, base: null, dirty: false };
}

/**
 * Keeps the calendar workspace (labels, tasks, assignments, reviewed blocks) in step with the
 * server. The local file stays the working copy so edits work offline; edits are pushed shortly
 * after they happen, and changes from other devices are merged in on pull.
 */
export class CalendarWorkspaceSync {
  private state: WorkspaceSyncState;
  private running: Promise<void> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPullAt = 0;

  constructor(
    private readonly api: WorkspaceSyncApi,
    private readonly host: WorkspaceSyncHost,
    private readonly store: { load(): WorkspaceSyncState; save(state: WorkspaceSyncState): void } = {
      load: loadWorkspaceSyncState,
      save: saveWorkspaceSyncState,
    },
  ) {
    this.state = store.load();
  }

  /** Called after every local edit. */
  markChanged() {
    this.update({ dirty: true });
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.sync({ pull: false });
    }, PUSH_DELAY_MS);
  }

  /** Pull (and push if needed). `throttle` skips the pull if one ran recently, for focus events. */
  pull(options: { throttle?: boolean } = {}) {
    if (options.throttle && Date.now() - this.lastPullAt < MIN_PULL_INTERVAL_MS) return Promise.resolve();
    return this.sync({ pull: true });
  }

  /** Signed out: stop pending pushes. The local copy and sync state stay for when this account returns. */
  reset() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.lastPullAt = 0;
  }

  private sync(options: { pull: boolean }): Promise<void> {
    const userId = this.host.userId();
    if (userId === null) return Promise.resolve();
    // Chain rather than drop: an edit made during a pull still has to be pushed afterwards.
    const previous = this.running ?? Promise.resolve();
    const next = previous
      .then(() => this.run(userId, options.pull))
      .catch((error) => {
        logObservability(`Calendar workspace sync failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (this.running === next) this.running = null;
      });
    this.running = next;
    return next;
  }

  private async run(userId: number, pull: boolean) {
    if (this.state.userId !== null && this.state.userId !== userId) {
      // Another account signed in on this device: its workspace replaces the previous one.
      const remote = await this.api.calendarWorkspace();
      this.lastPullAt = Date.now();
      const workspace = remote.data ? normalizeWorkspace(remote.data) : defaultWorkspace();
      this.host.apply(workspace);
      this.update({ userId, version: remote.version, base: workspace, dirty: false });
      return;
    }
    if (pull || this.state.userId === null) {
      const remote = await this.api.calendarWorkspace();
      this.lastPullAt = Date.now();
      await this.reconcile(userId, remote);
      return;
    }
    if (this.state.dirty) await this.push(userId, true);
  }

  /** Merge the server copy into the local one, then push if the server is missing anything. */
  private async reconcile(userId: number, remote: RemoteCalendarWorkspace, retryOnConflict = true) {
    const local = this.host.local();
    if (remote.version === 0 || !remote.data) {
      // Nothing on the server yet: this device's workspace becomes the first copy.
      this.update({ userId, version: 0 });
      await this.push(userId, retryOnConflict);
      return;
    }
    if (remote.version === this.state.version && this.state.userId === userId) {
      if (this.state.dirty) await this.push(userId, retryOnConflict);
      return;
    }
    const server = normalizeWorkspace(remote.data);
    const merged = mergeWorkspaces(this.state.userId === userId ? this.state.base : null, local, server);
    if (!sameWorkspace(merged, local)) this.host.apply(merged);
    this.update({ userId, version: remote.version, base: server, dirty: !sameWorkspace(merged, server) });
    if (this.state.dirty) await this.push(userId, retryOnConflict);
  }

  private async push(userId: number, retryOnConflict: boolean) {
    const sent = this.host.local();
    try {
      const saved = await this.api.putCalendarWorkspace(this.state.version, sent, this.host.deviceKey());
      // Edits made while the request was in flight still need pushing.
      const dirty = !sameWorkspace(this.host.local(), sent);
      this.update({ userId, version: saved.version, base: sent, dirty });
      if (dirty) this.markChanged();
    } catch (error) {
      if (error instanceof APIError && error.status === 409 && retryOnConflict) {
        await this.reconcile(userId, error.body as RemoteCalendarWorkspace, false);
        return;
      }
      // Offline or the server failed: stay dirty so the next sync tries again.
      this.update({ dirty: true });
      throw error;
    }
  }

  private update(patch: Partial<WorkspaceSyncState>) {
    this.state = { ...this.state, ...patch };
    this.store.save(this.state);
  }
}

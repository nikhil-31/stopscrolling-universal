import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace, type CalendarWorkspace } from "@shared/calendar-workspace";
import { APIError, type RemoteCalendarWorkspace } from "./api-client";
import { CalendarWorkspaceSync, type WorkspaceSyncState } from "./calendar-workspace-sync";

vi.mock("./logger", () => ({ logNetwork: vi.fn(), logObservability: vi.fn() }));
vi.mock("./paths", () => ({ calendarWorkspaceSyncPath: () => "/tmp/unused.sync.json" }));

afterEach(() => vi.useRealTimers());

const task = (id: string) => ({ id, title: id, start: "2026-09-12T09:00:00.000Z", end: "2026-09-12T10:00:00.000Z" });

function withTasks(...ids: string[]): CalendarWorkspace {
  return { ...defaultWorkspace(), tasks: ids.map(task) };
}

/** Stands in for the server: a versioned document that rejects stale writes with a 409. */
class FakeServer {
  version = 0;
  data: CalendarWorkspace | null = null;
  puts: Array<{ baseVersion: number; data: CalendarWorkspace }> = [];
  offline = false;

  async calendarWorkspace(): Promise<RemoteCalendarWorkspace> {
    if (this.offline) throw new TypeError("fetch failed");
    return { version: this.version, data: this.data, updated_at: null };
  }

  async putCalendarWorkspace(baseVersion: number, data: CalendarWorkspace): Promise<RemoteCalendarWorkspace> {
    if (this.offline) throw new TypeError("fetch failed");
    this.puts.push({ baseVersion, data });
    if (baseVersion !== this.version) {
      throw new APIError("conflict", 409, { version: this.version, data: this.data, updated_at: null });
    }
    this.version += 1;
    this.data = structuredClone(data);
    return { version: this.version, data: this.data, updated_at: null };
  }
}

function setup(options: { local?: CalendarWorkspace; state?: Partial<WorkspaceSyncState>; userId?: number | null } = {}) {
  const server = new FakeServer();
  let local = options.local ?? defaultWorkspace();
  let saved: WorkspaceSyncState = { userId: null, version: 0, base: null, dirty: false, ...options.state };
  const userId = { current: options.userId === undefined ? 1 : options.userId };
  const sync = new CalendarWorkspaceSync(
    server,
    {
      userId: () => userId.current,
      deviceKey: () => "macos|Studio Mac",
      local: () => local,
      apply: (workspace) => {
        local = workspace;
      },
    },
    { load: () => saved, save: (state) => { saved = state; } },
  );
  return {
    server,
    sync,
    userId,
    local: () => local,
    edit: (workspace: CalendarWorkspace) => {
      local = workspace;
      sync.markChanged();
    },
    state: () => saved,
  };
}

describe("CalendarWorkspaceSync", () => {
  it("uploads the existing local workspace the first time the account syncs", async () => {
    const { server, sync, state } = setup({ local: withTasks("from-before-sync") });
    await sync.pull();
    expect(server.data?.tasks.map((item) => item.id)).toEqual(["from-before-sync"]);
    expect(state()).toMatchObject({ userId: 1, version: 1, dirty: false });
  });

  it("takes the server copy on a new device instead of re-adding default labels", async () => {
    const { server, sync, local } = setup();
    server.version = 3;
    server.data = { ...withTasks("elsewhere"), labels: [{ id: "label-x", name: "Client work", color: "#000", bucket: "focus", countsTowardWork: true }] };
    await sync.pull();
    expect(local().labels.map((label) => label.name)).toEqual(["Client work"]);
    expect(local().tasks.map((item) => item.id)).toEqual(["elsewhere"]);
    expect(server.puts).toEqual([]);
  });

  it("merges edits made on another device with unpushed local edits", async () => {
    const { server, sync, local } = setup({
      local: withTasks("shared", "local-new"),
      state: { userId: 1, version: 1, base: withTasks("shared"), dirty: true },
    });
    server.version = 2;
    server.data = withTasks("shared", "remote-new");
    await sync.pull();
    expect(local().tasks.map((item) => item.id)).toEqual(["shared", "local-new", "remote-new"]);
    expect(server.version).toBe(3);
    expect(server.data?.tasks.map((item) => item.id)).toEqual(["shared", "local-new", "remote-new"]);
  });

  it("pushes edits shortly after they happen and retries a conflicting push after merging", async () => {
    vi.useFakeTimers();
    const { server, sync, edit, local } = setup({ state: { userId: 1, version: 1, base: withTasks(), dirty: false } });
    server.version = 1;
    server.data = withTasks();
    edit(withTasks("mine"));
    // Another device saved in the meantime.
    server.version = 2;
    server.data = withTasks("theirs");
    await vi.advanceTimersByTimeAsync(1_500);
    await sync.pull();
    expect(server.puts[0].baseVersion).toBe(1);
    expect(server.data?.tasks.map((item) => item.id)).toEqual(["mine", "theirs"]);
    expect(local().tasks.map((item) => item.id)).toEqual(["mine", "theirs"]);
  });

  it("keeps edits made offline and sends them once the server is reachable", async () => {
    vi.useFakeTimers();
    const { server, sync, edit, state } = setup({ state: { userId: 1, version: 1, base: withTasks(), dirty: false } });
    server.version = 1;
    server.data = withTasks();
    server.offline = true;
    edit(withTasks("offline"));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(state().dirty).toBe(true);
    server.offline = false;
    await sync.pull();
    expect(server.data?.tasks.map((item) => item.id)).toEqual(["offline"]);
    expect(state().dirty).toBe(false);
  });

  it("replaces the workspace when a different account signs in on this device", async () => {
    const { server, sync, local, state } = setup({
      local: withTasks("previous-account"),
      state: { userId: 9, version: 4, base: withTasks("previous-account"), dirty: false },
    });
    server.version = 2;
    server.data = withTasks("this-account");
    await sync.pull();
    expect(local().tasks.map((item) => item.id)).toEqual(["this-account"]);
    expect(state()).toMatchObject({ userId: 1, version: 2 });
    expect(server.puts).toEqual([]);
  });

  it("does nothing while signed out", async () => {
    const { server, sync, edit, state } = setup({ userId: null });
    edit(withTasks("offline"));
    await sync.pull();
    expect(server.puts).toEqual([]);
    expect(state().dirty).toBe(true);
  });
});

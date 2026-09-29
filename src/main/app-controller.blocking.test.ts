import { rmSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, BlockingPolicyResponse, BlockingSchedule } from "@shared/types";
import { AppController } from "./app-controller";
import { BlockingHelperBridge } from "./blocking/bridge";
import type { HelperTransport } from "./blocking/transport";

const userData = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "blocking-sessions-"));
});

vi.mock("electron", () => ({
  app: {
    getPath: () => userData,
    isPackaged: false,
    setLoginItemSettings: () => {},
  },
  BrowserWindow: class {},
  powerMonitor: { on: () => {} },
  powerSaveBlocker: { start: () => 1, stop: () => {}, isStarted: () => false },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
  shell: { openExternal: async () => {} },
  systemPreferences: {},
}));

const user: AuthenticatedUser = {
  id: 1,
  email: "ada@example.com",
  tracking_id: "track",
  totp_enabled: false,
  phone_number: "",
  phone_verified: false,
  mfa_delivery: "email",
  social_providers: [],
};

const schedule: BlockingSchedule = {
  schedule_id: "schedule-1",
  name: "Focus",
  start_time: "09:00",
  end_time: "17:00",
  days_of_week: [1, 2, 3, 4, 5],
  time_zone: "UTC",
  is_active: true,
  blocklists: [],
  devices: [],
  blocklist_count: 0,
  device_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const helperTransport: HelperTransport = {
  kind: "unavailable",
  request: async () => ({
    policyVersion: 1,
    activeOccurrenceIDs: [],
    strictOccurrenceIDs: [],
    policyExpiresAt: null,
    lastError: null,
  }),
};

describe("blocking session load", () => {
  afterAll(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("shows sessions before the helper policy refresh finishes", async () => {
    const controller = new AppController(new BlockingHelperBridge(helperTransport));
    const policy = deferred<BlockingPolicyResponse>();
    controller.auth.user = user;
    controller.api.setTokens({ access: "access", refresh: "refresh" });
    controller.api.blocklists = async () => [];
    controller.api.blockingSchedules = async () => [schedule];
    controller.api.devices = async () => [];
    controller.api.deviceStatus = async () => [];
    controller.tracker.registerLocalDevice = async () => "device-1";
    controller.api.blockingPublicKey = async () => ({
      algorithm: "Ed25519",
      kid: "kid",
      public_key: "key",
    });
    controller.api.deviceBlockingPolicy = () => policy.promise;

    const pending = controller.refreshBlocking();
    await vi.waitFor(() => {
      expect(controller.blocking.schedules).toEqual([schedule]);
      expect(controller.blocking.loading).toBe(false);
    });

    policy.resolve({
      policy_version: 1,
      device_id: "device-1",
      server_time: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-01T01:00:00Z",
      occurrences: [],
      algorithm: "Ed25519",
      kid: "kid",
      signature: "sig",
    });
    await pending;
  });

  it("does not reload the timeline when opening blocking", () => {
    const controller = new AppController(new BlockingHelperBridge(helperTransport));
    const loadRange = vi.spyOn(controller.tracker, "loadRange").mockResolvedValue(undefined);
    controller.selectNavigation("blocking");
    expect(loadRange).not.toHaveBeenCalled();
  });
});

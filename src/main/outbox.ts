import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { safeStorage } from "electron";
import type { ScreenTimeEntry } from "@shared/types";
import { decryptAesGcm, encryptAesGcm } from "@shared/crypto";
import { persistenceKey } from "@shared/payload";
import { outboxKeyPath, outboxPath } from "./paths";

function loadOrCreateKey(): Buffer {
  mkdirSync(dirname(outboxKeyPath()), { recursive: true });
  if (existsSync(outboxKeyPath())) {
    const stored = readFileSync(outboxKeyPath());
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return Buffer.from(safeStorage.decryptString(stored), "base64");
      } catch {
        // fall through to regenerate
      }
    } else if (stored.length === 32) {
      return stored;
    }
  }
  const key = randomBytes(32);
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(outboxKeyPath(), safeStorage.encryptString(key.toString("base64")));
  } else {
    writeFileSync(outboxKeyPath(), key);
  }
  return key;
}

export class PendingUploadStore {
  private key = loadOrCreateKey();
  private cached: ScreenTimeEntry[] | null = null;
  private writeTimer: NodeJS.Timeout | null = null;

  /** `writeDelayMs` coalesces disk writes; memory is always current and `flush()` writes now. */
  constructor(private readonly writeDelayMs = 0) {}

  load(): ScreenTimeEntry[] {
    if (this.cached) return this.cached;
    try {
      if (!existsSync(outboxPath())) {
        this.cached = [];
        return this.cached;
      }
      const decrypted = decryptAesGcm(readFileSync(outboxPath()), this.key);
      const parsed = JSON.parse(decrypted.toString("utf8")) as ScreenTimeEntry[];
      this.cached = Array.isArray(parsed) ? parsed : [];
      return this.cached;
    } catch {
      return [];
    }
  }

  save(entries: ScreenTimeEntry[]) {
    this.cached = dedupe(entries);
    if (this.writeDelayMs <= 0) {
      this.flush();
      return;
    }
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => this.flush(), this.writeDelayMs);
    this.writeTimer.unref?.();
  }

  flush() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    if (!this.cached) return;
    mkdirSync(dirname(outboxPath()), { recursive: true });
    writeFileSync(outboxPath(), encryptAesGcm(Buffer.from(JSON.stringify(this.cached), "utf8"), this.key));
  }

  append(entry: ScreenTimeEntry) {
    const items = this.load().slice();
    items.push(entry);
    this.save(items);
  }

  removeKeys(keys: Set<string>) {
    this.save(this.load().filter((entry) => !keys.has(persistenceKey(entry))));
  }

  count() {
    return this.load().length;
  }
}

export function dedupe(entries: ScreenTimeEntry[]): ScreenTimeEntry[] {
  const byKey = new Map<string, ScreenTimeEntry>();
  for (const entry of entries) byKey.set(persistenceKey(entry), entry);
  return Array.from(byKey.values());
}

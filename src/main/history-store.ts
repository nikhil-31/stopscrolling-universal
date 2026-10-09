import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { safeStorage } from "electron";
import { historyDir, historyKeyPath } from "./paths";
import { LocalHistoryStore } from "./local-history";

function loadOrCreateKey(): Buffer {
  mkdirSync(dirname(historyKeyPath()), { recursive: true });
  if (existsSync(historyKeyPath())) {
    const stored = readFileSync(historyKeyPath());
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
    writeFileSync(historyKeyPath(), safeStorage.encryptString(key.toString("base64")));
  } else {
    writeFileSync(historyKeyPath(), key);
  }
  return key;
}

export function openLocalHistory() {
  return new LocalHistoryStore(historyDir(), loadOrCreateKey());
}

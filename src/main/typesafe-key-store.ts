import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { typesafeKeyPath } from "./paths";

export function saveTypesafeApiKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) {
    clearTypesafeApiKey();
    return;
  }
  mkdirSync(dirname(typesafeKeyPath()), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(typesafeKeyPath(), safeStorage.encryptString(trimmed));
  } else {
    writeFileSync(typesafeKeyPath(), trimmed, "utf8");
  }
}

export function loadTypesafeApiKey(): string | null {
  try {
    if (!existsSync(typesafeKeyPath())) return null;
    const raw = readFileSync(typesafeKeyPath());
    const text = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    const trimmed = text.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export function clearTypesafeApiKey() {
  if (existsSync(typesafeKeyPath())) unlinkSync(typesafeKeyPath());
}

export function resolveTypesafeApiKey(): string | null {
  return loadTypesafeApiKey() ?? (process.env.TYPESAFE_API_KEY?.trim() || null);
}

export function hasTypesafeApiKey(): boolean {
  return Boolean(resolveTypesafeApiKey());
}

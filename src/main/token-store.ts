import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuthTokens } from "@shared/types";
import { tokensPath } from "./paths";

export function saveTokens(tokens: AuthTokens) {
  mkdirSync(dirname(tokensPath()), { recursive: true });
  const payload = JSON.stringify(tokens);
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(tokensPath(), safeStorage.encryptString(payload));
  } else {
    writeFileSync(tokensPath(), payload, "utf8");
  }
}

export function loadTokens(): AuthTokens | null {
  try {
    if (!existsSync(tokensPath())) return null;
    const raw = readFileSync(tokensPath());
    const text = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    const parsed = JSON.parse(text) as AuthTokens;
    if (!parsed.access || !parsed.refresh) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTokens() {
  if (existsSync(tokensPath())) unlinkSync(tokensPath());
}

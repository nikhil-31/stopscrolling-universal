import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuthenticatedUser, AuthTokens } from "@shared/types";
import { sessionUserPath, tokensPath } from "./paths";

export function saveTokens(tokens: AuthTokens) {
  mkdirSync(dirname(tokensPath()), { recursive: true });
  const payload = JSON.stringify(tokens);
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(tokensPath(), safeStorage.encryptString(payload));
  } else {
    writeFileSync(tokensPath(), payload, "utf8");
  }
}

function parseTokens(text: string): AuthTokens | null {
  const parsed = JSON.parse(text) as AuthTokens;
  if (!parsed?.access || !parsed?.refresh) return null;
  return parsed;
}

export function loadTokens(): AuthTokens | null {
  try {
    if (!existsSync(tokensPath())) return null;
    const raw = readFileSync(tokensPath());
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return parseTokens(safeStorage.decryptString(raw));
      } catch {
        /* Older launches stored plaintext when encryption was not ready yet. */
      }
    }
    return parseTokens(raw.toString("utf8"));
  } catch {
    return null;
  }
}

export function clearTokens() {
  if (existsSync(tokensPath())) unlinkSync(tokensPath());
  clearSessionUser();
}

export function saveSessionUser(user: AuthenticatedUser) {
  mkdirSync(dirname(sessionUserPath()), { recursive: true });
  writeFileSync(sessionUserPath(), JSON.stringify(user), "utf8");
}

export function loadSessionUser(): AuthenticatedUser | null {
  try {
    if (!existsSync(sessionUserPath())) return null;
    const parsed = JSON.parse(readFileSync(sessionUserPath(), "utf8")) as AuthenticatedUser;
    if (!parsed?.email || typeof parsed.id !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionUser() {
  if (existsSync(sessionUserPath())) unlinkSync(sessionUserPath());
}

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { safeStorage, shell } from "electron";
import type { CalendarOverlayEvent } from "@shared/types";
import { googleTokensPath } from "./paths";
import { logObservability } from "./logger";

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry: number;
}

function saveGoogleTokens(tokens: GoogleTokens) {
  mkdirSync(dirname(googleTokensPath()), { recursive: true });
  const payload = JSON.stringify(tokens);
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(googleTokensPath(), safeStorage.encryptString(payload));
  } else {
    writeFileSync(googleTokensPath(), payload, "utf8");
  }
}

function loadGoogleTokens(): GoogleTokens | null {
  try {
    if (!existsSync(googleTokensPath())) return null;
    const raw = readFileSync(googleTokensPath());
    const text = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    return JSON.parse(text) as GoogleTokens;
  } catch {
    return null;
  }
}

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function listenForCode(portReady: (port: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body style='font-family:sans-serif;padding:32px'>You can close this window.</body></html>");
        server.close();
        if (error || !code) reject(new Error(error || "Google authorization was cancelled."));
        else resolve(code);
      } catch (error) {
        reject(error);
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not bind OAuth loopback port."));
        return;
      }
      portReady(address.port);
    });
    server.on("error", reject);
  });
}

export class GoogleCalendarService {
  connected() {
    const tokens = loadGoogleTokens();
    return Boolean(tokens?.refresh_token || tokens?.access_token);
  }

  disconnect() {
    if (existsSync(googleTokensPath())) unlinkSync(googleTokensPath());
  }

  async connect(clientId: string): Promise<string> {
    const trimmed = clientId.trim();
    if (!trimmed) throw new Error("Set a Google OAuth client ID in Settings.");
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    let redirectUri = "";
    const codePromise = listenForCode((port) => {
      redirectUri = `http://127.0.0.1:${port}/callback`;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.searchParams.set("client_id", trimmed);
      auth.searchParams.set("redirect_uri", redirectUri);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.readonly");
      auth.searchParams.set("code_challenge", challenge);
      auth.searchParams.set("code_challenge_method", "S256");
      auth.searchParams.set("access_type", "offline");
      auth.searchParams.set("prompt", "consent");
      void shell.openExternal(auth.toString());
    });
    const code = await codePromise;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: trimmed,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const json = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!json.access_token) throw new Error(json.error || "Google token exchange failed.");
    saveGoogleTokens({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expiry: Date.now() + (json.expires_in ?? 3600) * 1000,
    });
    logObservability("Google Calendar connected");
    return "Google Calendar connected";
  }

  async eventsForDay(day: Date, clientId: string): Promise<CalendarOverlayEvent[]> {
    const tokens = await this.ensureAccess(clientId);
    if (!tokens) return [];
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", start.toISOString());
    url.searchParams.set("timeMax", end.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        organizer?: { displayName?: string; email?: string };
      }>;
    };
    return (body.items ?? []).map((item) => ({
      id: item.id,
      title: item.summary || "(No title)",
      start: item.start?.dateTime || item.start?.date || start.toISOString(),
      end: item.end?.dateTime || item.end?.date || end.toISOString(),
      calendarName: item.organizer?.displayName || item.organizer?.email || "Google",
      isAllDay: Boolean(item.start?.date && !item.start?.dateTime),
      colorHex: "#4285F4",
      provider: "google" as const,
    }));
  }

  private async ensureAccess(clientId: string): Promise<GoogleTokens | null> {
    const stored = loadGoogleTokens();
    if (!stored) return null;
    if (stored.expiry > Date.now() + 30_000) return stored;
    if (!stored.refresh_token || !clientId) return stored;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: stored.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return stored;
    const next = {
      ...stored,
      access_token: json.access_token,
      expiry: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    saveGoogleTokens(next);
    return next;
  }
}

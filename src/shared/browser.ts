const BROWSER_PROCESSES = [
  "chrome",
  "google chrome",
  "google chrome canary",
  "google chrome beta",
  "google chrome dev",
  "chromium",
  "msedge",
  "microsoft edge",
  "firefox",
  "firefox developer edition",
  "brave",
  "brave browser",
  "opera",
  "opera gx",
  "opera_gx",
  "arc",
  "vivaldi",
  "safari",
  "safari technology preview",
  "orion",
  "zen browser",
  "com.google.chrome",
  "com.apple.safari",
  "org.mozilla.firefox",
  "com.brave.browser",
  "com.microsoft.edgemac",
  "company.thebrowser.browser",
  "com.operasoftware.opera",
  "com.vivaldi.vivaldi",
  "app.zen-browser.zen",
  "com.kagi.kagimacOS",
];

export type BrowserKind = "safari" | "chromium" | "firefox";

export function isBrowserProcess(processName: string | null | undefined): boolean {
  if (!processName) return false;
  const lower = processName.toLowerCase();
  return BROWSER_PROCESSES.some((name) => lower === name);
}

export function looksLikeBrowser(identifier: string | null | undefined): boolean {
  if (!identifier) return false;
  const lower = identifier.toLowerCase();
  return BROWSER_PROCESSES.some((name) => lower.includes(name));
}

export function browserKind(appName: string, bundleID = ""): BrowserKind | null {
  if (!looksLikeBrowser(appName) && !looksLikeBrowser(bundleID)) return null;
  const haystack = `${appName} ${bundleID}`.toLowerCase();
  if (haystack.includes("safari") || haystack.includes("orion") || haystack.includes("kagi")) return "safari";
  if (haystack.includes("firefox") || haystack.includes("zen")) return "firefox";
  return "chromium";
}

export function normalizeCapturedUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed || /^(missing value|null|undefined|none)$/i.test(trimmed)) return "";
  if (/^(https?|file|ftp):\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return trimmed;
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return "";
    }
  }
  return "";
}

export function extractUrlFromText(text: string | null | undefined): string {
  if (!text) return "";
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return normalizeCapturedUrl(match?.[0] ?? "");
}

export function parseBrowserTabResult(raw: string): { title: string; url: string } {
  const separator = raw.indexOf("|||");
  const title = (separator === -1 ? raw : raw.slice(0, separator)).trim();
  const url = normalizeCapturedUrl(separator === -1 ? "" : raw.slice(separator + 3));
  return { title, url };
}

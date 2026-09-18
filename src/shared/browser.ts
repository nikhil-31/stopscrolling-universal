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

/** AppleScript application name for the main browser, including Chrome Helper processes. */
export function scriptingAppName(appName: string, bundleID = ""): string | null {
  if (!looksLikeBrowser(appName) && !looksLikeBrowser(bundleID)) return null;
  const haystack = `${appName} ${bundleID}`.toLowerCase();
  if (haystack.includes("safari technology preview")) return "Safari Technology Preview";
  if (haystack.includes("orion")) return "Orion";
  if (haystack.includes("safari")) return "Safari";
  if (haystack.includes("chrome canary")) return "Google Chrome Canary";
  if (haystack.includes("chrome beta")) return "Google Chrome Beta";
  if (haystack.includes("chrome dev")) return "Google Chrome Dev";
  if (haystack.includes("chromium")) return "Chromium";
  if (haystack.includes("chrome")) return "Google Chrome";
  if (haystack.includes("brave")) return "Brave Browser";
  if (haystack.includes("edgemac") || haystack.includes("microsoft edge") || haystack.includes("msedge")) {
    return "Microsoft Edge";
  }
  if (haystack.includes("thebrowser") || /(^|[^a-z])arc([^a-z]|$)/.test(haystack)) return "Arc";
  if (haystack.includes("opera gx") || haystack.includes("opera_gx")) return "Opera GX";
  if (haystack.includes("opera")) return "Opera";
  if (haystack.includes("vivaldi")) return "Vivaldi";
  if (haystack.includes("zen")) return "Zen Browser";
  if (haystack.includes("firefox developer")) return "Firefox Developer Edition";
  if (haystack.includes("firefox")) return "Firefox";
  return appName || null;
}

export function browserUrlScripts(kind: BrowserKind, specifier: string) {
  if (kind === "safari") {
    return [
      `tell application ${specifier} to return URL of current tab of front window`,
      `tell application ${specifier} to return URL of current tab of window 1`,
    ];
  }
  if (kind === "firefox") {
    return [`tell application ${specifier} to return URL of active tab of front window`];
  }
  return [
    `tell application ${specifier} to return URL of active tab of front window`,
    `tell application ${specifier} to return URL of active tab of window 1`,
  ];
}

export function browserTitleScripts(kind: BrowserKind, specifier: string) {
  if (kind === "safari") {
    return [`tell application ${specifier} to return name of current tab of front window`];
  }
  return [
    `tell application ${specifier} to return title of active tab of front window`,
    `tell application ${specifier} to return name of active tab of front window`,
  ];
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

export function websiteHostname(url: string | null | undefined): string {
  const normalized = normalizeCapturedUrl(url);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function parseBrowserTabResult(raw: string): { title: string; url: string } {
  const separator = raw.indexOf("|||");
  const title = (separator === -1 ? raw : raw.slice(0, separator)).trim();
  const url = normalizeCapturedUrl(separator === -1 ? "" : raw.slice(separator + 3));
  return { title, url };
}

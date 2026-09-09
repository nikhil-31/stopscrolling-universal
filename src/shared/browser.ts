const BROWSER_PROCESSES = [
  "chrome",
  "chromium",
  "msedge",
  "firefox",
  "brave",
  "opera",
  "opera_gx",
  "arc",
  "vivaldi",
  "safari",
  "com.google.chrome",
  "com.apple.safari",
  "org.mozilla.firefox",
  "com.brave.browser",
  "com.microsoft.edgemac",
  "company.thebrowser.browser",
];

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

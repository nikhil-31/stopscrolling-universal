import { looksLikeBrowser } from "./browser";

const bundleCategories: Record<string, string> = {
  "com.apple.mail": "Productivity",
  "com.apple.ical": "Productivity",
  "com.apple.notes": "Productivity",
  "com.apple.finder": "Utilities",
  "com.apple.terminal": "Development",
  "com.apple.dt.xcode": "Development",
  "com.tinyspeck.slackmacgap": "Communication",
  "com.microsoft.vscode": "Development",
  "com.spotify.client": "Entertainment",
  "com.apple.music": "Entertainment",
  "com.apple.tv": "Entertainment",
  "com.netflix.netflix": "Entertainment",
  "com.apple.facetime": "Communication",
  "com.apple.mobilesms": "Communication",
};

const processCategories: Array<[string, string]> = [
  ["code", "Development"],
  ["devenv", "Development"],
  ["xcode", "Development"],
  ["terminal", "Development"],
  ["iterm", "Development"],
  ["slack", "Communication"],
  ["teams", "Communication"],
  ["discord", "Communication"],
  ["zoom", "Communication"],
  ["spotify", "Entertainment"],
  ["vlc", "Entertainment"],
  ["steam", "Entertainment"],
  ["finder", "Utilities"],
  ["explorer", "Utilities"],
];

const domainCategories: Array<[string, string]> = [
  ["youtube.com", "Video"],
  ["youtu.be", "Video"],
  ["netflix.com", "Video"],
  ["twitch.tv", "Video"],
  ["instagram.com", "Social"],
  ["facebook.com", "Social"],
  ["twitter.com", "Social"],
  ["x.com", "Social"],
  ["reddit.com", "Social"],
  ["tiktok.com", "Social"],
  ["linkedin.com", "Social"],
  ["github.com", "Development"],
  ["stackoverflow.com", "Development"],
  ["notion.so", "Productivity"],
  ["docs.google.com", "Productivity"],
];

export function resolveCategory(bundleID: string, url: string, title: string, appName = ""): string {
  const bundleKey = bundleID.toLowerCase();
  if (bundleCategories[bundleKey]) return bundleCategories[bundleKey];

  const haystack = `${bundleID} ${appName}`.toLowerCase();
  for (const [needle, category] of processCategories) {
    if (haystack.includes(needle)) return category;
  }

  if (looksLikeBrowser(bundleID) || looksLikeBrowser(appName)) {
    return categoryForURL(url) ?? categoryForTitle(title) ?? "Web";
  }

  return "Application";
}

function categoryForURL(urlString: string): string | null {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    for (const [pattern, category] of domainCategories) {
      if (host.includes(pattern)) return category;
    }
  } catch {
    return null;
  }
  return null;
}

function categoryForTitle(title: string): string | null {
  const lower = title.toLowerCase();
  if (lower.includes("inbox") || lower.includes("mail")) return "Productivity";
  if (lower.includes("meet") || lower.includes("zoom")) return "Communication";
  return null;
}

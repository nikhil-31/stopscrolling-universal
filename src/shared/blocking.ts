import type { BlockingSchedule } from "./types";

export const WEEKDAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

export function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function parseCommaSeparated(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function blocklistEntriesFromText(websites: string, apps: string) {
  return [
    ...parseCommaSeparated(websites).map((identifier) => ({
      entry_type: "website" as const,
      identifier,
    })),
    ...parseCommaSeparated(apps).map((identifier) => ({
      entry_type: "app" as const,
      identifier,
    })),
  ];
}

export function normalizeWebsite(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    ?.trim() ?? "";
}

export function parseWebsiteList(value: string) {
  return [...new Set(
    value
      .split(/[\s,]+/)
      .map(normalizeWebsite)
      .filter(Boolean),
  )];
}

export const COMMON_FILTERS = [
  { id: "amazon", label: "Amazon", identifiers: ["amazon.com"] },
  { id: "instagram", label: "Instagram", identifiers: ["instagram.com"] },
  { id: "pinterest", label: "Pinterest", identifiers: ["pinterest.com"] },
  { id: "tiktok", label: "TikTok", identifiers: ["tiktok.com"] },
  { id: "apple-news", label: "Apple News", identifiers: ["news.apple.com"] },
  { id: "linkedin", label: "LinkedIn", identifiers: ["linkedin.com"] },
  { id: "reddit", label: "Reddit", identifiers: ["reddit.com"] },
  { id: "tinder", label: "Tinder", identifiers: ["tinder.com"] },
  { id: "discord", label: "Discord", identifiers: ["discord.com"] },
  { id: "mastodon", label: "Mastodon", identifiers: ["mastodon.social"] },
  { id: "slack", label: "Slack", identifiers: ["slack.com"] },
  { id: "tumblr", label: "Tumblr", identifiers: ["tumblr.com"] },
  { id: "ebay", label: "eBay", identifiers: ["ebay.com"] },
  { id: "netflix", label: "Netflix", identifiers: ["netflix.com"] },
  { id: "snapchat", label: "Snapchat", identifiers: ["snapchat.com"] },
  { id: "whatsapp", label: "WhatsApp", identifiers: ["whatsapp.com", "web.whatsapp.com"] },
  { id: "facebook", label: "Facebook", identifiers: ["facebook.com"] },
  { id: "nytimes", label: "NY Times", identifiers: ["nytimes.com"] },
  { id: "spotify", label: "Spotify", identifiers: ["spotify.com"] },
  { id: "x", label: "X", identifiers: ["x.com", "twitter.com"] },
  { id: "gmail", label: "Gmail", identifiers: ["mail.google.com", "gmail.com"] },
  { id: "okcupid", label: "OkCupid", identifiers: ["okcupid.com"] },
  { id: "telegram", label: "Telegram", identifiers: ["telegram.org", "web.telegram.org"] },
  { id: "youtube", label: "YouTube", identifiers: ["youtube.com"] },
] as const;

export const CATEGORY_FILTERS = [
  { id: "social", label: "Social", identifiers: ["facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "snapchat.com", "reddit.com", "tumblr.com", "pinterest.com", "threads.net"] },
  { id: "politics", label: "Politics", identifiers: ["cnn.com", "foxnews.com", "politico.com", "thehill.com", "huffpost.com"] },
  { id: "food-delivery", label: "Food Delivery", identifiers: ["doordash.com", "ubereats.com", "grubhub.com"] },
  { id: "adult", label: "Adult", identifiers: ["pornhub.com", "xvideos.com", "xhamster.com", "onlyfans.com"] },
  { id: "meta", label: "Meta", identifiers: ["facebook.com", "instagram.com", "threads.net", "whatsapp.com", "messenger.com", "meta.com"] },
  { id: "shopping", label: "Shopping", identifiers: ["amazon.com", "ebay.com", "etsy.com", "walmart.com", "target.com"] },
  { id: "games", label: "Games", identifiers: ["steampowered.com", "roblox.com", "twitch.tv", "epicgames.com"] },
  { id: "ai", label: "AI", identifiers: ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"] },
  { id: "messaging", label: "Messaging", identifiers: ["discord.com", "slack.com", "telegram.org", "whatsapp.com", "messenger.com"] },
  { id: "tv-video", label: "TV/Video", identifiers: ["youtube.com", "netflix.com", "hulu.com", "disneyplus.com", "twitch.tv", "max.com"] },
  { id: "time-wasters", label: "Time Wasters", identifiers: ["reddit.com", "tiktok.com", "youtube.com", "x.com", "instagram.com"] },
  { id: "search", label: "Search Engines", identifiers: ["google.com", "bing.com", "duckduckgo.com", "yahoo.com"] },
  { id: "sports", label: "Sports", identifiers: ["espn.com", "bleacherreport.com", "cbssports.com"] },
  { id: "dating", label: "Dating", identifiers: ["tinder.com", "okcupid.com", "bumble.com", "hinge.co"] },
  { id: "news", label: "News", identifiers: ["nytimes.com", "cnn.com", "bbc.com", "washingtonpost.com", "reuters.com"] },
  { id: "blogs", label: "Blogs", identifiers: ["medium.com", "substack.com", "wordpress.com"] },
  { id: "gambling", label: "Gambling", identifiers: ["draftkings.com", "fanduel.com", "bet365.com"] },
] as const;

export function collectBlocklistEntries(input: {
  customWebsites: string[];
  commonFilterIds: string[];
  categoryIds: string[];
}) {
  const entries = new Map<string, { entry_type: "website"; identifier: string; label: string }>();

  function add(identifier: string, label: string) {
    const key = normalizeWebsite(identifier);
    if (!key || entries.has(key)) return;
    entries.set(key, { entry_type: "website", identifier: key, label });
  }

  for (const website of input.customWebsites) add(website, website);
  for (const filter of COMMON_FILTERS) {
    if (!input.commonFilterIds.includes(filter.id)) continue;
    for (const identifier of filter.identifiers) add(identifier, filter.label);
  }
  for (const category of CATEGORY_FILTERS) {
    if (!input.categoryIds.includes(category.id)) continue;
    for (const identifier of category.identifiers) add(identifier, category.label);
  }
  return [...entries.values()];
}

export function decomposeBlocklistEntries(
  entries: Array<{ entry_type: "app" | "website"; identifier: string; label?: string }>,
) {
  const websiteIds = [...new Set(
    entries
      .filter((entry) => entry.entry_type === "website")
      .map((entry) => normalizeWebsite(entry.identifier))
      .filter(Boolean),
  )];
  const websiteSet = new Set(websiteIds);
  const covered = new Set<string>();

  const commonFilterIds: string[] = [];
  for (const filter of COMMON_FILTERS) {
    const ids = filter.identifiers.map(normalizeWebsite).filter(Boolean);
    if (ids.length && ids.every((id) => websiteSet.has(id))) {
      commonFilterIds.push(filter.id);
      ids.forEach((id) => covered.add(id));
    }
  }

  const categoryIds: string[] = [];
  for (const category of CATEGORY_FILTERS) {
    const ids = category.identifiers.map(normalizeWebsite).filter(Boolean);
    if (ids.length && ids.every((id) => websiteSet.has(id))) {
      categoryIds.push(category.id);
      ids.forEach((id) => covered.add(id));
    }
  }

  return {
    customWebsites: websiteIds.filter((id) => !covered.has(id)),
    commonFilterIds,
    categoryIds,
    appEntries: entries
      .filter((entry) => entry.entry_type === "app" && entry.identifier.trim())
      .map((entry) => ({
        entry_type: "app" as const,
        identifier: entry.identifier.trim(),
        label: entry.label?.trim() || entry.identifier.trim(),
      })),
  };
}

export function clockLabel(time: string) {
  return time.slice(0, 5);
}

export function parseMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function isScheduleRunningNow(
  schedule: Pick<BlockingSchedule, "is_active" | "days_of_week" | "start_time" | "end_time">,
  now = new Date(),
) {
  if (!schedule.is_active) return false;
  const jsDay = now.getDay();
  const mondayBased = jsDay === 0 ? 6 : jsDay - 1;
  if (!schedule.days_of_week.includes(mondayBased)) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseMinutes(schedule.start_time);
  const endMinutes = parseMinutes(schedule.end_time);
  return minutes >= startMinutes && minutes < endMinutes;
}

export function isAlwaysActive(
  schedule: Pick<BlockingSchedule, "days_of_week" | "start_time" | "end_time">,
) {
  if (new Set(schedule.days_of_week).size < 7) return false;
  const start = clockLabel(schedule.start_time);
  const end = clockLabel(schedule.end_time);
  return start === "00:00" && (end === "23:59" || end === "24:00");
}

export function remainingUntilEnd(
  schedule: Pick<BlockingSchedule, "end_time">,
  now = new Date(),
) {
  const endMinutes = parseMinutes(schedule.end_time);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, endMinutes - nowMinutes);
}

export function formatRemaining(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
  const minuteLabel = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (hours === 0) return `${minuteLabel} left`;
  if (minutes === 0) return `${hourLabel} left`;
  return `${hourLabel} ${minuteLabel} left`;
}

export function formatWeekdays(days: number[]) {
  const labels = new Map<number, string>(WEEKDAYS.map((day) => [day.value, day.label]));
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => labels.get(day) ?? String(day))
    .join(", ");
}

export function scheduleWhen(
  schedule: Pick<BlockingSchedule, "start_time" | "end_time" | "days_of_week">,
  options?: { today?: boolean },
) {
  const range = `${clockLabel(schedule.start_time)} – ${clockLabel(schedule.end_time)}`;
  if (options?.today) return `${range} · Today`;
  if (schedule.days_of_week.length === 7) return `${range} · Every day`;
  return `${range} · ${formatWeekdays(schedule.days_of_week)}`;
}

export function scheduleRowKind(
  schedule: Pick<BlockingSchedule, "is_active" | "days_of_week" | "start_time" | "end_time">,
  now = new Date(),
): "current" | "schedule" | "named" {
  if (isScheduleRunningNow(schedule, now)) return "current";
  if (isAlwaysActive(schedule)) return "schedule";
  return "named";
}

export function scheduleStatusLabel(kind: "current" | "schedule" | "named") {
  if (kind === "current") return "Running";
  if (kind === "schedule") return "Always Active";
  return "Scheduled";
}

export function scheduleDeviceLabel(device: BlockingSchedule["devices"][number]) {
  return device.label || device.device_name || device.device_id;
}

export function emptySessionDraft() {
  return {
    name: "",
    startTime: "09:00",
    endTime: "17:00",
    timeZone: defaultTimeZone(),
    selectedDays: [0, 1, 2, 3, 4],
    selectedBlocklistIds: [] as string[],
    selectedDeviceIds: [] as string[],
    isActive: undefined as boolean | undefined,
    strictMode: false,
  };
}

export type SessionComposerDraft = ReturnType<typeof emptySessionDraft>;

export function scheduleToComposerDraft(
  schedule: Pick<
    BlockingSchedule,
    "name" | "start_time" | "end_time" | "days_of_week" | "time_zone" | "blocklists" | "devices" | "is_active" | "strict_mode"
  >,
): SessionComposerDraft {
  return {
    name: schedule.name,
    startTime: clockLabel(schedule.start_time),
    endTime: clockLabel(schedule.end_time),
    timeZone: schedule.time_zone,
    selectedDays: [...schedule.days_of_week],
    selectedBlocklistIds: schedule.blocklists.map((list) => list.blocklist_id),
    selectedDeviceIds: schedule.devices.map((device) => device.device_id),
    isActive: schedule.is_active,
    strictMode: schedule.strict_mode ?? false,
  };
}

import { isUnresolvedCategory } from "./categories";

export const JEV_CONFIDENCE_THRESHOLD = 0.8;

export const JEV_CATEGORY_CRITERIA = {
  Development: "IDEs, coding, GitHub, docs for building software",
  Productivity: "Notes, docs, mail, calendars, Notion",
  Communication: "Chat, meetings, Slack, Zoom, Discord",
  Entertainment: "Music and streaming apps that are not video sites",
  Gaming: "Games and game launchers, such as Steam, Roblox, and Epic",
  Video: "YouTube, Netflix, Twitch, video players",
  Social: "Feeds, forums, Instagram, Reddit, LinkedIn",
  Utilities: "Finder, file managers, system tools",
  Email: "Dedicated mail clients",
} as const;

export type JevChoiceCategory = keyof typeof JEV_CATEGORY_CRITERIA;

export interface JevCategoryCacheEntry {
  category: string;
  confidence: number;
  model: string;
  at: string;
}

export type JevCategoryCache = Record<string, JevCategoryCacheEntry>;

export function acceptedJevCategory(choice: string, confidence: number): string | null {
  if (confidence < JEV_CONFIDENCE_THRESHOLD) return null;
  if (!(choice in JEV_CATEGORY_CRITERIA)) return null;
  return choice;
}

export function overlayCategory(
  category: string,
  key: string,
  cache?: JevCategoryCache | null,
): string {
  if (!isUnresolvedCategory(category) || !cache) return category;
  const hit = cache[key];
  if (!hit) return category;
  return acceptedJevCategory(hit.category, hit.confidence) ?? category;
}

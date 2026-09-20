import { websiteHostname } from "./browser";
import { isUnresolvedCategory } from "./categories";

export const JEV_MODEL = "jev-latest";
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_CONFIDENCE_THRESHOLD = 0.8;

export const JEV_CATEGORY_CRITERIA = {
  Development: "IDEs, coding, GitHub, docs for building software",
  Productivity: "Notes, docs, mail, calendars, Notion",
  Communication: "Chat, meetings, Slack, Zoom, Discord",
  Entertainment: "Games, music, streaming apps that are not video sites",
  Video: "YouTube, Netflix, Twitch, video players",
  Social: "Feeds, forums, Instagram, Reddit, LinkedIn",
  Utilities: "Finder, file managers, system tools",
  Email: "Dedicated mail clients",
} as const;

export type JevChoiceCategory = keyof typeof JEV_CATEGORY_CRITERIA;

export interface JevClassificationState {
  appName: string;
  bundleID: string;
  host: string;
}

export interface JevCategoryCacheEntry {
  category: string;
  confidence: number;
  model: string;
  at: string;
}

export type JevCategoryCache = Record<string, JevCategoryCacheEntry>;

export function jevClassificationState(input: {
  appName: string;
  bundleID: string;
  url: string;
}): JevClassificationState {
  return {
    appName: input.appName,
    bundleID: input.bundleID,
    host: websiteHostname(input.url),
  };
}

export function jevCategoryRequest(state: JevClassificationState) {
  return {
    model: JEV_MODEL,
    state,
    questions: {
      category: {
        type: "choice" as const,
        instructions: "Pick the screen-time category for this app or website.",
        criteria: JEV_CATEGORY_CRITERIA,
      },
    },
  };
}

export function parseJevChoice(payload: unknown): { choice: string; confidence: number; model: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const answers = body.answers;
  if (!answers || typeof answers !== "object") return null;
  const category = (answers as Record<string, unknown>).category;
  if (!category || typeof category !== "object") return null;
  const answer = category as Record<string, unknown>;
  if (typeof answer.choice !== "string" || typeof answer.confidence !== "number") return null;
  if (!Number.isFinite(answer.confidence)) return null;
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    model: typeof body.model === "string" ? body.model : JEV_MODEL,
  };
}

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

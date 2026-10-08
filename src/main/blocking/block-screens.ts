import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

export const BUILTIN_HEADER = "You are free.";
export const BUILTIN_DETAIL = "Do what matters.";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_NAME = /^[\w-]+\.(png|jpg|jpeg|gif|webp)$/;

export interface BlockScreenFields {
  imageFile: string;
  header: string;
  detail: string;
}

export interface BlockScreenView extends BlockScreenFields {
  imageUrl: string;
}

export interface BlockScreenStore {
  default: BlockScreenFields;
  sessions: Record<string, BlockScreenFields>;
}

export function emptyBlockScreen(): BlockScreenFields {
  return { imageFile: "", header: "", detail: "" };
}

const PRESET_FILE = /^preset:([\w-]+\.(?:png|jpg|jpeg|gif|webp))$/;

export function acceptedImageFile(value: string) {
  if (IMAGE_NAME.test(value) || PRESET_FILE.test(value)) return value;
  return "";
}

export function blockScreenPresetDir() {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, "block-screen-presets") : "",
    join(process.cwd(), "resources/block-screen-presets"),
  ].filter(Boolean);
  return candidates.find((path) => existsSync(join(path, "manifest.json"))) ?? "";
}

export function blockScreenPresetPath(name: string) {
  if (!IMAGE_NAME.test(name)) return "";
  const root = blockScreenPresetDir();
  if (!root) return "";
  const path = join(root, name);
  return existsSync(path) ? path : "";
}

export function listBlockScreenPresets() {
  const root = blockScreenPresetDir();
  if (!root) return [];
  try {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { file?: unknown; label?: unknown }[];
    if (!Array.isArray(manifest)) return [];
    return manifest.flatMap((item) => {
      const file = typeof item.file === "string" ? item.file : "";
      const label = typeof item.label === "string" ? item.label : "";
      if (!file || !label || !blockScreenPresetPath(file)) return [];
      return [{ file, label }];
    });
  } catch {
    return [];
  }
}

function cleanScreen(value: unknown): BlockScreenFields {
  const row = value && typeof value === "object" ? value as Partial<BlockScreenFields> : {};
  const imageFile = typeof row.imageFile === "string" ? acceptedImageFile(row.imageFile) : "";
  return {
    imageFile,
    header: typeof row.header === "string" ? row.header : "",
    detail: typeof row.detail === "string" ? row.detail : "",
  };
}

function storePath(dir: string) {
  return join(dir, "screens.json");
}

export function loadBlockScreens(dir: string): BlockScreenStore {
  try {
    const parsed = JSON.parse(readFileSync(storePath(dir), "utf8")) as Partial<BlockScreenStore>;
    const sessions: Record<string, BlockScreenFields> = {};
    if (parsed.sessions && typeof parsed.sessions === "object") {
      for (const [id, fields] of Object.entries(parsed.sessions)) {
        if (id) sessions[id] = cleanScreen(fields);
      }
    }
    return { default: cleanScreen(parsed.default), sessions };
  } catch {
    return { default: emptyBlockScreen(), sessions: {} };
  }
}

function writeStore(dir: string, store: BlockScreenStore) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(storePath(dir), JSON.stringify(store, null, 2), "utf8");
}

function referencedImages(store: BlockScreenStore) {
  const names = new Set<string>();
  if (store.default.imageFile) names.add(store.default.imageFile);
  for (const screen of Object.values(store.sessions)) {
    if (screen.imageFile) names.add(screen.imageFile);
  }
  return names;
}

function releaseImage(dir: string, previous: string, store: BlockScreenStore) {
  if (!IMAGE_NAME.test(previous) || referencedImages(store).has(previous)) return;
  const path = join(dir, "images", previous);
  if (existsSync(path)) rmSync(path);
}

/** Session fields win, then Settings, then the built-in page. */
export function resolveBlockScreen(scheduleId: string, store: BlockScreenStore): BlockScreenFields {
  const session = store.sessions[scheduleId] ?? emptyBlockScreen();
  return {
    imageFile: session.imageFile || store.default.imageFile,
    header: session.header.trim() || store.default.header.trim() || BUILTIN_HEADER,
    detail: session.detail.trim() || store.default.detail.trim() || BUILTIN_DETAIL,
  };
}

export function blockScreenImagePath(dir: string, imageFile: string) {
  const preset = PRESET_FILE.exec(imageFile);
  if (preset) return blockScreenPresetPath(preset[1]);
  if (!IMAGE_NAME.test(imageFile)) return "";
  const path = join(dir, "images", imageFile);
  return existsSync(path) ? path : "";
}

export function presentBlockScreen(baseUrl: string, fields: BlockScreenFields): BlockScreenView {
  const imageFile = acceptedImageFile(fields.imageFile);
  const preset = PRESET_FILE.exec(imageFile);
  const imageUrl = !imageFile || !baseUrl
    ? ""
    : preset
      ? `${baseUrl}presets/${encodeURIComponent(preset[1])}`
      : `${baseUrl}media/${encodeURIComponent(imageFile)}`;
  return {
    imageFile,
    header: fields.header,
    detail: fields.detail,
    imageUrl,
  };
}

export function importBlockScreenImage(dir: string, sourcePath: string) {
  const ext = extname(sourcePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
    throw new Error("Use a PNG, JPEG, GIF, or WebP image.");
  }
  const size = statSync(sourcePath).size;
  if (size > MAX_IMAGE_BYTES) throw new Error("Image must be 12 MB or smaller.");
  const imageFile = `${randomUUID()}${ext}`;
  mkdirSync(join(dir, "images"), { recursive: true });
  copyFileSync(sourcePath, join(dir, "images", imageFile));
  return imageFile;
}

export function saveDefaultBlockScreen(dir: string, fields: BlockScreenFields) {
  const store = loadBlockScreens(dir);
  const previous = store.default.imageFile;
  store.default = cleanScreen(fields);
  writeStore(dir, store);
  releaseImage(dir, previous, store);
  return store;
}

export function saveSessionBlockScreen(dir: string, scheduleId: string, fields: BlockScreenFields) {
  const store = loadBlockScreens(dir);
  const previous = store.sessions[scheduleId]?.imageFile ?? "";
  const next = cleanScreen(fields);
  if (!next.imageFile && !next.header.trim() && !next.detail.trim()) delete store.sessions[scheduleId];
  else store.sessions[scheduleId] = next;
  writeStore(dir, store);
  releaseImage(dir, previous, store);
  return store;
}

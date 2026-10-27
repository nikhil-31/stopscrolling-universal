import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import koffi from "koffi";

export const NATIVE_WIDGET_GROUP = "group.com.stopscrolling.desktop";
export const NATIVE_WIDGET_FILE = "widget.json";
export const TREND_WIDGET_FILE = "trend.json";
export const NATIVE_WIDGET_RELOAD_INTERVAL_MS = 60_000;
const TOP_APP_LIMIT = 5;
const TREND_APP_LIMIT = 4;

export interface NativeWidgetApp {
  key: string;
  label: string;
  seconds: number;
}

/** Summary already produced for the desktop panel. */
export interface NativeWidgetSummary {
  productiveSeconds: number;
  neutralSeconds: number;
  distractingSeconds: number;
  unratedSeconds: number;
  top: NativeWidgetApp[];
}

export interface TrendWidgetDevice {
  key: string;
  seconds: number;
  colorIndex: number;
}

export interface TrendWidgetBucket {
  id: string;
  label: string;
  seconds: number;
  devices: TrendWidgetDevice[];
}

/** Insights activity already summed by the desktop app. */
export interface TrendWidgetSummary {
  period: string;
  title: string;
  buckets: TrendWidgetBucket[];
  top: NativeWidgetApp[];
}

export function nativeWidgetDirectory(home = homedir()) {
  return join(home, "Library", "Group Containers", NATIVE_WIDGET_GROUP);
}

/** The widget extension can always read its own container, even when the app group is unavailable. */
export function widgetExtensionSupportDirectory(home = homedir()) {
  return join(
    home,
    "Library",
    "Containers",
    "com.stopscrolling.desktop.widget",
    "Data",
    "Library",
    "Application Support",
  );
}

interface PublishOptions {
  directory?: string;
  /** Writes both the app group and the widget container under this home. */
  home?: string;
  now?: number;
  reload?: () => void;
  /** When false, a write inside the quiet period does not schedule a later reload. */
  schedule?: boolean;
}

let lastReloadAt = Number.NEGATIVE_INFINITY;
let lastBody = "";
let lastTrendBody = "";
let pendingReload: ReturnType<typeof setTimeout> | null = null;
let loadedReload: (() => void) | null = null;

export function resetNativeWidgetPublisherForTests() {
  lastReloadAt = Number.NEGATIVE_INFINITY;
  lastBody = "";
  lastTrendBody = "";
  loadedReload = null;
  if (pendingReload) clearTimeout(pendingReload);
  pendingReload = null;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function nativeWidgetPayload(summary: NativeWidgetSummary) {
  return {
    productiveSeconds: finite(summary.productiveSeconds),
    neutralSeconds: finite(summary.neutralSeconds),
    distractingSeconds: finite(summary.distractingSeconds),
    unratedSeconds: finite(summary.unratedSeconds),
    top: summary.top.slice(0, TOP_APP_LIMIT).map((app) => ({
      key: app.key,
      label: app.label,
      seconds: finite(app.seconds),
    })),
  };
}

export function trendWidgetPayload(summary: TrendWidgetSummary) {
  return {
    period: summary.period,
    title: summary.title,
    buckets: summary.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      seconds: finite(bucket.seconds),
      devices: bucket.devices.map((device) => ({
        key: device.key,
        seconds: finite(device.seconds),
        colorIndex: device.colorIndex,
      })),
    })),
    top: summary.top.slice(0, TREND_APP_LIMIT).map((app) => ({
      key: app.key,
      label: app.label,
      seconds: finite(app.seconds),
    })),
  };
}

function reloadLibraryPath() {
  const execDir = dirname(process.execPath);
  const candidates = [
    join(execDir, "../Frameworks/StopScrollingWidgetReload.dylib"),
    join(process.resourcesPath ?? "", "native/macos/StopScrollingWidgetReload.dylib"),
    join(process.cwd(), "release-native/macos/StopScrollingWidgetReload.dylib"),
    join(process.cwd(), "native/macos/.derivedData/widget-pack/StopScrollingWidgetReload.dylib"),
  ];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}

function reloadFromHost() {
  if (loadedReload) {
    loadedReload();
    return;
  }
  const library = reloadLibraryPath();
  if (!library) return;
  const reload = koffi.load(library).func("void stopscrolling_reload_time_widget()") as () => void;
  loadedReload = reload;
  reload();
}

function requestReload(now: number, reload: () => void, schedule: boolean) {
  const dueIn = lastReloadAt + NATIVE_WIDGET_RELOAD_INTERVAL_MS - now;
  if (dueIn <= 0) {
    lastReloadAt = now;
    reload();
    return;
  }
  if (!schedule || pendingReload) return;
  pendingReload = setTimeout(() => {
    pendingReload = null;
    lastReloadAt = Date.now();
    try {
      reload();
    } catch {
      // The widget timeline still refreshes on its own.
    }
  }, dueIn);
  pendingReload.unref?.();
}

function writeWidgetFile(directory: string, fileName: string, body: string) {
  mkdirSync(directory, { recursive: true });
  const destination = join(directory, fileName);
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, body);
  renameSync(temporary, destination);
}

function publishWidgetFile(
  fileName: string,
  body: string,
  previous: string,
  remember: (body: string) => void,
  options: PublishOptions,
) {
  const home = options.home ?? homedir();
  const directory = options.directory ?? nativeWidgetDirectory(home);
  const destination = join(directory, fileName);
  const mirror = options.directory ? null : widgetExtensionSupportDirectory(home);
  const changed = body !== previous
    || !existsSync(destination)
    || (mirror !== null && !existsSync(join(mirror, fileName)));
  if (!changed) return;
  writeWidgetFile(directory, fileName, body);
  if (!options.directory) {
    try {
      writeWidgetFile(widgetExtensionSupportDirectory(home), fileName, body);
    } catch {
      // The extension container appears after the widget is added.
    }
  }
  remember(body);
  const reload = options.reload ?? reloadFromHost;
  try {
    requestReload(options.now ?? Date.now(), reload, options.schedule !== false);
  } catch {
    // A failed reload leaves the file in place for the next timeline refresh.
  }
}

/** Writes `widget.json` and asks WidgetKit to reload at most once a minute. */
export function publishNativeWidget(summary: NativeWidgetSummary, options: PublishOptions = {}) {
  const body = JSON.stringify(nativeWidgetPayload(summary));
  publishWidgetFile(NATIVE_WIDGET_FILE, body, lastBody, (next) => {
    lastBody = next;
  }, options);
}

/** Writes `trend.json` beside the time summary and shares the same reload limit. */
export function publishTrendWidget(summary: TrendWidgetSummary, options: PublishOptions = {}) {
  const body = JSON.stringify(trendWidgetPayload(summary));
  publishWidgetFile(TREND_WIDGET_FILE, body, lastTrendBody, (next) => {
    lastTrendBody = next;
  }, options);
}

import { BrowserWindow, screen } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DesktopWidgetState } from "@shared/desktop-widget";
import { IPC } from "@shared/ipc";
import { desktopWidgetBoundsPath } from "./paths";

const WIDGET_WIDTH = 300;
const WIDGET_HEIGHT = 392;
const MARGIN = 16;

let widgetWindow: BrowserWindow | null = null;
let pendingState: DesktopWidgetState | null = null;
/** Last state the panel received; an identical state is not sent again. */
let sentKey = "";
/** Set while the panel is hidden on purpose; state waits in `pendingState` until it shows. */
let hiddenByUser = false;

function widgetFile() {
  if (process.env.ELECTRON_RENDERER_URL) return `${process.env.ELECTRON_RENDERER_URL}/widget.html`;
  return join(__dirname, "../renderer/widget.html");
}

function preloadFile() {
  return join(__dirname, "../preload/index.js");
}

function liveWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  widgetWindow = null;
  return null;
}

function savedOrigin(): { x: number; y: number } | null {
  try {
    if (!existsSync(desktopWidgetBoundsPath())) return null;
    const parsed = JSON.parse(readFileSync(desktopWidgetBoundsPath(), "utf8")) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function rememberOrigin(x: number, y: number) {
  const path = desktopWidgetBoundsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ x, y }), "utf8");
}

function initialPosition() {
  const saved = savedOrigin();
  if (saved) {
    const display = screen.getAllDisplays().find((item) => {
      const bounds = item.bounds;
      return saved.x >= bounds.x && saved.y >= bounds.y && saved.x < bounds.x + bounds.width && saved.y < bounds.y + bounds.height;
    });
    if (display) {
      const area = display.workArea;
      return {
        x: Math.round(Math.min(Math.max(saved.x, area.x), area.x + area.width - WIDGET_WIDTH)),
        y: Math.round(Math.min(Math.max(saved.y, area.y), area.y + area.height - WIDGET_HEIGHT)),
      };
    }
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return {
    x: Math.round(area.x + area.width - WIDGET_WIDTH - MARGIN),
    y: Math.round(area.y + MARGIN),
  };
}

function flushPending(win: BrowserWindow) {
  if (!pendingState || hiddenByUser || win.isDestroyed() || win.webContents.isLoading()) return;
  const state = pendingState;
  pendingState = null;
  const key = JSON.stringify(state);
  if (key === sentKey) return;
  sentKey = key;
  win.webContents.send(IPC.desktopWidgetState, state);
}

/** Small panel of the snapshot the main window is already showing. */
export function showDesktopWidget() {
  hiddenByUser = false;
  const existing = liveWindow();
  if (existing) {
    existing.showInactive();
    flushPending(existing);
    return existing;
  }

  const position = initialPosition();
  const win = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    frame: false,
    show: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "Desktop widget",
    acceptFirstMouse: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  widgetWindow = win;
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("moved", () => {
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    rememberOrigin(x, y);
  });
  win.on("closed", () => {
    if (widgetWindow === win) widgetWindow = null;
  });
  win.webContents.on("did-finish-load", () => {
    sentKey = "";
    flushPending(win);
  });
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.showInactive();
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(widgetFile());
  else void win.loadFile(widgetFile());
  return win;
}

export function hideDesktopWidget() {
  const win = liveWindow();
  if (!win) return;
  hiddenByUser = true;
  win.hide();
}

export function sendDesktopWidgetState(state: DesktopWidgetState) {
  const win = liveWindow();
  if (!win) return;
  pendingState = state;
  flushPending(win);
}

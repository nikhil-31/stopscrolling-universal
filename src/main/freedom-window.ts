import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import { freedomContent, freedomPageUrl } from "./blocking/freedom-page";

const BACKGROUND = "#3e648c";

let freedomWindow: BrowserWindow | null = null;

function freedomFile() {
  if (process.env.ELECTRON_RENDERER_URL) return `${process.env.ELECTRON_RENDERER_URL}/freedom.html`;
  return join(__dirname, "../renderer/freedom.html");
}

function placeOnActiveDisplay(win: BrowserWindow) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds(display.bounds);
}

async function loadFreedom(win: BrowserWindow) {
  const shown = freedomContent();
  const image = shown.imagePath ? `${await freedomPageUrl()}media` : "";
  const query = { header: shown.header, detail: shown.detail, image };
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(`${process.env.ELECTRON_RENDERER_URL}/freedom.html`);
    url.search = new URLSearchParams(query).toString();
    await win.loadURL(url.toString());
    return;
  }
  await win.loadFile(freedomFile(), { query });
}

/** Full-screen message shown when a block fires, instead of focusing the main window. */
export function showFreedomScreen() {
  const existing = freedomWindow && !freedomWindow.isDestroyed() ? freedomWindow : null;
  if (existing) {
    placeOnActiveDisplay(existing);
    void loadFreedom(existing).then(() => {
      if (existing.isDestroyed()) return;
      existing.show();
      existing.focus();
    });
    return existing;
  }

  const win = new BrowserWindow({
    frame: false,
    show: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: BACKGROUND,
    title: "You are free",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  freedomWindow = win;
  win.on("closed", () => {
    if (freedomWindow === win) freedomWindow = null;
  });
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    placeOnActiveDisplay(win);
    win.show();
    win.focus();
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void loadFreedom(win);
  return win;
}

export function hideFreedomScreen() {
  if (!freedomWindow || freedomWindow.isDestroyed()) {
    freedomWindow = null;
    return;
  }
  freedomWindow.close();
  freedomWindow = null;
}

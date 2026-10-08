import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

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

/** Full-screen message shown when a block fires, instead of focusing the main window. */
export function showFreedomScreen() {
  if (freedomWindow && !freedomWindow.isDestroyed()) {
    placeOnActiveDisplay(freedomWindow);
    freedomWindow.show();
    freedomWindow.focus();
    return freedomWindow;
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
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(freedomFile());
  else void win.loadFile(freedomFile());
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

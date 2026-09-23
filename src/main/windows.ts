import { BrowserWindow, nativeTheme, shell } from "electron";
import { join } from "node:path";
import { AppController } from "./app-controller";
import { logRendererProcessGone, logRendererUnresponsive } from "./crash-reporting";
import { shouldHideWindowOnClose } from "./lifecycle";

function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? "#121212" : "#f4f5fb";
}

function integratedWindowChrome(): Electron.BrowserWindowConstructorOptions {
  return {
    backgroundColor: windowBackground(),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 22 },
        }
      : {}),
  };
}

function bindFullscreenChrome(win: BrowserWindow) {
  const mark = (fullscreen: boolean) => {
    void win.webContents
      .executeJavaScript(`document.documentElement.dataset.fullscreen=${fullscreen ? '"true"' : '""'}`)
      .catch(() => undefined);
  };
  win.on("enter-full-screen", () => mark(true));
  win.on("leave-full-screen", () => mark(false));
}

function watchRendererProcess(win: BrowserWindow) {
  win.webContents.on("render-process-gone", (_event, details) => {
    logRendererProcessGone(details);
  });
  win.webContents.on("unresponsive", () => {
    logRendererUnresponsive();
  });
}

export function preloadPath() {
  return join(__dirname, "../preload/index.js");
}

export function rendererFile(name: "index" | "settings") {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${name === "index" ? "" : "settings.html"}`;
  }
  return join(__dirname, `../renderer/${name}.html`);
}

export function createMainWindow(controller: AppController) {
  const win = new BrowserWindow({
    ...integratedWindowChrome(),
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Stop Scrolling",
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  watchRendererProcess(win);
  bindFullscreenChrome(win);
  win.on("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (!shouldHideWindowOnClose()) return;
    event.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(rendererFile("index"));
  } else {
    void win.loadFile(rendererFile("index"));
  }
  controller.addWindow(win);
  return win;
}

export function showMainWindow(controller: AppController) {
  const existing = BrowserWindow.getAllWindows().find((window) => window.getTitle() !== "Settings");
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  return createMainWindow(controller);
}

export function createSettingsWindow(controller: AppController, parent?: BrowserWindow) {
  const existing = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Settings");
  if (existing) {
    existing.focus();
    return existing;
  }
  const win = new BrowserWindow({
    ...integratedWindowChrome(),
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 400,
    title: "Settings",
    parent,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  watchRendererProcess(win);
  bindFullscreenChrome(win);
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(rendererFile("settings"));
  } else {
    void win.loadFile(rendererFile("settings"));
  }
  controller.addWindow(win);
  return win;
}

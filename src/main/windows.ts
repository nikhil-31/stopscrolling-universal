import { BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { AppController } from "./app-controller";

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
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "stopscrolling",
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.on("ready-to-show", () => win.show());
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

export function createSettingsWindow(controller: AppController, parent?: BrowserWindow) {
  const existing = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Settings");
  if (existing) {
    existing.focus();
    return existing;
  }
  const win = new BrowserWindow({
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
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(rendererFile("settings"));
  } else {
    void win.loadFile(rendererFile("settings"));
  }
  controller.addWindow(win);
  return win;
}

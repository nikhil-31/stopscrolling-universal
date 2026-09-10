import { app, BrowserWindow } from "electron";
import { AppController } from "./app-controller";
import { installApplicationMenu, installIpc } from "./ipc";
import { installTray, refreshTray } from "./tray";
import { createMainWindow } from "./windows";

app.setName("Stop Scrolling");

const controller = new AppController();
let quitting = false;

app.whenReady().then(async () => {
  installIpc(controller);
  installApplicationMenu(controller);
  await controller.boot();
  const win = createMainWindow(controller);
  installTray(controller);
  refreshTray(controller);

  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  app.on("activate", () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) existing.show();
    else createMainWindow(controller);
  });
});

app.on("before-quit", () => {
  quitting = true;
  void controller.tracker.shutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    quitting = true;
    void controller.tracker.shutdown().then(() => app.quit());
  }
});

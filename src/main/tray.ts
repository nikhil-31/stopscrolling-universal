import { existsSync } from "node:fs";
import { join } from "node:path";
import { Menu, Tray, nativeImage } from "electron";
import type { AppController } from "./app-controller";
import { quitApp } from "./lifecycle";
import { showMainWindow } from "./windows";

let tray: Tray | null = null;

export function trayIconPath() {
  return [
    join(__dirname, "../../resources/trayTemplate.png"),
    join(process.resourcesPath, "trayTemplate.png"),
  ].find((path) => existsSync(path));
}

function statusBarIcon() {
  const path = trayIconPath();
  const image = path ? nativeImage.createFromPath(path) : nativeImage.createEmpty();
  image.setTemplateImage(true);
  return image;
}

export function installTray(controller: AppController) {
  if (tray) return tray;
  tray = new Tray(statusBarIcon());
  tray.setIgnoreDoubleClickEvents(true);
  tray.on("click", () => showMainWindow(controller));
  refreshTray(controller);
  return tray;
}

export function refreshTray(controller: AppController) {
  if (!tray) return;
  const tracking = controller.tracker.isTracking;
  tray.setToolTip(tracking ? "Stop Scrolling: recording screen time" : "Stop Scrolling: screen time paused");
  const context = controller.tracker.currentContext;
  const email = controller.auth.user?.email;
  const pending = controller.tracker.pendingUploadCount;
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: tracking ? "Recording screen time" : "Screen time paused", enabled: false },
    ...(context ? [{ label: context.title || context.appName, enabled: false }] : []),
    ...(email ? [{ label: email, enabled: false }] : []),
    { type: "separator" },
    {
      label: tracking ? "Stop tracking" : "Start tracking",
      click: () => {
        void (tracking ? controller.tracker.stopTracking() : controller.tracker.startTracking());
      },
    },
    {
      label: "Open Stop Scrolling",
      click: () => showMainWindow(controller),
    },
    ...(pending > 0 || controller.auth.user
      ? [
          {
            label: pending > 0 ? `Sync All Unsynced (${pending} pending)` : "Sync All Unsynced",
            click: () => {
              void controller.tracker.flushOutbox();
            },
          },
        ]
      : []),
    controller.auth.user
      ? {
          label: "Sign out",
          click: () => controller.logout(),
        }
      : {
          label: "Sign in",
          click: () => {
            showMainWindow(controller);
            controller.selectNavigation("account");
          },
        },
    { type: "separator" },
    {
      label: "Quit Stop Scrolling",
      enabled: !controller.hasHelperConfirmedStrictMode(),
      click: () => {
        void quitApp(
          () => controller.shutdown(),
          controller.hasHelperConfirmedStrictMode(),
          () => controller.helper.requestRelaunchAfterForcedExit(),
        );
      },
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

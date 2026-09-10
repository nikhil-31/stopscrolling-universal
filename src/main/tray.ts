import { Menu, Tray, app, nativeImage, BrowserWindow } from "electron";
import type { AppController } from "./app-controller";
import { createMainWindow } from "./windows";

function showMain(controller: AppController) {
  const existing = BrowserWindow.getAllWindows().find((window) => window.getTitle() !== "Settings");
  if (existing) {
    existing.show();
    existing.focus();
    return existing;
  }
  return createMainWindow(controller);
}

let tray: Tray | null = null;

function icon() {
  const image = nativeImage.createEmpty();
  return image;
}

export function installTray(controller: AppController) {
  if (tray) return tray;
  tray = new Tray(nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsSAAASLQEsoQAAAEhJREFUOI3N0rENwCAQxNDvf0lGYYSswQgpKSlS8J+UKLIfvLPsvb0AImI2s4jYq+oKwMyjqr6Z+QRgZqeq3wG89w9mfgI4AXgDeABw+gC2syMZc7QfWQAAAABJRU5ErkJggg==",
  ));
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
      label: "Open Today",
      click: () => {
        const win = showMain(controller);
        win.show();
        controller.selectNavigation("today");
      },
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
            showMain(controller).show();
            controller.selectNavigation("account");
          },
        },
    { type: "separator" },
    {
      label: "Quit Stop Scrolling",
      click: () => {
        void controller.tracker.shutdown().then(() => app.quit());
      },
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

void icon;

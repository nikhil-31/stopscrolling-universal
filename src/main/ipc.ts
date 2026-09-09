import { BrowserWindow, Menu, app, ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc";
import type { AppSettings, InsightsPeriod, LeaderboardPeriod, NavigationItem, TodayTab, InsightsTab } from "@shared/types";
import type { AppController } from "./app-controller";
import { refreshTray } from "./tray";
import { createSettingsWindow } from "./windows";

export function installIpc(controller: AppController) {
  const broadcast = () => {
    controller.broadcast();
    refreshTray(controller);
  };

  ipcMain.handle(IPC.getState, () => controller.snapshot());
  ipcMain.on(IPC.navigate, (_event, item: NavigationItem) => controller.selectNavigation(item));
  ipcMain.on(IPC.setTodayDay, (_event, iso: string) => {
    controller.todayDay = new Date(iso);
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.setCalendarAnchor, (_event, iso: string) => {
    controller.calendarAnchor = new Date(iso);
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.setCalendarMonth, (_event, iso: string) => {
    controller.calendarMonth = new Date(iso);
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.setInsightsPeriod, (_event, period: InsightsPeriod) => {
    controller.insightsPeriod = period;
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.setInsightsAnchor, (_event, iso: string) => {
    controller.insightsAnchor = new Date(iso);
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.setTodayTab, (_event, tab: TodayTab) => {
    controller.todayTab = tab;
    broadcast();
  });
  ipcMain.on(IPC.setInsightsTab, (_event, tab: InsightsTab) => {
    controller.insightsTab = tab;
    broadcast();
  });
  ipcMain.on(IPC.setLeaderboardPeriod, (_event, period: LeaderboardPeriod) => {
    controller.leaderboard.period = period;
    void controller.refreshLeaderboard();
  });
  ipcMain.on(IPC.toggleTracking, () => {
    void (controller.tracker.isTracking ? controller.tracker.stopTracking() : controller.tracker.startTracking());
  });
  ipcMain.on(IPC.refresh, () => {
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.syncAll, () => {
    void controller.tracker.flushOutbox();
  });
  ipcMain.on(IPC.pullFromServer, () => {
    void controller.tracker.pullFromServer().then(() => controller.refreshVisibleRange());
  });
  ipcMain.on(IPC.requestAccessibility, () => {
    controller.tracker.requestAccessibility();
    broadcast();
  });
  ipcMain.on(IPC.openSettings, (event) => {
    createSettingsWindow(controller, BrowserWindow.fromWebContents(event.sender) ?? undefined);
  });
  ipcMain.on(IPC.openPath, (_event, path: string) => {
    void shell.showItemInFolder(path);
  });
  ipcMain.on(IPC.selectInspector, (_event, payload) => {
    controller.selectInspector(payload);
  });
  ipcMain.on(IPC.commandPalette, (_event, open: boolean) => {
    controller.commandPaletteOpen = open;
    broadcast();
  });
  ipcMain.on(IPC.updateSettings, (_event, patch: Partial<AppSettings>) => {
    const start = patch.startScreenTimeOnLaunch;
    controller.updateSettings(patch);
    if (start === true) void controller.tracker.startTracking();
    if (start === false) void controller.tracker.stopTracking();
  });
  ipcMain.on(IPC.setDeviceVisible, (_event, payload: { key: string; visible: boolean }) => {
    controller.setDeviceVisible(payload.key, payload.visible);
  });
  ipcMain.on(IPC.authSetForm, (_event, patch: Partial<AppController["auth"]>) => {
    controller.auth = { ...controller.auth, ...patch };
    broadcast();
  });
  ipcMain.on(IPC.authLogin, () => {
    void controller.login();
  });
  ipcMain.on(IPC.authRegister, () => {
    void controller.register();
  });
  ipcMain.on(IPC.authVerifyMfa, () => {
    void controller.verifyMfa();
  });
  ipcMain.on(IPC.authResendOtp, () => {
    void controller.resendOtp();
  });
  ipcMain.on(IPC.authLogout, () => controller.logout());
  ipcMain.on(IPC.friendsSend, (_event, email: string) => {
    void controller.api.sendFriendRequest(email).then(() => controller.refreshLeaderboard());
  });
  ipcMain.on(IPC.friendsAccept, (_event, id: number) => {
    void controller.api.acceptFriendRequest(id).then(() => controller.refreshLeaderboard());
  });
  ipcMain.on(IPC.friendsDecline, (_event, id: number) => {
    void controller.api.declineFriendRequest(id).then(() => controller.refreshLeaderboard());
  });
  ipcMain.on(IPC.friendsRemove, (_event, id: number) => {
    void controller.api.removeFriend(id).then(() => controller.refreshLeaderboard());
  });
  ipcMain.on(IPC.googleConnect, () => {
    void controller.google.connect(controller.settings.googleClientId).then(() => {
      controller.settings.showGoogleCalendarEvents = true;
      void controller.refreshVisibleRange();
    }).catch((error: Error) => {
      controller.statusMessage = error.message;
      controller.broadcast();
    });
  });
  ipcMain.on(IPC.googleDisconnect, () => {
    controller.google.disconnect();
    controller.updateSettings({ showGoogleCalendarEvents: false });
  });
}

export function installApplicationMenu(controller: AppController) {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" as const },
            { type: "separator" as const },
            {
              label: "Settings…",
              accelerator: "CmdOrCtrl+,",
              click: () => createSettingsWindow(controller),
            },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        }]
      : []),
    {
      label: "View",
      submenu: [
        { label: "Today", accelerator: "CmdOrCtrl+1", click: () => controller.selectNavigation("today") },
        { label: "Calendar", accelerator: "CmdOrCtrl+2", click: () => controller.selectNavigation("calendar") },
        { label: "Insights", accelerator: "CmdOrCtrl+3", click: () => controller.selectNavigation("insights") },
        { label: "Account", accelerator: "CmdOrCtrl+4", click: () => controller.selectNavigation("account") },
        { label: "Leaderboard", accelerator: "CmdOrCtrl+6", click: () => controller.selectNavigation("leaderboard") },
        { type: "separator" },
        {
          label: "Command Palette…",
          accelerator: "CmdOrCtrl+K",
          click: () => {
            controller.commandPaletteOpen = true;
            controller.broadcast();
          },
        },
        ...(isMac ? [] : [{
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => createSettingsWindow(controller),
        }]),
      ],
    },
    {
      label: "Screen Time",
      submenu: [
        {
          label: "Toggle Tracking",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            void (controller.tracker.isTracking ? controller.tracker.stopTracking() : controller.tracker.startTracking());
          },
        },
        {
          label: "Refresh Timeline",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            void controller.refreshVisibleRange();
          },
        },
        {
          label: "Sync All Unsynced",
          click: () => {
            void controller.tracker.flushOutbox();
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

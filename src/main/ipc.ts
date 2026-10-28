import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from "electron";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "@shared/ipc";
import type { AppSettings, CalendarProvider, InsightsPeriod, LeaderboardPeriod, NavigationItem, TodayPeriod, TodayTab, BlocklistWritePayload, BlocklistUpdatePayload, BlockingScheduleUpdatePayload, BlockingScheduleWritePayload } from "@shared/types";
import type { CalendarView } from "@shared/calendar-workspace";
import type { TempusPeriod } from "@shared/tempus";
import type { AppController } from "./app-controller";
import { refreshTray } from "./tray";
import { createSettingsWindow, showMainWindow } from "./windows";
import { recordRendererCrash } from "./crash-reporting";
import { quitApp } from "./lifecycle";

function assertTrustedRenderer(event: { senderFrame: Electron.WebFrameMain | null }) {
  if (!event.senderFrame) throw new Error("Untrusted renderer IPC caller");
  const url = new URL(event.senderFrame.url);
  if (url.protocol === "file:") {
    const rendererRoot = resolve(__dirname, "../renderer");
    const callerPath = resolve(dirname(fileURLToPath(url)), ".");
    if (callerPath === rendererRoot || callerPath.startsWith(`${rendererRoot}${sep}`)) return;
    throw new Error("Untrusted renderer IPC caller");
  }
  const developmentOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : null;
  if (!developmentOrigin || url.origin !== developmentOrigin) {
    throw new Error("Untrusted renderer IPC caller");
  }
}

/** For fire-and-forget channels, where throwing would surface as an uncaught main-process error. */
function fromTrustedRenderer(event: { senderFrame: Electron.WebFrameMain | null }) {
  try {
    assertTrustedRenderer(event);
    return true;
  } catch {
    return false;
  }
}

export function installIpc(controller: AppController) {
  const broadcast = () => {
    controller.broadcast();
    refreshTray(controller);
  };

  ipcMain.handle(IPC.getState, (event) => controller.stateFor(event.sender.id));
  ipcMain.on(IPC.reportCrash, (event, payload: unknown) => {
    try {
      assertTrustedRenderer(event);
    } catch {
      return;
    }
    recordRendererCrash(payload);
  });
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
    controller.setTodayTab(tab);
  });
  ipcMain.on(IPC.setTodayPeriod, (_event, period: TodayPeriod) => {
    controller.setTodayPeriod(period);
  });
  ipcMain.on(IPC.setTodayDevice, (_event, key: string) => {
    controller.setTodayDevice(key);
  });
  ipcMain.on(IPC.setInsightsTab, (_event, tab: string) => {
    controller.setInsightsTab(tab);
  });
  ipcMain.on(IPC.setInsightsDevice, (_event, key: string) => {
    controller.setInsightsDevice(key);
  });
  ipcMain.on(IPC.setLeaderboardPeriod, (_event, period: LeaderboardPeriod) => {
    controller.leaderboard.period = period;
    void controller.refreshLeaderboard();
  });
  ipcMain.on(IPC.toggleTracking, () => {
    void (controller.tracker.isTracking ? controller.tracker.stopTracking() : controller.tracker.startTracking());
  });
  ipcMain.on(IPC.startTracking, () => {
    void controller.tracker.startTracking();
  });
  ipcMain.on(IPC.stopTracking, () => {
    void controller.tracker.stopTracking();
  });
  ipcMain.on(IPC.addTimerBonus, (_event, seconds?: number) => {
    controller.addTimerBonus(seconds);
  });
  ipcMain.on(IPC.refresh, () => {
    void controller.refreshVisibleRange();
  });
  ipcMain.on(IPC.syncAll, () => {
    void controller.syncPending();
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
  ipcMain.on(IPC.openUrl, (_event, url: unknown) => {
    // Session URLs come from tracked browser tabs; only hand web pages to the browser.
    if (typeof url !== "string") return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") void shell.openExternal(parsed.toString());
    } catch {
      // Not a URL.
    }
  });
  ipcMain.on(IPC.selectInspector, (_event, payload) => {
    controller.selectInspector(payload);
  });
  ipcMain.on(IPC.commandPalette, (_event, open: boolean) => {
    controller.commandPaletteOpen = open;
    broadcast();
  });
  ipcMain.on(IPC.setTimeZone, (_event, timeZone: string) => {
    void controller.setTimeZone(typeof timeZone === "string" ? timeZone : "");
  });
  ipcMain.on(IPC.updateSettings, (_event, patch: Partial<AppSettings>) => {
    controller.updateSettings(patch);
    if (patch.desktopWidgetVisible !== undefined) refreshTray(controller);
  });
  ipcMain.on(IPC.agentReviewAll, () => {
    controller.reviewAgent();
  });
  ipcMain.on(IPC.agentOverride, (_event, payload: { key?: unknown; verdict?: unknown }) => {
    if (typeof payload?.key === "string" && typeof payload.verdict === "string") {
      controller.overrideAgentVerdict(payload.key, payload.verdict);
    }
  });
  ipcMain.on(IPC.previewBlockScreen, () => {
    controller.previewBlockScreen();
  });
  ipcMain.on(IPC.previewDistractionPopup, (_event, payload: { label?: unknown; site?: unknown }) => {
    if (typeof payload?.label !== "string") return;
    controller.previewDistractionPopup(payload.label, typeof payload.site === "string" ? payload.site : "");
  });
  ipcMain.handle(IPC.getDesktopWidgetState, () => controller.desktopWidgetState());
  ipcMain.on(IPC.openToday, () => {
    showMainWindow(controller);
    controller.selectNavigation("today");
  });
  ipcMain.on(IPC.hideDesktopWidget, () => {
    controller.updateSettings({ desktopWidgetVisible: false });
    refreshTray(controller);
  });
  ipcMain.on(IPC.setDeviceVisible, (_event, payload: { key: string; visible: boolean }) => {
    controller.setDeviceVisible(payload.key, payload.visible);
  });
  ipcMain.on(IPC.setDeviceNickname, (_event, payload: { deviceID: string; nickname: string }) => {
    void controller.setDeviceNickname(payload.deviceID, payload.nickname);
  });
  ipcMain.on(IPC.deleteDevice, (_event, deviceID: string) => {
    void controller.deleteDevice(deviceID);
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
  ipcMain.on(IPC.createBlocklist, (_event, input: BlocklistWritePayload) => {
    void controller.createBlocklist(input);
  });
  ipcMain.on(IPC.updateBlocklist, (_event, input: BlocklistUpdatePayload) => {
    void controller.updateBlocklist(input);
  });
  ipcMain.handle(IPC.createBlockingSchedule, (event, input: BlockingScheduleWritePayload) => {
    assertTrustedRenderer(event);
    return controller.createBlockingSchedule(input);
  });
  ipcMain.handle(IPC.getBlockScreens, (event) => {
    assertTrustedRenderer(event);
    return controller.blockScreens();
  });
  ipcMain.handle(IPC.listBlockScreenPresets, (event) => {
    assertTrustedRenderer(event);
    return controller.blockScreenPresets();
  });
  ipcMain.handle(IPC.chooseBlockScreenImage, async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      title: "Choose a blocked screen image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    try {
      return await controller.chooseBlockScreenImage(result.filePaths[0]);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not use that image." };
    }
  });
  ipcMain.handle(IPC.saveDefaultBlockScreen, (event, fields: { imageFile?: string; header?: string; detail?: string }) => {
    assertTrustedRenderer(event);
    return controller.saveDefaultScreen({
      imageFile: typeof fields?.imageFile === "string" ? fields.imageFile : "",
      header: typeof fields?.header === "string" ? fields.header : "",
      detail: typeof fields?.detail === "string" ? fields.detail : "",
    });
  });
  ipcMain.handle(IPC.getNudgeReminder, (event) => {
    assertTrustedRenderer(event);
    return controller.nudgeReminder();
  });
  ipcMain.handle(IPC.saveNudgeReminder, (event, fields: { imageFile?: string; detail?: string }) => {
    assertTrustedRenderer(event);
    return controller.saveReminder({
      imageFile: typeof fields?.imageFile === "string" ? fields.imageFile : "",
      detail: typeof fields?.detail === "string" ? fields.detail : "",
    });
  });
  ipcMain.handle(IPC.saveSessionBlockScreen, (event, input: { scheduleId?: string; imageFile?: string; header?: string; detail?: string }) => {
    assertTrustedRenderer(event);
    const scheduleId = typeof input?.scheduleId === "string" ? input.scheduleId : "";
    if (!scheduleId) return controller.blockScreens();
    return controller.saveSessionScreen(scheduleId, {
      imageFile: typeof input.imageFile === "string" ? input.imageFile : "",
      header: typeof input.header === "string" ? input.header : "",
      detail: typeof input.detail === "string" ? input.detail : "",
    });
  });
  ipcMain.on(IPC.updateBlockingSchedule, (_event, input: BlockingScheduleUpdatePayload) => {
    void controller.updateBlockingSchedule(input);
  });
  ipcMain.on(IPC.deleteBlockingSchedule, (_event, scheduleId: string) => {
    void controller.deleteBlockingSchedule(scheduleId);
  });
  ipcMain.handle(IPC.refreshBlockingStatus, (event) => {
    assertTrustedRenderer(event);
    return controller.refreshBlockingHelper(true);
  });
  ipcMain.handle(IPC.refreshBlockingInventory, (event) => {
    assertTrustedRenderer(event);
    return controller.refreshBlockingInventory();
  });
  ipcMain.handle(IPC.activateNativeBlocking, (event) => {
    assertTrustedRenderer(event);
    return controller.activateNativeBlocking();
  });
  ipcMain.handle(
    IPC.cancelNormalSession,
    (event, payload: { scheduleID: string; occurrenceID: string }) => {
      assertTrustedRenderer(event);
      return controller.cancelNormalSession(payload);
    },
  );
  ipcMain.handle(IPC.redeemBlockingBypass, (event, input) => {
    assertTrustedRenderer(event);
    return controller.redeemBlockingBypass(input);
  });
  ipcMain.handle(IPC.googleConnect, (event) => {
    assertTrustedRenderer(event);
    return controller.connectGoogleCalendar();
  });
  ipcMain.handle(IPC.googleDisconnect, (event, connectionId: number) => {
    assertTrustedRenderer(event);
    return controller.disconnectGoogleCalendar(Number(connectionId));
  });
  ipcMain.handle(IPC.appleCalendarRequestAccess, (event) => {
    assertTrustedRenderer(event);
    return controller.requestAppleCalendarAccess();
  });
  ipcMain.handle(IPC.refreshCalendarSources, (event) => {
    assertTrustedRenderer(event);
    return controller.calendars.refresh({ fromGoogle: true }).then(() => controller.refreshCalendarEvents());
  });
  ipcMain.handle(
    IPC.setCalendarSelected,
    (event, payload: { provider: CalendarProvider; id: string; selected: boolean }) => {
      assertTrustedRenderer(event);
      return controller.setCalendarSelected(payload);
    },
  );
  ipcMain.handle(IPC.tempusConversations, (event) => {
    assertTrustedRenderer(event);
    return controller.tempusConversations();
  });
  ipcMain.handle(IPC.tempusConversation, (event, id: string) => {
    assertTrustedRenderer(event);
    return controller.tempusConversation(String(id));
  });
  ipcMain.handle(IPC.tempusSend, (event, payload: { conversationId: string | null; content: string }) => {
    assertTrustedRenderer(event);
    return controller.tempusSend(payload.conversationId ? String(payload.conversationId) : null, String(payload.content));
  });
  ipcMain.handle(IPC.tempusPlan, (event, date?: string) => {
    assertTrustedRenderer(event);
    return controller.tempusPlan(typeof date === "string" ? date : undefined);
  });
  ipcMain.handle(IPC.tempusResolveAction, (event, payload: { id: string; decision: "confirm" | "reject" }) => {
    assertTrustedRenderer(event);
    return controller.tempusResolveAction(String(payload.id), payload.decision === "confirm" ? "confirm" : "reject");
  });
  ipcMain.handle(IPC.tempusDigests, (event, period: TempusPeriod) => {
    assertTrustedRenderer(event);
    return controller.tempusDigests(period === "weekly" ? "weekly" : "daily");
  });
  ipcMain.handle(IPC.tempusRequestDigest, (event, period: TempusPeriod) => {
    assertTrustedRenderer(event);
    return controller.tempusRequestDigest(period === "weekly" ? "weekly" : "daily");
  });
  ipcMain.on(IPC.linkRiot, (_event, riotId: string) => {
    void controller.gameSync.linkRiot(riotId);
  });
  ipcMain.on(IPC.disconnectRiot, () => {
    void controller.gameSync.disconnectRiot();
  });
  ipcMain.on(IPC.connectSteam, () => {
    void controller.gameSync.connectSteam();
  });
  ipcMain.on(IPC.disconnectSteam, () => {
    void controller.gameSync.disconnectSteam();
  });
  ipcMain.on(IPC.setCalendarView, (event, view: CalendarView) => {
    if (!fromTrustedRenderer(event)) return;
    controller.setCalendarView(view);
  });
  ipcMain.on(IPC.upsertCalendarLabel, (event, patch) => {
    if (!fromTrustedRenderer(event)) return;
    controller.upsertCalendarLabel(patch);
  });
  ipcMain.on(IPC.deleteCalendarLabel, (event, id: string) => {
    if (!fromTrustedRenderer(event)) return;
    controller.deleteCalendarLabel(id);
  });
  ipcMain.on(IPC.upsertCalendarTask, (event, patch) => {
    if (!fromTrustedRenderer(event)) return;
    controller.upsertCalendarTask(patch);
  });
  ipcMain.on(IPC.deleteCalendarTask, (event, id: string) => {
    if (!fromTrustedRenderer(event)) return;
    controller.deleteCalendarTask(id);
  });
  ipcMain.on(IPC.assignCalendarLabel, (event, patch) => {
    if (!fromTrustedRenderer(event)) return;
    controller.assignCalendarLabel(patch);
  });
  ipcMain.on(IPC.clearCalendarAssignment, (event, id: string) => {
    if (!fromTrustedRenderer(event)) return;
    controller.clearCalendarAssignment(id);
  });
  ipcMain.on(IPC.reviewCalendarBlock, (event, payload) => {
    if (!fromTrustedRenderer(event)) return;
    controller.reviewCalendarBlock(payload);
  });
  ipcMain.on(IPC.skipCalendarBlock, (event, blockId: string) => {
    if (!fromTrustedRenderer(event)) return;
    controller.skipCalendarBlock(blockId);
  });
  ipcMain.on(IPC.dismissCalendarReview, (event, unlabeledIds: string[]) => {
    if (!fromTrustedRenderer(event)) return;
    controller.dismissCalendarReview(unlabeledIds);
  });
  ipcMain.on(IPC.assignCalendarLabelToApp, (event, payload: { appKey: string; labelId: string }) => {
    if (!fromTrustedRenderer(event)) return;
    controller.assignCalendarLabelToApp(payload);
  });
  ipcMain.on(IPC.approveTimesheetEntries, (event, blocks) => {
    if (!fromTrustedRenderer(event)) return;
    controller.approveTimesheetEntries(blocks);
  });
  ipcMain.on(IPC.unapproveTimesheetEntry, (event, blockId: string) => {
    if (!fromTrustedRenderer(event)) return;
    controller.unapproveTimesheetEntry(blockId);
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
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            {
              label: "Quit Stop Scrolling",
              accelerator: "CmdOrCtrl+Q",
              enabled: !controller.hasHelperConfirmedStrictMode(),
              click: () => {
                void quitApp(
                  () => controller.shutdown(),
                  controller.hasHelperConfirmedStrictMode(),
                  () => controller.helper.requestRelaunchAfterForcedExit(),
                );
              },
            },
          ],
        }]
      : [{
          label: "File",
          submenu: [{
            label: "Quit Stop Scrolling",
            accelerator: "Alt+F4",
            enabled: !controller.hasHelperConfirmedStrictMode(),
            click: () => {
              void quitApp(
                () => controller.shutdown(),
                controller.hasHelperConfirmedStrictMode(),
                () => controller.helper.requestRelaunchAfterForcedExit(),
              );
            },
          }],
        }]),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Today", accelerator: "CmdOrCtrl+1", click: () => controller.selectNavigation("today") },
        { label: "Calendar", accelerator: "CmdOrCtrl+2", click: () => controller.selectNavigation("calendar") },
        { label: "Insights", accelerator: "CmdOrCtrl+3", click: () => controller.selectNavigation("insights") },
        { label: "Trend", accelerator: "CmdOrCtrl+6", click: () => controller.selectNavigation("trend") },
        { label: "Blocking", accelerator: "CmdOrCtrl+4", click: () => controller.selectNavigation("blocking") },
        { label: "Account", accelerator: "CmdOrCtrl+5", click: () => controller.selectNavigation("account") },
        { label: "Agent", accelerator: "CmdOrCtrl+7", click: () => controller.selectNavigation("agent") },
        { label: "Tempus", accelerator: "CmdOrCtrl+8", click: () => controller.selectNavigation("tempus") },
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
            void controller.syncPending();
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

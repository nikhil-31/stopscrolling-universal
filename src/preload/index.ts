import { contextBridge, ipcRenderer } from "electron";
import type { RendererCrashReport } from "@shared/crash";
import { IPC } from "@shared/ipc";
import type { AppSnapshot, AppStateMessage, InspectorSelection } from "@shared/snapshot";
import type {
  CalendarAssignment,
  CalendarLabel,
  CalendarTask,
  CalendarView,
} from "@shared/calendar-workspace";
import type {
  TempusAction,
  TempusConversation,
  TempusConversationDetail,
  TempusDigest,
  TempusPeriod,
  TempusResult,
  TempusTurn,
} from "@shared/tempus";
import type {
  AppSettings,
  InsightsPeriod,
  InsightsTab,
  LeaderboardPeriod,
  NavigationItem,
  ScreenTimeSessionBlock,
  TodayTab,
  TodayPeriod,
} from "@shared/types";

const api = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<AppSnapshot>,
  onState: (handler: (state: AppStateMessage) => void) => {
    const listener = (_event: unknown, state: AppStateMessage) => handler(state);
    ipcRenderer.on(IPC.state, listener);
    return () => ipcRenderer.removeListener(IPC.state, listener);
  },
  navigate: (item: NavigationItem) => ipcRenderer.send(IPC.navigate, item),
  setTodayDay: (iso: string) => ipcRenderer.send(IPC.setTodayDay, iso),
  setCalendarAnchor: (iso: string) => ipcRenderer.send(IPC.setCalendarAnchor, iso),
  setCalendarMonth: (iso: string) => ipcRenderer.send(IPC.setCalendarMonth, iso),
  setInsightsPeriod: (period: InsightsPeriod) => ipcRenderer.send(IPC.setInsightsPeriod, period),
  setInsightsAnchor: (iso: string) => ipcRenderer.send(IPC.setInsightsAnchor, iso),
  setTodayTab: (tab: TodayTab) => ipcRenderer.send(IPC.setTodayTab, tab),
  setTodayPeriod: (period: TodayPeriod) => ipcRenderer.send(IPC.setTodayPeriod, period),
  setTodayDevice: (key: string) => ipcRenderer.send(IPC.setTodayDevice, key),
  setInsightsTab: (tab: InsightsTab) => ipcRenderer.send(IPC.setInsightsTab, tab),
  setInsightsDevice: (key: string) => ipcRenderer.send(IPC.setInsightsDevice, key),
  setLeaderboardPeriod: (period: LeaderboardPeriod) => ipcRenderer.send(IPC.setLeaderboardPeriod, period),
  toggleTracking: () => ipcRenderer.send(IPC.toggleTracking),
  startTracking: () => ipcRenderer.send(IPC.startTracking),
  stopTracking: () => ipcRenderer.send(IPC.stopTracking),
  addTimerBonus: (seconds?: number) => ipcRenderer.send(IPC.addTimerBonus, seconds),
  refresh: () => ipcRenderer.send(IPC.refresh),
  syncAll: () => ipcRenderer.send(IPC.syncAll),
  pullFromServer: () => ipcRenderer.send(IPC.pullFromServer),
  requestAccessibility: () => ipcRenderer.send(IPC.requestAccessibility),
  openSettings: () => ipcRenderer.send(IPC.openSettings),
  openPath: (path: string) => ipcRenderer.send(IPC.openPath, path),
  openUrl: (url: string) => ipcRenderer.send(IPC.openUrl, url),
  selectInspector: (payload: InspectorSelection) => ipcRenderer.send(IPC.selectInspector, payload),
  setCommandPalette: (open: boolean) => ipcRenderer.send(IPC.commandPalette, open),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.send(IPC.updateSettings, patch),
  setTimeZone: (timeZone: string) => ipcRenderer.send(IPC.setTimeZone, timeZone),
  agentReviewAll: () => ipcRenderer.send(IPC.agentReviewAll),
  agentOverride: (key: string, verdict: string) => ipcRenderer.send(IPC.agentOverride, { key, verdict }),
  previewBlockScreen: () => ipcRenderer.send(IPC.previewBlockScreen),
  previewDistractionPopup: (label: string, site: string) => ipcRenderer.send(IPC.previewDistractionPopup, { label, site }),
  setDeviceVisible: (key: string, visible: boolean) => ipcRenderer.send(IPC.setDeviceVisible, { key, visible }),
  setDeviceNickname: (deviceID: string, nickname: string) => ipcRenderer.send(IPC.setDeviceNickname, { deviceID, nickname }),
  deleteDevice: (deviceID: string) => ipcRenderer.send(IPC.deleteDevice, deviceID),
  authSetForm: (patch: Partial<AppSnapshot["auth"]>) => ipcRenderer.send(IPC.authSetForm, patch),
  authLogin: () => ipcRenderer.send(IPC.authLogin),
  authRegister: () => ipcRenderer.send(IPC.authRegister),
  authVerifyMfa: () => ipcRenderer.send(IPC.authVerifyMfa),
  authResendOtp: () => ipcRenderer.send(IPC.authResendOtp),
  authLogout: () => ipcRenderer.send(IPC.authLogout),
  friendsSend: (email: string) => ipcRenderer.send(IPC.friendsSend, email),
  friendsAccept: (id: number) => ipcRenderer.send(IPC.friendsAccept, id),
  friendsDecline: (id: number) => ipcRenderer.send(IPC.friendsDecline, id),
  friendsRemove: (id: number) => ipcRenderer.send(IPC.friendsRemove, id),
  createBlocklist: (input: import("@shared/types").BlocklistWritePayload) => ipcRenderer.send(IPC.createBlocklist, input),
  updateBlocklist: (input: import("@shared/types").BlocklistUpdatePayload) => ipcRenderer.send(IPC.updateBlocklist, input),
  createBlockingSchedule: (input: import("@shared/types").BlockingScheduleWritePayload) =>
    ipcRenderer.invoke(IPC.createBlockingSchedule, input) as Promise<{ ok: true; scheduleId: string } | { ok: false; message: string }>,
  listBlockScreenPresets: () => ipcRenderer.invoke(IPC.listBlockScreenPresets) as Promise<
    Array<{ id: string; label: string; imageUrl: string }>
  >,
  getBlockScreens: () => ipcRenderer.invoke(IPC.getBlockScreens) as Promise<{
    default: { imageFile: string; header: string; detail: string; imageUrl: string };
    sessions: Record<string, { imageFile: string; header: string; detail: string; imageUrl: string }>;
  }>,
  chooseBlockScreenImage: () => ipcRenderer.invoke(IPC.chooseBlockScreenImage) as Promise<
    { imageFile: string; header: string; detail: string; imageUrl: string } | { error: string } | null
  >,
  saveDefaultBlockScreen: (fields: { imageFile: string; header: string; detail: string }) =>
    ipcRenderer.invoke(IPC.saveDefaultBlockScreen, fields),
  getNudgeReminder: () => ipcRenderer.invoke(IPC.getNudgeReminder) as Promise<{
    imageFile: string;
    header: string;
    detail: string;
    imageUrl: string;
  }>,
  saveNudgeReminder: (fields: { imageFile: string; detail: string }) =>
    ipcRenderer.invoke(IPC.saveNudgeReminder, fields) as Promise<{
      imageFile: string;
      header: string;
      detail: string;
      imageUrl: string;
    }>,
  saveSessionBlockScreen: (input: { scheduleId: string; imageFile: string; header: string; detail: string }) =>
    ipcRenderer.invoke(IPC.saveSessionBlockScreen, input),
  updateBlockingSchedule: (input: import("@shared/types").BlockingScheduleUpdatePayload) => ipcRenderer.send(IPC.updateBlockingSchedule, input),
  deleteBlockingSchedule: (scheduleId: string) => ipcRenderer.send(IPC.deleteBlockingSchedule, scheduleId),
  refreshBlockingStatus: () => ipcRenderer.invoke(IPC.refreshBlockingStatus),
  refreshBlockingInventory: () => ipcRenderer.invoke(IPC.refreshBlockingInventory),
  activateNativeBlocking: () => ipcRenderer.invoke(IPC.activateNativeBlocking),
  cancelNormalSession: (payload: { scheduleID: string; occurrenceID: string }) =>
    ipcRenderer.invoke(IPC.cancelNormalSession, payload),
  redeemBlockingBypass: (input: import("@shared/types").BypassRedeemInput) =>
    ipcRenderer.invoke(IPC.redeemBlockingBypass, input),
  googleConnect: () => ipcRenderer.invoke(IPC.googleConnect) as Promise<void>,
  googleDisconnect: (connectionId: number) => ipcRenderer.invoke(IPC.googleDisconnect, connectionId) as Promise<void>,
  appleCalendarRequestAccess: () =>
    ipcRenderer.invoke(IPC.appleCalendarRequestAccess) as Promise<import("@shared/types").AppleCalendarAccess>,
  refreshCalendarSources: () => ipcRenderer.invoke(IPC.refreshCalendarSources) as Promise<void>,
  setCalendarSelected: (payload: { provider: import("@shared/types").CalendarProvider; id: string; selected: boolean }) =>
    ipcRenderer.invoke(IPC.setCalendarSelected, payload) as Promise<void>,
  linkRiot: (riotId: string) => ipcRenderer.send(IPC.linkRiot, riotId),
  disconnectRiot: () => ipcRenderer.send(IPC.disconnectRiot),
  connectSteam: () => ipcRenderer.send(IPC.connectSteam),
  disconnectSteam: () => ipcRenderer.send(IPC.disconnectSteam),
  setCalendarView: (view: CalendarView) => ipcRenderer.send(IPC.setCalendarView, view),
  upsertCalendarLabel: (patch: Partial<CalendarLabel> & Pick<CalendarLabel, "name">) => ipcRenderer.send(IPC.upsertCalendarLabel, patch),
  deleteCalendarLabel: (id: string) => ipcRenderer.send(IPC.deleteCalendarLabel, id),
  upsertCalendarTask: (patch: Partial<CalendarTask> & Pick<CalendarTask, "title" | "start" | "end">) => ipcRenderer.send(IPC.upsertCalendarTask, patch),
  deleteCalendarTask: (id: string) => ipcRenderer.send(IPC.deleteCalendarTask, id),
  assignCalendarLabel: (patch: Partial<CalendarAssignment> & Pick<CalendarAssignment, "start" | "end" | "labelId">) => ipcRenderer.send(IPC.assignCalendarLabel, patch),
  clearCalendarAssignment: (id: string) => ipcRenderer.send(IPC.clearCalendarAssignment, id),
  reviewCalendarBlock: (payload: { block: Pick<ScreenTimeSessionBlock, "id" | "start" | "end">; labelId: string }) => ipcRenderer.send(IPC.reviewCalendarBlock, payload),
  skipCalendarBlock: (blockId: string) => ipcRenderer.send(IPC.skipCalendarBlock, blockId),
  dismissCalendarReview: (unlabeledIds: string[]) => ipcRenderer.send(IPC.dismissCalendarReview, unlabeledIds),
  assignCalendarLabelToApp: (payload: { appKey: string; labelId: string }) => ipcRenderer.send(IPC.assignCalendarLabelToApp, payload),
  approveTimesheetEntries: (blocks: Array<Pick<ScreenTimeSessionBlock, "id" | "start" | "end" | "category">>) => ipcRenderer.send(IPC.approveTimesheetEntries, blocks),
  unapproveTimesheetEntry: (blockId: string) => ipcRenderer.send(IPC.unapproveTimesheetEntry, blockId),
  reportCrash: (report: RendererCrashReport) => ipcRenderer.send(IPC.reportCrash, report),
  getDesktopWidgetState: () => ipcRenderer.invoke(IPC.getDesktopWidgetState) as Promise<import("@shared/desktop-widget").DesktopWidgetState>,
  onDesktopWidgetState: (handler: (state: import("@shared/desktop-widget").DesktopWidgetState) => void) => {
    const listener = (_event: unknown, state: import("@shared/desktop-widget").DesktopWidgetState) => handler(state);
    ipcRenderer.on(IPC.desktopWidgetState, listener);
    return () => ipcRenderer.removeListener(IPC.desktopWidgetState, listener);
  },
  openToday: () => ipcRenderer.send(IPC.openToday),
  hideDesktopWidget: () => ipcRenderer.send(IPC.hideDesktopWidget),
  tempusConversations: () => ipcRenderer.invoke(IPC.tempusConversations) as Promise<TempusResult<TempusConversation[]>>,
  tempusConversation: (id: string) => ipcRenderer.invoke(IPC.tempusConversation, id) as Promise<TempusResult<TempusConversationDetail>>,
  tempusSend: (conversationId: string | null, content: string) =>
    ipcRenderer.invoke(IPC.tempusSend, { conversationId, content }) as Promise<TempusResult<TempusTurn>>,
  tempusPlan: (date?: string) => ipcRenderer.invoke(IPC.tempusPlan, date) as Promise<TempusResult<TempusTurn>>,
  tempusResolveAction: (id: string, decision: "confirm" | "reject") =>
    ipcRenderer.invoke(IPC.tempusResolveAction, { id, decision }) as Promise<TempusResult<TempusAction>>,
  tempusDigests: (period: TempusPeriod) => ipcRenderer.invoke(IPC.tempusDigests, period) as Promise<TempusResult<TempusDigest[]>>,
  tempusRequestDigest: (period: TempusPeriod) =>
    ipcRenderer.invoke(IPC.tempusRequestDigest, period) as Promise<TempusResult<TempusDigest>>,
};

export type StopScrollingDesktop = typeof api;

contextBridge.exposeInMainWorld("stopscrolling", api);

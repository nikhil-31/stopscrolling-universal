import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc";
import type { AppSnapshot, InspectorSelection } from "@shared/snapshot";
import type {
  CalendarAssignment,
  CalendarLabel,
  CalendarTask,
  CalendarView,
} from "@shared/calendar-workspace";
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
  onState: (handler: (state: AppSnapshot) => void) => {
    const listener = (_event: unknown, state: AppSnapshot) => handler(state);
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
  selectInspector: (payload: InspectorSelection) => ipcRenderer.send(IPC.selectInspector, payload),
  setCommandPalette: (open: boolean) => ipcRenderer.send(IPC.commandPalette, open),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.send(IPC.updateSettings, patch),
  setTypesafeApiKey: (key: string) => ipcRenderer.send(IPC.setTypesafeApiKey, key),
  setDeviceVisible: (key: string, visible: boolean) => ipcRenderer.send(IPC.setDeviceVisible, { key, visible }),
  setDeviceNickname: (deviceID: string, nickname: string) => ipcRenderer.send(IPC.setDeviceNickname, { deviceID, nickname }),
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
  createBlockingSchedule: (input: import("@shared/types").BlockingScheduleWritePayload) => ipcRenderer.send(IPC.createBlockingSchedule, input),
  updateBlockingSchedule: (input: import("@shared/types").BlockingScheduleUpdatePayload) => ipcRenderer.send(IPC.updateBlockingSchedule, input),
  deleteBlockingSchedule: (scheduleId: string) => ipcRenderer.send(IPC.deleteBlockingSchedule, scheduleId),
  refreshBlockingStatus: () => ipcRenderer.invoke(IPC.refreshBlockingStatus),
  refreshBlockingInventory: () => ipcRenderer.invoke(IPC.refreshBlockingInventory),
  activateNativeBlocking: () => ipcRenderer.invoke(IPC.activateNativeBlocking),
  cancelNormalSession: (payload: { scheduleID: string; occurrenceID: string }) =>
    ipcRenderer.invoke(IPC.cancelNormalSession, payload),
  redeemBlockingBypass: (input: import("@shared/types").BypassRedeemInput) =>
    ipcRenderer.invoke(IPC.redeemBlockingBypass, input),
  googleConnect: () => ipcRenderer.send(IPC.googleConnect),
  googleDisconnect: () => ipcRenderer.send(IPC.googleDisconnect),
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
};

export type StopScrollingDesktop = typeof api;

contextBridge.exposeInMainWorld("stopscrolling", api);

import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc";
import type { AppSnapshot } from "@shared/snapshot";
import type {
  AppSettings,
  InsightsPeriod,
  InsightsTab,
  LeaderboardPeriod,
  NavigationItem,
  ScreenTimeSessionBlock,
  ScreenTimeTimelineSegment,
  TodayTab,
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
  setInsightsTab: (tab: InsightsTab) => ipcRenderer.send(IPC.setInsightsTab, tab),
  setLeaderboardPeriod: (period: LeaderboardPeriod) => ipcRenderer.send(IPC.setLeaderboardPeriod, period),
  toggleTracking: () => ipcRenderer.send(IPC.toggleTracking),
  refresh: () => ipcRenderer.send(IPC.refresh),
  syncAll: () => ipcRenderer.send(IPC.syncAll),
  pullFromServer: () => ipcRenderer.send(IPC.pullFromServer),
  requestAccessibility: () => ipcRenderer.send(IPC.requestAccessibility),
  openSettings: () => ipcRenderer.send(IPC.openSettings),
  openPath: (path: string) => ipcRenderer.send(IPC.openPath, path),
  selectInspector: (payload: {
    kind: "none" | "segment" | "block";
    segment?: ScreenTimeTimelineSegment | null;
    block?: ScreenTimeSessionBlock | null;
  }) => ipcRenderer.send(IPC.selectInspector, payload),
  setCommandPalette: (open: boolean) => ipcRenderer.send(IPC.commandPalette, open),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.send(IPC.updateSettings, patch),
  setDeviceVisible: (key: string, visible: boolean) => ipcRenderer.send(IPC.setDeviceVisible, { key, visible }),
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
  googleConnect: () => ipcRenderer.send(IPC.googleConnect),
  googleDisconnect: () => ipcRenderer.send(IPC.googleDisconnect),
};

export type StopScrollingDesktop = typeof api;

contextBridge.exposeInMainWorld("stopscrolling", api);

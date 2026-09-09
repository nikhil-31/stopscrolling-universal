/// <reference types="vite/client" />

interface StopScrollingDesktop {
  getState: () => Promise<import("@shared/snapshot").AppSnapshot>;
  onState: (handler: (state: import("@shared/snapshot").AppSnapshot) => void) => () => void;
  navigate: (item: import("@shared/types").NavigationItem) => void;
  setTodayDay: (iso: string) => void;
  setCalendarAnchor: (iso: string) => void;
  setCalendarMonth: (iso: string) => void;
  setInsightsPeriod: (period: import("@shared/types").InsightsPeriod) => void;
  setInsightsAnchor: (iso: string) => void;
  setTodayTab: (tab: import("@shared/types").TodayTab) => void;
  setInsightsTab: (tab: import("@shared/types").InsightsTab) => void;
  setLeaderboardPeriod: (period: import("@shared/types").LeaderboardPeriod) => void;
  toggleTracking: () => void;
  refresh: () => void;
  syncAll: () => void;
  pullFromServer: () => void;
  requestAccessibility: () => void;
  openSettings: () => void;
  openPath: (path: string) => void;
  selectInspector: (payload: {
    kind: "none" | "segment" | "block";
    segment?: import("@shared/types").ScreenTimeTimelineSegment | null;
    block?: import("@shared/types").ScreenTimeSessionBlock | null;
  }) => void;
  setCommandPalette: (open: boolean) => void;
  updateSettings: (patch: Partial<import("@shared/types").AppSettings>) => void;
  setDeviceVisible: (key: string, visible: boolean) => void;
  authSetForm: (patch: Partial<import("@shared/snapshot").AppSnapshot["auth"]>) => void;
  authLogin: () => void;
  authRegister: () => void;
  authVerifyMfa: () => void;
  authResendOtp: () => void;
  authLogout: () => void;
  friendsSend: (email: string) => void;
  friendsAccept: (id: number) => void;
  friendsDecline: (id: number) => void;
  friendsRemove: (id: number) => void;
  googleConnect: () => void;
  googleDisconnect: () => void;
}

declare global {
  interface Window {
    stopscrolling: StopScrollingDesktop;
  }
}

export {};

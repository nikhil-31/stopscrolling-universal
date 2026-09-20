import type { CalendarDayStats, CalendarView, CalendarWorkspace } from "./calendar-workspace";
import type {
  AppSettings,
  AuthenticatedUser,
  AuthFormMode,
  CalendarOverlayEvent,
  DeviceListEntry,
  ForegroundContext,
  FriendRequest,
  FriendUser,
  InsightsPeriod,
  InsightsTab,
  LeaderboardEntry,
  LeaderboardPeriod,
  MFAPendingResponse,
  NavigationItem,
  ScreenTimeSessionBlock,
  ScreenTimeSnapshot,
  ScreenTimeDeviceTimeline,
  ScreenTimeTimelineSegment,
  ThemePreference,
  TodayPeriod,
  TodayTab,
  TrackingCapabilities,
  Blocklist,
  BlockingSchedule,
  BlockingCapabilities,
  BlockingEnforcementStatus,
  BlockingHostSetup,
  BlockingPolicyOccurrence,
  InstalledApplication,
} from "./types";

export interface InspectorState {
  kind: "none" | "segment" | "block" | "schedule";
  segment: ScreenTimeTimelineSegment | null;
  block: ScreenTimeSessionBlock | null;
  schedule: BlockingSchedule | null;
}

export interface InspectorSelection {
  kind: InspectorState["kind"];
  segment?: ScreenTimeTimelineSegment | null;
  block?: ScreenTimeSessionBlock | null;
  schedule?: BlockingSchedule | null;
}

export function emptyInspector(): InspectorState {
  return { kind: "none", segment: null, block: null, schedule: null };
}

export function inspectorFromSelection(payload: InspectorSelection): InspectorState {
  return {
    kind: payload.kind,
    segment: payload.kind === "segment" ? payload.segment ?? null : null,
    block: payload.kind === "block" ? payload.block ?? null : null,
    schedule: payload.kind === "schedule" ? payload.schedule ?? null : null,
  };
}

export interface AuthUiState {
  formMode: AuthFormMode;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  mfaCode: string;
  backupCode: string;
  useBackupCode: boolean;
  loading: boolean;
  statusMessage: string;
  user: AuthenticatedUser | null;
  mfaChallenge: MFAPendingResponse | null;
}

export interface LeaderboardUiState {
  period: LeaderboardPeriod;
  day: string;
  entries: LeaderboardEntry[];
  friends: FriendUser[];
  requests: FriendRequest[];
  statusMessage: string;
  loading: boolean;
}

export interface BlockingUiState {
  schedules: BlockingSchedule[];
  blocklists: Blocklist[];
  enforcement?: BlockingEnforcementStatus;
  installedApplications?: InstalledApplication[];
  activeOccurrence?: BlockingPolicyOccurrence | null;
  capabilities?: BlockingCapabilities;
  hostSetup?: BlockingHostSetup;
  statusMessage: string;
  loading: boolean;
}

export interface AppSnapshot {
  navigation: NavigationItem;
  statusMessage: string;
  appearance: ThemePreference;
  isTracking: boolean;
  currentContext: ForegroundContext | null;
  pendingUploadCount: number;
  isAuthenticated: boolean;
  auth: AuthUiState;
  settings: AppSettings;
  todayDay: string;
  todayTab: TodayTab;
  todayPeriod: TodayPeriod;
  todayDeviceKey: string;
  calendarAnchor: string;
  calendarMonth: string;
  calendarView: CalendarView;
  calendarWorkspace: CalendarWorkspace;
  calendarDayStats: CalendarDayStats;
  calendarReviewVisible: boolean;
  insightsPeriod: InsightsPeriod;
  insightsAnchor: string;
  insightsTab: InsightsTab;
  insightsDeviceKey: string;
  snapshot: ScreenTimeSnapshot;
  timelines: ScreenTimeDeviceTimeline[];
  loadingEntries: boolean;
  entriesUnavailableReason: string | null;
  devices: DeviceListEntry[];
  hiddenDeviceKeys: string[];
  inspector: InspectorState;
  capabilities: TrackingCapabilities;
  calendarEvents: CalendarOverlayEvent[];
  googleCalendarConnected: boolean;
  googleCalendarStatus: string;
  logs: {
    network: string;
    observability: string;
  };
  leaderboard: LeaderboardUiState;
  blocking: BlockingUiState;
  commandPaletteOpen: boolean;
}

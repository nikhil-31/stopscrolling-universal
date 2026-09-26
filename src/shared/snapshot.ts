import type { CalendarDayStats, CalendarView, CalendarWorkspace } from "./calendar-workspace";
import type { TimesheetSummaries } from "./timesheet";
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
  timesheetSummaries: TimesheetSummaries;
  calendarDayStats: CalendarDayStats;
  calendarReviewVisible: boolean;
  typesafeApiKeyConfigured: boolean;
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
  /** Bumps whenever any of `HEAVY_SNAPSHOT_KEYS` is rebuilt in the main process. */
  dataVersion?: number;
}

export const HEAVY_SNAPSHOT_KEYS = ["snapshot", "timelines", "calendarDayStats", "devices"] as const;
type HeavySnapshotKey = (typeof HEAVY_SNAPSHOT_KEYS)[number];

/** A state update whose heavy fields are unchanged from `dataVersion`. */
export type AppStatePatch = Omit<AppSnapshot, HeavySnapshotKey> & { reuseData: true; dataVersion: number };
export type AppStateMessage = AppSnapshot | AppStatePatch;

export function isStatePatch(message: AppStateMessage): message is AppStatePatch {
  return "reuseData" in message && message.reuseData === true;
}

export function toStatePatch(state: AppSnapshot): AppStatePatch {
  const patch: Record<string, unknown> = { ...state, reuseData: true, dataVersion: state.dataVersion ?? 0 };
  for (const key of HEAVY_SNAPSHOT_KEYS) delete patch[key];
  return patch as AppStatePatch;
}

/** Returns null when a patch cannot be applied and the full state must be refetched. */
export function applyStateMessage(previous: AppSnapshot | null, message: AppStateMessage): AppSnapshot | null {
  if (!isStatePatch(message)) return message;
  if (!previous || previous.dataVersion !== message.dataVersion) return null;
  const { reuseData: _reuseData, ...rest } = message;
  return {
    ...rest,
    snapshot: previous.snapshot,
    timelines: previous.timelines,
    calendarDayStats: previous.calendarDayStats,
    devices: previous.devices,
  };
}

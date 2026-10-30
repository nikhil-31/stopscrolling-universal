import { BrowserWindow, shell } from "electron";
import { hideDesktopWidget, sendDesktopWidgetState, showDesktopWidget } from "./desktop-widget-window";
import { publishNativeWidget, publishTrendWidget, type TrendWidgetSummary } from "./native-widget-store";
import { hideFreedomScreen, showFreedomScreen } from "./freedom-window";
import { DistractionNudge, foregroundBlocked, foregroundVerdict } from "./distraction-nudge";
import { hideNudgeCard, showNudgeCard } from "./nudge-window";
import { mergeEntries } from "./local-history";
import {
  blockScreenImagePath,
  importBlockScreenImage,
  listBlockScreenPresets,
  loadBlockScreens,
  presentBlockScreen,
  resolveBlockScreen,
  saveDefaultBlockScreen,
  saveNudgeReminder,
  saveSessionBlockScreen,
  type BlockScreenFields,
} from "./blocking/block-screens";
import { freedomPageUrl, setBlockScreenMediaRoot, setFreedomContent } from "./blocking/freedom-page";
import { readFocusedBrowserContext } from "./collectors/ax-browser";
import { isAccessibilityGranted, requestAccessibilityAccess } from "./collectors/macos-accessibility";
import type { ActivitySnapshot } from "./collectors/types";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizedEmail, signInError, signUpError } from "@shared/auth-validation";
import { looksLikeBrowser, websiteHostname } from "@shared/browser";
import {
  approveBlocks,
  assignLabel,
  assignLabelToApp,
  buildCalendarDayStats,
  collectDayBlocks,
  clearAssignment,
  isOngoingBlock,
  mondayMonthGridBounds,
  mondayWeekBounds,
  deleteLabel,
  deleteTask,
  reviewBlock,
  skipBlock,
  shouldShowReviewBar,
  unapproveBlock,
  type CalendarAssignment,
  type CalendarDayStats,
  type CalendarLabel,
  type CalendarTask,
  type CalendarView,
  upsertLabel,
  upsertTask,
} from "@shared/calendar-workspace";
import { publishGameAssets } from "@shared/game-assets";
import { withMatchLines, withMatchSnapshot } from "@shared/game-match";
import { desktopWidgetSummary, type DesktopWidgetSummary } from "@shared/desktop-widget";
import { deviceColorIndex, deviceKey, resolvedDeviceName, withComputedOnline } from "@shared/device";
import { overlayCategory } from "@shared/jev";
import { acceptedProductivityVerdict, buildAgentView, classifiesFocus, ensureLiveEntryVisible, JEV_PRODUCTIVITY_CRITERIA, productivityInputsFromSegments, type ProductivityVerdict } from "@shared/jev-productivity";
import { IPC } from "@shared/ipc";
import { currentDevicePlatform, effectiveTimeZone as resolveTimeZone, toDateInput } from "@shared/platform";
import { TIMER_BONUS_STEP_SECONDS, usesTodayWindow } from "@shared/timer";
import {
  blocksNeedingSummaries,
  buildTimesheetRows,
  timesheetEntryPayload,
  type TimesheetSummaries,
} from "@shared/timesheet";
import type { AppSnapshot, AppStatePatch, AuthUiState, BlockingUiState, InspectorSelection, LeaderboardUiState } from "@shared/snapshot";
import { emptyInspector, inspectorFromSelection, toStatePatch } from "@shared/snapshot";
import {
  ALL_DEVICES,
  ALL_INSIGHTS_DEVICES,
  endOfMonth,
  entriesToTimelines,
  filterEntriesForInsights,
  filterTimelinesForInsights,
  filterVisibleTimelines,
  normalizeInsightsDeviceKey,
  normalizeInsightsTab,
  normalizeTodayTab,
  appBreakdownKey,
  bucketsFromDailyTotals,
  mergePeriodSummaries,
  formatPeriod,
  periodBounds,
  rankedAppsBySeconds,
  serverPeriodBuckets,
  snapshotFromEntries,
  snapshotFromRange,
  startOfMonth,
  todayPeriodBounds,
  trackedSecondsByDay,
  trendComparisonWindow,
  trendComparisonsFromDailyTotals,
} from "@shared/timeline";
import type { TrendComparisons } from "@shared/timeline";
import type {
  AppSettings,
  CalendarOverlayEvent,
  CalendarProvider,
  DeviceListEntry,
  DeviceRow,
  DistractionResponse,
  InsightsPeriod,
  InsightsTab,
  NavigationItem,
  PeriodSummaryResponse,
  ScreenTimeSessionBlock,
  ScreenTimeTimelineSegment,
  TodayPeriod,
  TodayTab,
  BlocklistWritePayload,
  BlocklistUpdatePayload,
  BlockingScheduleUpdatePayload,
  BlockingScheduleWritePayload,
  BlockingPolicyResponse,
  BypassRedeemInput,
} from "@shared/types";
import { APIError, isMfa, StopScrollingAPI } from "./api-client";
import type { TempusPeriod, TempusResult } from "@shared/tempus";
import { BlockingHelperBridge } from "./blocking/bridge";
import { LocalEnforcer } from "./blocking/local-enforcer";
import { loadCalendarWorkspace, saveCalendarWorkspace } from "./calendar-workspace-store";
import { AppleCalendarBridge } from "./apple-calendar";
import { CalendarEventsService } from "./calendar-events";
import { CalendarWorkspaceSync } from "./calendar-workspace-sync";
import { syncLaunchAtLogin } from "./lifecycle";
import { GameAssetCache } from "./game-asset-cache";
import { GameMatchSync } from "./game-match-sync";
import { closeBlockedWebsite, quitBlockedApp } from "./blocking/local-actions";
import { logObservability } from "./logger";
import { deviceName as localDeviceName, legacyGoogleTokensPath, gameAssetPath, gameMatchPath, hiddenDevicesPath, localComputerName, networkLogPath, observabilityLogPath, userDataDir } from "./paths";
import { loadSettings, saveSettings } from "./settings-store";
import { loadTimesheetSummaries, saveTimesheetSummaries } from "./timesheet-summary-store";
import { clearTokens, loadSessionUser, loadTokens, saveSessionUser, saveTokens } from "./token-store";
import { migrateLocalJevRatings } from "./jev-ratings";
import { ScreenTimeTracker } from "./tracker";

function loadHiddenKeys(): Set<string> {
  try {
    if (!existsSync(hiddenDevicesPath())) return new Set();
    const parsed = JSON.parse(readFileSync(hiddenDevicesPath(), "utf8")) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveHiddenKeys(keys: Set<string>) {
  mkdirSync(dirname(hiddenDevicesPath()), { recursive: true });
  writeFileSync(hiddenDevicesPath(), JSON.stringify([...keys]), "utf8");
}

const defaultAuth = (): AuthUiState => ({
  formMode: "signIn",
  email: "",
  password: "",
  confirmPassword: "",
  phoneNumber: "",
  mfaCode: "",
  backupCode: "",
  useBackupCode: false,
  loading: false,
  statusMessage: "Sign in to sync your screen time across your devices.",
  statusTone: "info",
  user: null,
  mfaChallenge: null,
});

const defaultLeaderboard = (): LeaderboardUiState => ({
  period: "day",
  day: toDateInput(new Date()),
  entries: [],
  friends: [],
  requests: [],
  statusMessage: "",
  loading: false,
});

const BROADCAST_COALESCE_MS = 16;
/** How often the widgets are rebuilt while every app window is hidden. */
const HIDDEN_WIDGET_REFRESH_MS = 60_000;
/** Matches the WidgetKit reload limit in native-widget-store. */
const NATIVE_WIDGET_SYNC_MS = 60_000;
const LIVE_SESSION_RESOLUTION_MS = 15_000;
const SLOW_SNAPSHOT_MS = 50;
const PREFETCH_DELAY_MS = 3_000;
const SUMMARY_CACHE_LIMIT = 8;
const INSIGHTS_PREVIEW_LIMIT = 500;
const TIMESHEET_SUMMARY_DEBOUNCE_MS = 1_500;
const TIMESHEET_SUMMARY_POLL_MS = 30_000;
const TIMESHEET_SUMMARY_BATCH = 200;

function usesCalendarRange(navigation: NavigationItem) {
  return navigation === "calendar" || navigation === "timesheet";
}

function usesInsightWindow(navigation: NavigationItem) {
  return navigation === "insights" || navigation === "trend";
}

function rangeCacheKey(
  bounds: { start: Date; end: Date },
  zone: string,
  bucket = "",
  deviceId = "",
) {
  return `${bounds.start.getTime()}|${bounds.end.getTime()}|${zone}|${bucket}|${deviceId}`;
}

function summaryHasChart(summary: PeriodSummaryResponse | null | undefined) {
  if (!summary) return false;
  if (Array.isArray(summary.buckets) && summary.buckets.length > 0) return true;
  return Boolean(summary.tracked_seconds_by_day && Object.keys(summary.tracked_seconds_by_day).length > 0);
}

function insightCategoryFill(
  current: Array<{ category: string }>,
  rollup: LocalInsightRollup | null,
  preview: Array<{ category: string; seconds: number; percentage: number }>,
) {
  if (current.length) return {};
  if (rollup?.categories.length) return { categories: rollup.categories };
  if (preview.length) return { categories: preview };
  return {};
}

function observedDeviceRow(platform: string, name: string, timeZone: string): DeviceRow {
  return {
    device_id: "",
    device_platform: platform,
    device_name: name,
    label: "",
    time_zone: timeZone || "",
    registered_at: "",
    updated_at: "",
    last_seen_at: null,
    session_count: 0,
  };
}

interface LocalInsightRollup {
  key: string;
  totals: Record<string, number>;
  totalSeconds: number;
  apps: Array<{
    key: string;
    label: string;
    subtitle: string;
    category: string;
    seconds: number;
    percentage: number;
    colorIndex: number;
  }>;
  categories: Array<{ category: string; seconds: number; percentage: number }>;
  devicesByDay: Record<string, Record<string, number>>;
}

interface SnapshotDataView {
  version: number;
  devices: DeviceListEntry[];
  todayDeviceKey: string;
  insightsDeviceKey: string;
  snapshot: AppSnapshot["snapshot"];
  timelines: AppSnapshot["timelines"];
  calendarDayStats: CalendarDayStats;
  trendComparisons: TrendComparisons | null;
}

const EMPTY_CALENDAR_STATS: CalendarDayStats = {
  workSeconds: 0,
  pendingSeconds: 0,
  trackedSeconds: 0,
  targetSeconds: 1,
  percentOfTarget: 0,
  labelTotals: [],
  deviceTotals: [],
  productivity: { focus: 0, meetings: 0, breaks: 0, other: 0 },
  unlabeledBlocks: [],
  reviewCount: 0,
  dayTasks: [],
};

const defaultBlocking = (helper: BlockingHelperBridge): BlockingUiState => ({
  schedules: [],
  blocklists: [],
  enforcement: helper.status,
  installedApplications: helper.inventory,
  activeOccurrence: null,
  capabilities: helper.capabilities,
  hostSetup: helper.hostSetup,
  statusMessage: "",
  loading: false,
});

export class AppController {
  settings = loadSettings();
  navigation: NavigationItem = "today";
  statusMessage = "Ready";
  todayDay = new Date();
  todayTab: TodayTab = "timeline";
  todayPeriod: TodayPeriod = "day";
  calendarAnchor = new Date();
  calendarMonth = new Date();
  calendarView: CalendarView = "day";
  calendarWorkspace = loadCalendarWorkspace();
  timesheetSummaries: TimesheetSummaries = loadTimesheetSummaries();
  reviewBarDismissedIds: string[] = [];
  insightsPeriod: InsightsPeriod = "day";
  insightsAnchor = new Date();
  insightsTab: InsightsTab = "overview";
  insightsDeviceKey = ALL_INSIGHTS_DEVICES;
  todayDeviceKey = ALL_DEVICES;
  inspector = emptyInspector();
  hiddenDeviceKeys = loadHiddenKeys();
  auth = defaultAuth();
  leaderboard = defaultLeaderboard();
  blocking: BlockingUiState;
  calendarEvents: CalendarOverlayEvent[] = [];
  commandPaletteOpen = false;
  serverSummary: PeriodSummaryResponse | null = null;
  serverSummaryRange: { start: number; end: number; bucket: string; deviceId: string } | null = null;
  private localInsightRollup: LocalInsightRollup | null = null;
  private localInsightJob = 0;
  private localInsightJobKey = "";
  private insightChartPending = false;
  private trendComparisonPending = false;
  private trendComparisonInflight = "";
  private trendComparisonRevision = 0;
  private trendComparisonMiss: { key: string; totals: Record<string, number> } | null = null;
  private observedDevices: DeviceRow[] = [];
  private deviceIndexStarted = false;
  api = new StopScrollingAPI(this.settings.apiBaseUrl, null, (tokens) => {
    if (tokens) saveTokens(tokens);
    else clearTokens();
  });
  calendars = new CalendarEventsService(this.api, new AppleCalendarBridge(), {
    signedIn: () => Boolean(this.auth.user && this.api.getTokens()),
    appleCalendarIds: () => this.settings.appleCalendarIds,
    setAppleCalendarIds: (appleCalendarIds) => this.updateSettings({ appleCalendarIds }),
    openExternal: (url) => shell.openExternal(url),
    changed: () => this.broadcast(),
  });
  workspaceSync = new CalendarWorkspaceSync(this.api, {
    userId: () => (this.auth.user && this.api.getTokens() && this.settings.syncEnabled ? this.auth.user.id : null),
    deviceKey: () => deviceKey(currentDevicePlatform(), localDeviceName()),
    local: () => this.calendarWorkspace,
    apply: (workspace) => {
      this.calendarWorkspace = workspace;
      saveCalendarWorkspace(workspace);
      this.broadcast();
    },
  });
  gameAssets = new GameAssetCache(gameAssetPath(), () => this.broadcast());
  gameSync = (() => {
    const sync = new GameMatchSync(
      this.api,
      gameMatchPath(),
      () => this.broadcast(),
      () => Boolean(this.settings.syncEnabled && this.api.getTokens()),
    );
    sync.prefetchAsset = (assetId) => {
      void this.gameAssets.ensure(assetId);
    };
    return sync;
  })();
  tracker = new ScreenTimeTracker(
    this.api,
    () => this.broadcast(),
    () => Boolean(this.settings.syncEnabled && this.api.getTokens()),
    undefined,
    undefined,
    () => this.settings.agentSendTitles,
    () => this.navigation === "agent",
    () => Date.now(),
    (entry) => this.gameSync.noteSession(entry),
    () => {
      void this.gameSync.flush();
    },
  );

  private windows = new Set<BrowserWindow>();
  private refreshGeneration = 0;
  private dataCache: { deps: unknown[]; view: SnapshotDataView } | null = null;
  private dataVersion = 0;
  private sentDataVersion = new Map<number, number>();
  private broadcastTimer: NodeJS.Timeout | null = null;
  private hiddenWidgetTimer: NodeJS.Timeout | null = null;
  private hiddenWidgetRefreshAt = -Infinity;
  /** The minute timeline refresh was skipped while hidden; run it when a window shows. */
  private timelineRefreshDeferred = false;
  private cachedWidgetSummary: DesktopWidgetSummary | null = null;
  private cachedWidgetVersion = -1;
  private insightsOpenedAt: number | null = null;
  private summaryCache = new Map<string, PeriodSummaryResponse>();
  private prefetchTimer: NodeJS.Timeout | null = null;
  private timelineTimer: NodeJS.Timeout | null = null;
  private timesheetSummaryTimer: NodeJS.Timeout | null = null;
  private timesheetSummaryInFlight = false;
  private helperTimer: NodeJS.Timeout | null = null;
  private inventoryLoaded = false;
  private helperBoundaryTimer: NodeJS.Timeout | null = null;
  private lastPolicySignature: string | null = null;
  private usingLocalEnforcement = false;
  private askedForAccessibility = false;
  /** One 250 ms timer serves both browser watches so each tick reads the focused tab once. */
  private browserWatchTimer: NodeJS.Timeout | null = null;
  private blockWatchOn = false;
  private classifierWatchOn = false;
  private latestForeground: ActivitySnapshot | null = null;
  private blockingRefreshGeneration = 0;
  private blockingListsTask: Promise<{
    blocklists: BlockingUiState["blocklists"] | null;
    schedules: BlockingUiState["schedules"] | null;
    error: string | null;
  }> | null = null;
  readonly helper: BlockingHelperBridge;
  readonly localEnforcer = new LocalEnforcer(
    undefined,
    () => this.showBlockFreedom(),
    (scheduleId) => this.prepareFreedomScreen(scheduleId),
  );
  readonly distractionNudge = new DistractionNudge({
    show: ({ label, site }) => showNudgeCard(label, site, () => this.distractionNudge.dismiss()),
    hide: () => hideNudgeCard(),
  });
  private freedomOwner: "block" | null = null;
  private classifierActing = false;
  onBlockingStateChanged: (() => void) | null = null;

  constructor(helper = new BlockingHelperBridge()) {
    this.helper = helper;
    this.blocking = defaultBlocking(helper);
    this.tracker.onForeground = (snapshot) => {
      this.latestForeground = snapshot;
      void this.localEnforcer.enforce(snapshot);
      this.considerDistractionNudge(snapshot);
    };
    this.tracker.onProductivity = () => {
      if (this.latestForeground) this.considerDistractionNudge(this.latestForeground);
    };
    this.syncClassifierWatch();
  }

  private considerDistractionNudge(snapshot: ActivitySnapshot) {
    const verdict = foregroundVerdict((key) => {
      const entry = this.tracker.productivityAgent.lookup(key);
      if (!entry) return undefined;
      if (entry.source !== "user" && !acceptedProductivityVerdict(entry.verdict, entry.confidence)) return undefined;
      return entry.verdict;
    }, snapshot);
    const blocked = foregroundBlocked(this.localEnforcer.storedPolicy, snapshot, Date.now());
    const response = this.distractionResponse();
    if (response === "popup") {
      this.distractionNudge.consider({ target: snapshot, verdict, blocked });
    } else {
      this.distractionNudge.consider({ target: snapshot, verdict: null, blocked: false });
    }
    if (response === "block" && verdict === "Distracting" && !blocked) {
      void this.enforceClassifierBlock(snapshot);
    }
  }

  private distractionResponse(): DistractionResponse {
    const value = this.settings.distractionResponse as string;
    if (value === "off") return "off";
    if (value === "block" || value === "screen" || value === "both") return "block";
    return "popup";
  }

  private async enforceClassifierBlock(snapshot: ActivitySnapshot) {
    if (this.classifierActing) return;
    this.classifierActing = true;
    try {
      this.prepareFreedomScreen("");
      const host = websiteHostname(snapshot.url);
      if (host) {
        await closeBlockedWebsite(snapshot.appName, snapshot.bundleID, [host]);
        return;
      }
      await quitBlockedApp(snapshot.appName, snapshot.bundleID);
      showFreedomScreen();
    } catch (error) {
      logObservability(`Jev block failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.classifierActing = false;
    }
  }

  private showBlockFreedom() {
    this.freedomOwner = "block";
    showFreedomScreen();
  }

  private hideBlockFreedom() {
    if (this.freedomOwner !== "block") return;
    this.freedomOwner = null;
    hideFreedomScreen();
  }

  async boot() {
    const stored = loadTokens();
    if (stored) {
      this.api.setTokens(stored);
      const user = loadSessionUser();
      if (user) {
        this.auth.user = user;
        this.setAuthStatus(`Signed in as ${user.email}`);
      }
    }
    this.removeLegacyGoogleTokens();
    await this.restoreSession();
    // Signed out, Apple calendars still show; signed in, restoreSession already refreshed them.
    if (!this.auth.user) void this.calendars.refresh();
    void this.prefetchBlockingLists();
    await this.helper.initialize();
    const setup = await this.helper.activateNativeSetup();
    logObservability(
      `Blocking helper activation: registered=${setup.helperRegistered} error=${setup.lastError ?? "none"}`,
    );
    await this.refreshBlockingHelper(true);
    this.startHelperRefresh();
    if (process.env.STOPSCROLLING_UI_TEST !== "1") {
      await this.tracker.startTracking();
    }
    this.startTimelineRefresh();
    this.scheduleDeviceIndex();
    this.gameSync.start();
    await this.refreshVisibleRange();
    this.schedulePrefetch();
    this.syncClassifierWatch();
    logObservability("Bootstrap complete");
  }

  addWindow(win: BrowserWindow) {
    this.windows.add(win);
    const contentsId = win.webContents.id;
    win.on("closed", () => {
      this.windows.delete(win);
      this.sentDataVersion.delete(contentsId);
    });
    win.webContents.once("did-finish-load", () => {
      win.webContents.send(IPC.state, this.stateFor(contentsId));
    });
    // Hidden windows are skipped by broadcasts; catch up the moment one is visible again.
    const caughtUp = () => {
      this.broadcast();
      if (this.timelineRefreshDeferred) {
        this.timelineRefreshDeferred = false;
        void this.refreshVisibleRange();
      }
    };
    win.on("show", caughtUp);
    win.on("restore", caughtUp);
  }

  /** True when a renderer window is on screen and wants state pushed to it. */
  private anyWindowVisible() {
    for (const win of this.windows) {
      if (!win.isDestroyed() && win.isVisible() && !win.isMinimized()) return true;
    }
    return false;
  }

  /** Full state for one renderer; later broadcasts may send it patches against this version. */
  stateFor(contentsId: number): AppSnapshot {
    const snap = this.snapshot();
    this.sentDataVersion.set(contentsId, snap.dataVersion ?? 0);
    return snap;
  }

  effectiveTimeZone() {
    return resolveTimeZone(this.auth.user?.time_zone);
  }

  visibleRange() {
    const zone = this.effectiveTimeZone();
    if (usesCalendarRange(this.navigation)) {
      if (this.calendarView === "month") return mondayMonthGridBounds(this.calendarMonth, zone);
      return { start: startOfMonth(this.calendarMonth, zone), end: endOfMonth(this.calendarMonth, zone) };
    }
    if (usesTodayWindow(this.navigation)) {
      return todayPeriodBounds("day", this.todayDay, zone);
    }
    if (usesInsightWindow(this.navigation)) return periodBounds(this.insightsPeriod, this.insightsAnchor, zone);
    return periodBounds("day", this.todayDay, zone);
  }

  snapshot(): AppSnapshot {
    if (this.navigation === "leaderboard" || this.navigation === "timer" || this.navigation === "timesheet") this.navigation = "today";
    const view = this.dataView();
    const ratingAvailable = Boolean(this.auth.user && this.settings.syncEnabled && this.tracker.jevSync.enabled);
    return {
      navigation: this.navigation,
      statusMessage: this.statusMessage,
      appearance: this.settings.appearance,
      isTracking: this.tracker.isTracking,
      currentContext: this.tracker.currentContext,
      pendingUploadCount: this.tracker.pendingUploadCount,
      isAuthenticated: Boolean(this.auth.user),
      auth: this.auth,
      settings: this.settings,
      todayDay: this.todayDay.toISOString(),
      todayTab: this.todayTab,
      todayPeriod: "day",
      todayDeviceKey: view.todayDeviceKey,
      calendarAnchor: this.calendarAnchor.toISOString(),
      calendarMonth: this.calendarMonth.toISOString(),
      calendarView: this.calendarView,
      calendarWorkspace: this.calendarWorkspace,
      timesheetSummaries: this.timesheetSummaries,
      calendarDayStats: view.calendarDayStats,
      calendarReviewVisible: shouldShowReviewBar(
        view.calendarDayStats.unlabeledBlocks.map((block) => block.id),
        this.reviewBarDismissedIds,
      ),
      insightsPeriod: this.insightsPeriod,
      insightsAnchor: this.insightsAnchor.toISOString(),
      insightsTab: normalizeInsightsTab(this.insightsTab),
      insightsDeviceKey: view.insightsDeviceKey,
      trendComparisons: view.trendComparisons,
      snapshot: view.snapshot,
      timelines: view.timelines,
      loadingEntries: this.tracker.loadingEntries || this.insightChartPending || (this.navigation === "trend" && this.trendComparisonPending),
      entriesUnavailableReason: this.tracker.entriesUnavailableReason,
      devices: view.devices,
      hiddenDeviceKeys: [...this.hiddenDeviceKeys],
      inspector: this.inspector,
      capabilities: this.tracker.capabilities(),
      calendarEvents: this.settings.showCalendarEvents ? this.calendarEvents : [],
      calendarIntegration: this.calendars.state(),
      gameAccounts: this.gameSync.accountView(),
      gameAccountsStatus: this.gameSync.status,
      logs: {
        network: networkLogPath(),
        observability: observabilityLogPath(),
      },
      leaderboard: this.leaderboard,
      blocking: this.blocking,
      agent: this.agentView(view.snapshot.timelineSegments, ratingAvailable),
      commandPaletteOpen: this.commandPaletteOpen,
      dataVersion: view.version,
    };
  }

  private agentCache: { deps: unknown[]; view: AppSnapshot["agent"] } | null = null;

  /** Agent screen view, rebuilt only when its segments, verdicts or review progress change. */
  private agentView(cached: ScreenTimeTimelineSegment[], ratingAvailable: boolean): AppSnapshot["agent"] {
    const agent = this.tracker.productivityAgent;
    const segments = this.agentSegments(cached);
    const deps = [segments, agent.cache, agent.reviewing, agent.progress.done, agent.progress.total, ratingAvailable];
    if (this.agentCache && this.agentCache.deps.every((value, index) => Object.is(value, deps[index]))) {
      return this.agentCache.view;
    }
    const view = buildAgentView(segments, agent.cache, {
      reviewing: agent.reviewing,
      progress: agent.progress,
      ratingAvailable,
    });
    this.agentCache = { deps, view };
    return view;
  }

  /** Today's segments, including the session that is open right now. */
  private agentSegments(cached: ScreenTimeTimelineSegment[]): ScreenTimeTimelineSegment[] {
    if (this.navigation !== "agent") return cached;
    const zone = this.effectiveTimeZone();
    const bounds = todayPeriodBounds("day", this.todayDay, zone);
    return snapshotFromRange(
      ensureLiveEntryVisible(this.tracker.mergedEntries()),
      bounds,
      undefined,
      undefined,
      this.tracker.categoryCache(),
      zone,
    ).timelineSegments;
  }

  /** Rates every unrated title in the current view, then refreshes the agent tab. */
  reviewAgent() {
    const inputs = this.focusInputs();
    void this.tracker.productivityAgent.reviewAll(inputs).finally(() => this.broadcast());
    this.broadcast();
  }

  private focusInputs() {
    return productivityInputsFromSegments(this.dataView().snapshot.timelineSegments, {
      sendTitles: this.settings.agentSendTitles,
      cache: this.tracker.productivityAgent.cache,
    });
  }

  overrideAgentVerdict(key: string, verdict: string) {
    if (!key || !(verdict in JEV_PRODUCTIVITY_CRITERIA)) return;
    this.tracker.productivityAgent.override(key, verdict as ProductivityVerdict);
  }

  /**
   * Rebuilds entries, aggregates, and timelines only when one of their inputs
   * changes. The live session's end is bucketed so periodic status broadcasts
   * reuse the previous result.
   */
  private dataView(): SnapshotDataView {
    const zone = this.effectiveTimeZone();
    const deps: unknown[] = [
      this.navigation,
      zone,
      Boolean(this.auth.user),
      ...this.tracker.entriesSignature(LIVE_SESSION_RESOLUTION_MS),
      this.tracker.registeredDevices,
      this.tracker.deviceStatus,
      this.tracker.localDeviceId,
      [...this.hiddenDeviceKeys].sort().join("\n"),
      this.insightsDeviceKey,
      this.todayDeviceKey,
      this.insightsPeriod,
      this.insightsAnchor.getTime(),
      this.todayDay.getTime(),
      this.calendarAnchor.getTime(),
      this.calendarMonth.getTime(),
      this.calendarView,
      this.serverSummary,
      this.serverSummaryRange,
      this.localInsightRollup,
      this.trendComparisonRevision,
      this.observedDevices,
      this.tracker.categoryCache(),
      this.tracker.productivityAgent.cache,
      this.gameSync.matchRevision,
      this.gameAssets.revision,
      this.calendarWorkspace,
      this.settings.dailyWorkTargetSeconds,
    ];
    const cached = this.dataCache;
    if (cached && cached.deps.length === deps.length && cached.deps.every((value, index) => Object.is(value, deps[index]))) {
      return cached.view;
    }
    const started = performance.now();
    const view = { ...this.buildDataView(zone), version: ++this.dataVersion };
    const elapsed = performance.now() - started;
    if (elapsed >= SLOW_SNAPSHOT_MS) {
      const scope = this.navigation === "insights" ? `insights/${this.insightsPeriod}` : this.navigation;
      logObservability(`Snapshot data for ${scope} rebuilt in ${elapsed.toFixed(0)}ms (${view.snapshot.timelineSegments.length} segments)`);
    }
    this.dataCache = { deps, view };
    if (classifiesFocus(this.navigation)) {
      this.tracker.productivityAgent.enqueueBackground(this.focusInputs());
    }
    return view;
  }

  private buildDataView(zone: string, navigation: NavigationItem = this.navigation): Omit<SnapshotDataView, "version"> {
    const devices = this.deviceEntries();
    const registeredKeys = new Set(devices.map((device) => device.visibilityKey));
    const localKey = deviceKey(currentDevicePlatform(), localDeviceName());
    const period = usesInsightWindow(navigation) ? this.insightsPeriod : "day";
    const calendarRange = usesCalendarRange(navigation);
    const anchor =
      usesInsightWindow(navigation)
        ? this.insightsAnchor
        : calendarRange
          ? this.calendarAnchor
          : this.todayDay;
    const todayBounds = todayPeriodBounds("day", this.todayDay, zone);
    const todayWindow = usesTodayWindow(navigation);
    const live = navigation === this.navigation;
    const snapshotBounds = todayWindow
      ? todayBounds
      : periodBounds(period, anchor, zone);
    const insightRange = usesInsightWindow(navigation) && period !== "day";
    const mergedEntries = mergeEntries(
      this.tracker.mergedEntries(),
      insightRange ? [] : this.tracker.history.overlapping(snapshotBounds.start, snapshotBounds.end),
    );
    const allEntries = this.auth.user && registeredKeys.size
      ? mergedEntries.filter((entry) => {
        const key = deviceKey(entry.platform, entry.deviceName);
        return registeredKeys.has(key) || key === localKey;
      })
      : mergedEntries;
    const visibleDeviceKeys = devices
      .filter((device) => !this.hiddenDeviceKeys.has(device.visibilityKey))
      .map((device) => device.visibilityKey);
    const insightsDeviceKey = normalizeInsightsDeviceKey(this.insightsDeviceKey, visibleDeviceKeys);
    const todayDeviceKey = normalizeInsightsDeviceKey(this.todayDeviceKey, visibleDeviceKeys);
    const deviceKeyForNav = usesInsightWindow(navigation)
      ? insightsDeviceKey
      : navigation === "today"
        ? todayDeviceKey
        : ALL_DEVICES;
    const deviceScoped = (usesInsightWindow(navigation) || navigation === "today") && (
      deviceKeyForNav !== ALL_DEVICES || this.hiddenDeviceKeys.size > 0
    );
    const entries = usesInsightWindow(navigation) || navigation === "today"
      ? filterEntriesForInsights(allEntries, deviceKeyForNav, this.hiddenDeviceKeys)
      : allEntries;
    const serverSummary = deviceScoped && !this.usesInsightBuckets(navigation)
      ? undefined
      : this.mappedServerSummary(snapshotBounds, navigation);
    const categoryCache = this.tracker.categoryCache();
    const productivityCache = this.tracker.productivityAgent.cache;
    const matches = this.gameSync.matches();
    const summaryBuckets = Array.isArray(serverSummary?.buckets) && serverSummary.buckets.length
      ? serverSummary.buckets
      : undefined;
    const dailyTotals = serverSummary?.trackedSecondsByDay;
    const hasDailyTotals = Boolean(dailyTotals && Object.keys(dailyTotals).length > 0);
    const localRollup = insightRange && !summaryBuckets && !hasDailyTotals
      ? this.localInsightChart(snapshotBounds, zone, !live)
      : null;
    if (live && (!insightRange || summaryBuckets || hasDailyTotals || localRollup)) this.insightChartPending = false;
    const useSummaryChart = Boolean(insightRange && (summaryBuckets || hasDailyTotals || localRollup));
    const listEntries = insightRange && entries.length > INSIGHTS_PREVIEW_LIMIT
      ? entries.slice(entries.length - INSIGHTS_PREVIEW_LIMIT)
      : entries;
    const baseSnapshot = todayWindow
      ? snapshotFromRange(entries, todayBounds, serverSummary, undefined, categoryCache, zone, productivityCache)
      : snapshotFromEntries(
        useSummaryChart ? [] : listEntries,
        period,
        anchor,
        serverSummary,
        categoryCache,
        zone,
        productivityCache,
      );
    const previewSnapshot = useSummaryChart
      ? snapshotFromEntries(
        listEntries,
        period,
        anchor,
        undefined,
        categoryCache,
        zone,
        productivityCache,
      )
      : null;
    const preparedSnapshot = useSummaryChart
      ? {
        ...baseSnapshot,
        buckets: summaryBuckets
          ? serverPeriodBuckets(summaryBuckets, period, anchor, zone)
          : bucketsFromDailyTotals(
            hasDailyTotals ? dailyTotals ?? {} : localRollup?.totals ?? {},
            period,
            anchor,
            zone,
            localRollup?.devicesByDay ?? {},
          ),
        listSegments: previewSnapshot?.listSegments ?? [],
        timelineSegments: [],
        ...insightCategoryFill(baseSnapshot.categories, localRollup, previewSnapshot?.categories ?? []),
        ...(localRollup && !summaryBuckets && !hasDailyTotals
          ? { totalSeconds: localRollup.totalSeconds, apps: localRollup.apps }
          : {}),
      }
      : baseSnapshot;
    const snapshot = withMatchSnapshot(preparedSnapshot, matches);
    const extraDevices = this.tracker.registeredDevices.map((device) => ({
      platform: device.device_platform,
      name: device.device_name,
      timeZone: device.time_zone,
    }));
    const timelineBounds = calendarRange && this.calendarView === "week"
      ? mondayWeekBounds(anchor, zone)
      : calendarRange && this.calendarView === "month"
        ? mondayMonthGridBounds(this.calendarMonth, zone)
        : snapshotBounds;
    const timelines = usesInsightWindow(navigation) && period !== "day"
      ? []
      : withMatchLines(
          filterTimelinesForInsights(
            filterVisibleTimelines(
              entriesToTimelines(entries, anchor, extraDevices, timelineBounds, productivityCache),
              this.hiddenDeviceKeys,
            ),
            deviceKeyForNav,
          ),
          matches,
        );
    const datedSnapshot = calendarRange
      ? { ...snapshot, trackedSecondsByDay: trackedSecondsByDay(entries, this.calendarMonth, zone) }
      : snapshot;
    const published = publishGameAssets(
      datedSnapshot,
      timelines,
      (assetId) => this.gameAssets.has(assetId),
      (assetId) => {
        void this.gameAssets.ensure(assetId);
      },
    );
    const calendarDayStats = calendarRange
      ? buildCalendarDayStats(
          this.calendarWorkspace,
          collectDayBlocks(published.timelines),
          this.calendarAnchor,
          this.settings.dailyWorkTargetSeconds || 8 * 60 * 60,
          zone,
        )
      : EMPTY_CALENDAR_STATS;
    return {
      devices,
      todayDeviceKey,
      insightsDeviceKey,
      snapshot: published.snapshot,
      timelines: published.timelines,
      calendarDayStats,
      trendComparisons: this.trendComparisonsFor(zone, insightsDeviceKey),
    };
  }

  /** Coalesces bursts of state changes into one update per window. */
  broadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.flushBroadcast();
    }, BROADCAST_COALESCE_MS);
  }

  private flushBroadcast() {
    if (!this.anyWindowVisible()) {
      this.refreshWidgetsWhileHidden();
      return;
    }
    const snap = this.snapshot();
    this.reportInsightsReady(snap);
    const widget = this.desktopWidgetStateFrom(snap);
    sendDesktopWidgetState(widget);
    this.syncNativeWidget();
    const version = snap.dataVersion ?? 0;
    let patch: AppStatePatch | null = null;
    for (const win of this.windows) {
      if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) continue;
      const contents = win.webContents;
      if (this.sentDataVersion.get(contents.id) === version) {
        patch ??= toStatePatch(snap);
        contents.send(IPC.state, patch);
      } else {
        this.sentDataVersion.set(contents.id, version);
        contents.send(IPC.state, snap);
      }
    }
  }

  /**
   * With every app window hidden only the widgets show state, so rebuild for them at most
   * once a minute. A change inside that window is picked up by a trailing refresh.
   */
  private refreshWidgetsWhileHidden() {
    const wait = this.hiddenWidgetRefreshAt + HIDDEN_WIDGET_REFRESH_MS - Date.now();
    if (wait > 0) {
      this.hiddenWidgetTimer ??= setTimeout(() => {
        this.hiddenWidgetTimer = null;
        this.broadcast();
      }, wait);
      return;
    }
    this.hiddenWidgetRefreshAt = Date.now();
    const snap = this.snapshot();
    sendDesktopWidgetState(this.desktopWidgetStateFrom(snap));
    this.syncNativeWidget();
  }

  private reportInsightsReady(snap: AppSnapshot) {
    if (this.insightsOpenedAt === null) return;
    if (snap.navigation !== "insights") {
      this.insightsOpenedAt = null;
      return;
    }
    if (snap.loadingEntries) return;
    logObservability(`Insights (${snap.insightsPeriod}) ready ${(performance.now() - this.insightsOpenedAt).toFixed(0)}ms after opening`);
    this.insightsOpenedAt = null;
  }

  /** Shows or hides the macOS panel. It only renders the snapshot already published for the main window. */
  syncDesktopWidget() {
    if (process.platform !== "darwin" || process.env.STOPSCROLLING_UI_TEST === "1") {
      hideDesktopWidget();
      return;
    }
    const state = this.desktopWidgetState();
    this.syncNativeWidget();
    if (this.settings.desktopWidgetVisible) {
      showDesktopWidget();
      sendDesktopWidgetState(state);
    } else hideDesktopWidget();
  }

  /** Writes today's summary for the native widget. It uses verdicts already on the snapshot. */
  private syncNativeWidget() {
    if (process.platform !== "darwin") return;
    if (process.env.STOPSCROLLING_UI_TEST === "1" || process.env.VITEST === "true") return;
    // WidgetKit reloads at most once a minute, so rebuilding its summaries more often is wasted.
    const wait = this.nativeWidgetSyncedAt + NATIVE_WIDGET_SYNC_MS - Date.now();
    if (wait > 0) {
      this.nativeWidgetTimer ??= setTimeout(() => {
        this.nativeWidgetTimer = null;
        this.syncNativeWidget();
      }, wait);
      return;
    }
    this.nativeWidgetSyncedAt = Date.now();
    try {
      const today = this.todayNativeSummary();
      const trend = this.insightTrendSummary();
      if (today === this.publishedNativeSummary && trend === this.publishedTrendSummary) return;
      publishNativeWidget(today);
      publishTrendWidget(trend);
      this.publishedNativeSummary = today;
      this.publishedTrendSummary = trend;
    } catch (error) {
      logObservability(`Native widget publish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private nativeWidgetTimer: NodeJS.Timeout | null = null;
  private nativeWidgetSyncedAt = -Infinity;
  private publishedNativeSummary: DesktopWidgetSummary | null = null;
  private publishedTrendSummary: TrendWidgetSummary | null = null;
  private cachedNativeSummary: DesktopWidgetSummary | null = null;
  private cachedNativeVersion = -1;
  private cachedNativeDay = -1;
  private cachedTrendSummary: TrendWidgetSummary | null = null;
  private cachedTrendVersion = -1;
  private cachedTrendKey = "";

  /** Current calendar day in the user's time zone, not whichever screen is open. */
  private todayNativeSummary(): DesktopWidgetSummary {
    const day = this.todayDay.getTime();
    const version = this.dataCache?.view.version ?? this.dataVersion;
    if (this.cachedNativeSummary && this.cachedNativeVersion === version && this.cachedNativeDay === day) {
      return this.cachedNativeSummary;
    }
    const summary = usesTodayWindow(this.navigation)
      ? desktopWidgetSummary(this.dataView().snapshot)
      : desktopWidgetSummary(this.todaySnapshotFromEntries());
    this.cachedNativeSummary = summary;
    this.cachedNativeVersion = version;
    this.cachedNativeDay = day;
    return summary;
  }

  /**
   * Insights activity trend for the saved period, even when another screen is open.
   * A temporary app or verdict filter on the Insights screen is not part of this snapshot.
   */
  private insightTrendSummary(): TrendWidgetSummary {
    const zone = this.effectiveTimeZone();
    const version = this.dataCache?.view.version ?? this.dataVersion;
    const key = `${this.insightsPeriod}|${this.insightsAnchor.getTime()}|${this.insightsDeviceKey}|${[...this.hiddenDeviceKeys].sort().join("\n")}|${this.localInsightRollup?.key ?? ""}`;
    if (this.cachedTrendSummary && this.cachedTrendVersion === version && this.cachedTrendKey === key) {
      return this.cachedTrendSummary;
    }
    const snapshot = usesInsightWindow(this.navigation)
      ? this.dataView().snapshot
      : this.buildDataView(zone, "insights").snapshot;
    const devices = this.deviceEntries();
    const order = new Map(devices.map((device, index) => [device.visibilityKey, index]));
    const summary: TrendWidgetSummary = {
      period: this.insightsPeriod,
      title: formatPeriod(this.insightsPeriod, this.insightsAnchor, zone),
      buckets: snapshot.buckets.map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        seconds: bucket.seconds,
        devices: [...(bucket.devices ?? [])]
          .filter((share) => share.seconds > 0)
          .sort((a, b) => (order.get(a.key) ?? devices.length) - (order.get(b.key) ?? devices.length))
          .map((share) => ({
            key: share.key,
            seconds: share.seconds,
            colorIndex: deviceColorIndex(share.key, devices.find((device) => device.visibilityKey === share.key)?.colorIndex),
          })),
      })),
      top: rankedAppsBySeconds(snapshot.apps).map((app) => ({
        key: app.key,
        label: app.label,
        seconds: app.seconds,
      })),
    };
    this.cachedTrendSummary = summary;
    this.cachedTrendVersion = version;
    this.cachedTrendKey = key;
    return summary;
  }

  private todaySnapshotFromEntries() {
    const zone = this.effectiveTimeZone();
    const bounds = todayPeriodBounds("day", this.todayDay, zone);
    const devices = this.deviceEntries();
    const registeredKeys = new Set(devices.map((device) => device.visibilityKey));
    const localKey = deviceKey(currentDevicePlatform(), localDeviceName());
    const merged = mergeEntries(
      this.tracker.mergedEntries(),
      this.tracker.history.overlapping(bounds.start, bounds.end),
    );
    const allEntries = this.auth.user && registeredKeys.size
      ? merged.filter((entry) => {
        const key = deviceKey(entry.platform, entry.deviceName);
        return registeredKeys.has(key) || key === localKey;
      })
      : merged;
    const visibleDeviceKeys = devices
      .filter((device) => !this.hiddenDeviceKeys.has(device.visibilityKey))
      .map((device) => device.visibilityKey);
    const todayDeviceKey = normalizeInsightsDeviceKey(this.todayDeviceKey, visibleDeviceKeys);
    return snapshotFromRange(
      filterEntriesForInsights(allEntries, todayDeviceKey, this.hiddenDeviceKeys),
      bounds,
      undefined,
      undefined,
      this.tracker.categoryCache(),
      zone,
      this.tracker.productivityAgent.cache,
    );
  }

  desktopWidgetState() {
    return this.desktopWidgetStateFrom(this.snapshot());
  }

  private desktopWidgetStateFrom(snap: AppSnapshot) {
    const version = snap.dataVersion ?? 0;
    if (!this.cachedWidgetSummary || this.cachedWidgetVersion !== version) {
      this.cachedWidgetSummary = desktopWidgetSummary(snap.snapshot);
      this.cachedWidgetVersion = version;
    }
    return {
      ...this.cachedWidgetSummary,
      appearance: snap.appearance,
      dataVersion: version,
    };
  }

  selectNavigation(item: NavigationItem) {
    if (item === "leaderboard" || item === "timer") item = "today";
    this.navigation = item;
    this.inspector = emptyInspector();
    this.statusMessage = `Showing ${item[0].toUpperCase()}${item.slice(1)}`;
    this.commandPaletteOpen = false;
    this.insightsOpenedAt = item === "insights" ? performance.now() : null;
    if (item === "blocking") void this.refreshBlocking();
    else void this.refreshVisibleRange();
    if (usesCalendarRange(item)) void this.workspaceSync.pull({ throttle: true });
    this.broadcast();
    this.scheduleTimesheetSummaries();
  }

  /** Screens that render session titles, which come from timesheet summaries. */
  private showsSessions() {
    if (this.navigation === "insights") return this.insightsPeriod === "day";
    return ["today", "timer", "calendar", "timesheet"].includes(this.navigation);
  }

  async refreshVisibleRange() {
    const generation = ++this.refreshGeneration;
    const bounds = this.visibleRange();
    const zone = this.effectiveTimeZone();
    const syncing = Boolean(this.api.getTokens() && this.settings.syncEnabled);
    const fast = this.usesInsightBuckets();
    const bucket = fast ? this.insightBucket() : undefined;
    const devicesPromise = syncing ? this.tracker.refreshDevices(false) : Promise.resolve();
    if (fast && this.hiddenDeviceKeys.size > 0 && this.insightsDeviceKey === ALL_DEVICES) {
      await devicesPromise;
      if (generation !== this.refreshGeneration) return;
    }
    const scope = fast ? this.insightSummaryScope() : "";
    const summaryKey = rangeCacheKey(bounds, zone, bucket ?? "", scope);
    const cachedSummary = syncing ? this.summaryCache.get(summaryKey) : undefined;
    if (cachedSummary) this.applySummary(cachedSummary, bounds, bucket ?? "", scope);
    const summaryPromise = fast
      ? this.fetchInsightSummary(bounds, zone, bucket, scope)
      : this.fetchPeriodSummary(bounds, zone, undefined, undefined);
    const previewDeviceId = fast && scope && !scope.includes(",") ? scope : undefined;
    const previewPromise = fast
      ? this.tracker.loadPreview(bounds.start, bounds.end, zone, INSIGHTS_PREVIEW_LIMIT, previewDeviceId)
      : null;
    if (!fast) await this.tracker.loadRange(bounds.start, bounds.end, zone);
    if (generation !== this.refreshGeneration) return;
    const summary = await summaryPromise;
    if (previewPromise) await previewPromise;
    if (generation !== this.refreshGeneration) return;
    if (fast && !summaryHasChart(summary)) {
      this.serverSummary = null;
      this.serverSummaryRange = null;
    }
    if (syncing && this.api.getTokens() && this.settings.syncEnabled) {
      if (summary) this.rememberSummary(summaryKey, summary);
      this.applySummary(summary ?? null, bounds, bucket ?? "", scope);
    } else {
      this.serverSummary = null;
      this.serverSummaryRange = null;
    }
    await devicesPromise;
    if (generation !== this.refreshGeneration) return;
    if (this.navigation === "calendar" && this.settings.showCalendarEvents) {
      const range = this.calendarEventRange(bounds, zone);
      const events = await this.calendars.events(range.start, range.end, zone);
      if (generation !== this.refreshGeneration) return;
      this.calendarEvents = events;
    }
    this.broadcast();
    this.scheduleTimesheetSummaries();
  }

  /** The visible range, widened to the anchor's whole week so the week view has every day's events. */
  private calendarEventRange(bounds: { start: Date; end: Date }, zone: string) {
    const week = mondayWeekBounds(this.calendarAnchor, zone);
    return {
      start: new Date(Math.min(bounds.start.getTime(), week.start.getTime())),
      end: new Date(Math.max(bounds.end.getTime(), week.end.getTime())),
    };
  }

  /** Called after sign-in, on startup and on window focus: pick up calendar changes from other devices. */
  refreshCalendars(options: { throttle?: boolean } = {}) {
    void this.workspaceSync.pull(options);
    if (options.throttle) return;
    void this.calendars.refresh().then(() => this.refreshCalendarEvents());
  }

  private removeLegacyGoogleTokens() {
    if (!existsSync(legacyGoogleTokensPath())) return;
    rmSync(legacyGoogleTokensPath(), { force: true });
    this.statusMessage = "Google Calendar now links through your Stop Scrolling account. Reconnect it in Settings › Calendar.";
  }

  tempusConversations() {
    return this.tempusCall(() => this.api.tempusConversations());
  }

  tempusConversation(id: string) {
    return this.tempusCall(() => this.api.tempusConversation(id));
  }

  /** Sends to `conversationId`, or to a new conversation when it is null. */
  tempusSend(conversationId: string | null, content: string) {
    return this.tempusCall(async () => {
      const id = conversationId ?? (await this.api.createTempusConversation()).id;
      return this.api.sendTempusMessage(id, content);
    });
  }

  tempusPlan(date?: string) {
    return this.tempusCall(() => this.api.planTempusDay(date));
  }

  tempusResolveAction(id: string, decision: "confirm" | "reject") {
    return this.tempusCall(async () => {
      const action = await this.api.resolveTempusAction(id, decision);
      // Confirmed changes are schedules and blocklists the Blocking screen shows.
      if (action.status === "applied") void this.refreshBlocking();
      return action;
    });
  }

  tempusDigests(period: TempusPeriod) {
    return this.tempusCall(() => this.api.tempusDigests(period));
  }

  tempusRequestDigest(period: TempusPeriod) {
    return this.tempusCall(() => this.api.requestTempusDigest(period));
  }

  private async tempusCall<T>(run: () => Promise<T>): Promise<TempusResult<T>> {
    if (!this.auth.user) return { ok: false, status: 401, message: "Sign in to use Tempus." };
    try {
      return { ok: true, data: await run() };
    } catch (error) {
      if (error instanceof APIError) return { ok: false, status: error.status, message: error.message };
      if (error instanceof Error && error.name === "TimeoutError") {
        return { ok: false, status: 0, message: "Tempus took too long to answer. Try again." };
      }
      return { ok: false, status: 0, message: error instanceof Error ? error.message : "Couldn't reach Tempus." };
    }
  }

  async connectGoogleCalendar() {
    try {
      const linked = await this.calendars.connectGoogle();
      if (linked) {
        this.statusMessage = "Google Calendar connected.";
        this.updateSettings({ showCalendarEvents: true });
        this.refreshCalendarEvents();
      }
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Couldn't connect Google Calendar.";
      this.broadcast();
    }
  }

  async disconnectGoogleCalendar(id: number) {
    try {
      await this.calendars.disconnectGoogle(id);
      this.refreshCalendarEvents();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Couldn't disconnect Google Calendar.";
      this.broadcast();
    }
  }

  async requestAppleCalendarAccess() {
    const access = await this.calendars.requestAppleAccess();
    if (access === "fullAccess") this.updateSettings({ showCalendarEvents: true });
    return access;
  }

  async setCalendarSelected(payload: { provider: CalendarProvider; id: string; selected: boolean }) {
    try {
      await this.calendars.setSelected(payload.provider, payload.id, payload.selected);
      // Apple choices are settings, which refresh events on their own.
      if (payload.provider === "google") this.refreshCalendarEvents();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Couldn't update that calendar.";
      this.broadcast();
    }
  }

  /** Re-read events after the calendar choices changed. */
  refreshCalendarEvents() {
    if (this.navigation === "calendar") void this.refreshVisibleRange();
  }

  /** Requests AI titles for the visible finished sessions, polling while any are queued. */
  scheduleTimesheetSummaries(delay = TIMESHEET_SUMMARY_DEBOUNCE_MS) {
    if (this.timesheetSummaryTimer) clearTimeout(this.timesheetSummaryTimer);
    this.timesheetSummaryTimer = null;
    if (!this.showsSessions() || !this.api.getTokens()) return;
    this.timesheetSummaryTimer = setTimeout(() => {
      this.timesheetSummaryTimer = null;
      void this.requestTimesheetSummaries();
    }, delay);
  }

  private async requestTimesheetSummaries() {
    if (this.timesheetSummaryInFlight || !this.showsSessions() || !this.api.getTokens()) return;
    const now = Date.now();
    const rows = buildTimesheetRows({
      timelines: this.dataView().timelines,
      // Skipped sessions leave the Timesheet but still show elsewhere, so they need titles too.
      workspace: { ...this.calendarWorkspace, skippedBlockIds: [] },
      summaries: this.timesheetSummaries,
      isLive: (block) => isOngoingBlock(block, now, this.tracker.isTracking),
    });
    const blocks = blocksNeedingSummaries(rows, this.timesheetSummaries).slice(0, TIMESHEET_SUMMARY_BATCH);
    if (!blocks.length) return;
    this.timesheetSummaryInFlight = true;
    let waiting = false;
    try {
      const results = await this.api.timesheetSummaries(blocks.map(timesheetEntryPayload));
      const next = { ...this.timesheetSummaries };
      for (const result of results) {
        next[result.entry_id] = { status: result.status, summary: result.summary };
        if (result.status === "pending" || result.status === "processing") waiting = true;
      }
      this.timesheetSummaries = next;
      saveTimesheetSummaries(next);
      this.broadcast();
    } catch (error) {
      logObservability(`Timesheet summaries failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.timesheetSummaryInFlight = false;
    }
    if (waiting) this.scheduleTimesheetSummaries(TIMESHEET_SUMMARY_POLL_MS);
  }

  private timelineTicks = 0;

  startTimelineRefresh() {
    if (this.timelineTimer) clearInterval(this.timelineTimer);
    this.timelineTimer = setInterval(() => {
      // The tracker sends its own heartbeat each minute while it is tracking.
      if (this.auth.user && !this.tracker.isTracking) void this.tracker.heartbeat();
      // Picks up ratings the server finished in the background or made on other devices.
      if (this.auth.user && this.settings.syncEnabled) void this.loadJevRatings();
      // Every five minutes, pick up workspace edits made on other devices.
      if (++this.timelineTicks % 5 === 0) void this.workspaceSync.pull();
      if (!["today", "timer", "calendar", "timesheet", "insights", "trend", "agent"].includes(this.navigation)) return;
      if (this.anyWindowVisible()) void this.refreshVisibleRange();
      else this.timelineRefreshDeferred = true;
    }, 60_000);
  }

  startHelperRefresh() {
    if (this.helperTimer) clearInterval(this.helperTimer);
    let ticks = 0;
    this.helperTimer = setInterval(() => {
      ticks += 1;
      void this.refreshBlockingHelper(ticks % 4 === 0, true);
    }, 15_000);
  }

  async restoreSession() {
    const tokens = this.api.getTokens();
    if (!tokens) return;
    this.auth.loading = true;
    this.broadcast();
    try {
      this.auth.user = await this.api.me();
      saveSessionUser(this.auth.user);
      this.setAuthStatus(`Signed in as ${this.auth.user.email}`);
      this.auth.mfaChallenge = null;
      void this.loadJevRatings();
      this.refreshCalendars();
    } catch {
      if (!this.api.getTokens()) {
        this.auth.user = null;
        this.setAuthStatus("Session expired. Sign in again.", "error");
      } else if (this.auth.user) {
        this.setAuthStatus(`Signed in as ${this.auth.user.email}`);
      } else {
        this.setAuthStatus("Still signed in. The server could not be reached.");
      }
    } finally {
      this.auth.loading = false;
      this.broadcast();
    }
  }

  /** Sets the sign-in form message; `error` shows it as an alert. */
  private setAuthStatus(message: string, tone: AuthUiState["statusTone"] = "info") {
    this.auth.statusMessage = message;
    this.auth.statusTone = tone;
  }

  async login() {
    const error = signInError(this.auth.email, this.auth.password);
    if (error) {
      this.setAuthStatus(error, "error");
      this.broadcast();
      return;
    }
    this.auth.loading = true;
    this.broadcast();
    try {
      const result = await this.api.login({
        email: normalizedEmail(this.auth.email),
        password: this.auth.password,
      });
      await this.handleAuthResult(result, "Signed in");
    } catch (error) {
      this.setAuthStatus(error instanceof Error ? error.message : "Sign in failed.", "error");
    } finally {
      this.auth.loading = false;
      this.broadcast();
    }
  }

  async register() {
    const error = signUpError(
      this.auth.email,
      this.auth.password,
      this.auth.confirmPassword,
      this.auth.phoneNumber,
    );
    if (error) {
      this.setAuthStatus(error, "error");
      this.broadcast();
      return;
    }
    this.auth.loading = true;
    this.broadcast();
    try {
      const result = await this.api.register({
        email: normalizedEmail(this.auth.email),
        password: this.auth.password,
        phone_number: this.auth.phoneNumber.trim() || undefined,
      });
      await this.handleAuthResult(result, "Account created");
    } catch (error) {
      this.setAuthStatus(error instanceof Error ? error.message : "Registration failed.", "error");
    } finally {
      this.auth.loading = false;
      this.broadcast();
    }
  }

  async verifyMfa() {
    if (!this.auth.mfaChallenge) return;
    this.auth.loading = true;
    this.broadcast();
    try {
      const tokens = await this.api.verifyMFA({
        token: this.auth.mfaChallenge.mfa_token,
        code: this.auth.useBackupCode ? this.auth.backupCode : this.auth.mfaCode,
        method: this.auth.useBackupCode ? "backup_code" : this.auth.mfaChallenge.mfa_method,
      });
      this.api.setTokens(tokens);
      this.auth.mfaChallenge = null;
      this.auth.user = await this.api.me();
      saveSessionUser(this.auth.user);
      this.setAuthStatus(`Signed in as ${this.auth.user.email}`);
      void this.loadJevRatings();
      this.refreshCalendars();
      await this.syncPending();
      await this.refreshVisibleRange();
      await this.refreshBlockingHelper(true);
    } catch (error) {
      this.setAuthStatus(error instanceof Error ? error.message : "Verification failed.", "error");
    } finally {
      this.auth.loading = false;
      this.broadcast();
    }
  }

  async resendOtp() {
    if (!this.auth.mfaChallenge) return;
    try {
      await this.api.resendOTP(this.auth.mfaChallenge.mfa_token);
      this.setAuthStatus("A new code is on the way.");
    } catch (error) {
      this.setAuthStatus(error instanceof Error ? error.message : "Could not resend code.", "error");
    }
    this.broadcast();
  }

  logout() {
    this.api.setTokens(null);
    this.auth = { ...defaultAuth(), email: this.auth.email };
    this.blocking = defaultBlocking(this.helper);
    this.statusMessage = "Signed out";
    this.summaryCache.clear();
    this.tracker.clearRangeCache();
    this.tracker.jevSync.reset();
    this.workspaceSync.reset();
    this.calendars.reset();
    this.calendarEvents = [];
    this.broadcast();
  }

  /**
   * Loads this account's Jev ratings from the server. The first time, ratings older
   * versions saved on disk are uploaded and the files and the old API key removed.
   */
  private async loadJevRatings() {
    if (!this.jevMigrated) this.jevMigrated = await migrateLocalJevRatings(this.api);
    await this.tracker.jevSync.pull();
    this.broadcast();
  }

  private jevMigrated = false;

  updateSettings(patch: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.api.setBaseUrl(this.settings.apiBaseUrl);
    if (patch.launchAtLogin !== undefined) syncLaunchAtLogin(this.settings.launchAtLogin);
    if (patch.desktopWidgetVisible !== undefined) this.syncDesktopWidget();
    if (patch.showCalendarEvents !== undefined || patch.appleCalendarIds !== undefined) this.refreshCalendarEvents();
    if (patch.distractionResponse !== undefined) {
      this.syncClassifierWatch();
      if (this.latestForeground) this.considerDistractionNudge(this.latestForeground);
    }
    this.broadcast();
  }

  async setTimeZone(timeZone: string) {
    if (!this.auth.user) {
      this.statusMessage = "Sign in to save a time zone.";
      this.broadcast();
      return;
    }
    try {
      this.auth.user = await this.api.setTimeZone(timeZone);
      saveSessionUser(this.auth.user);
      this.leaderboard.day = toDateInput(new Date(), this.effectiveTimeZone());
      this.statusMessage = timeZone
        ? `Time zone set to ${timeZone}.`
        : "Time zone follows this computer.";
      await this.refreshVisibleRange();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Could not save time zone.";
      this.broadcast();
    }
  }

  addTimerBonus(seconds = TIMER_BONUS_STEP_SECONDS) {
    const day = toDateInput(new Date(), this.effectiveTimeZone());
    const current = this.settings.timerBonusDay === day ? this.settings.timerBonusSeconds : 0;
    this.updateSettings({
      timerBonusSeconds: current + Math.max(0, seconds),
      timerBonusDay: day,
    });
  }

  setCalendarView(view: CalendarView) {
    this.calendarView = view;
    void this.refreshVisibleRange();
  }

  setTodayPeriod(_period: TodayPeriod) {
    this.todayPeriod = "day";
    void this.refreshVisibleRange();
  }

  setTodayTab(tab: string) {
    this.todayTab = normalizeTodayTab(tab);
    this.broadcast();
  }

  setInsightsTab(tab: string) {
    this.insightsTab = normalizeInsightsTab(tab);
    this.broadcast();
  }

  setInsightsDevice(key: string) {
    this.insightsDeviceKey = key;
    this.broadcast();
  }

  setTodayDevice(key: string) {
    this.todayDeviceKey = key;
    this.broadcast();
  }

  persistWorkspace() {
    saveCalendarWorkspace(this.calendarWorkspace);
    this.workspaceSync.markChanged();
    this.broadcast();
  }

  mutateWorkspace(mutate: (workspace: typeof this.calendarWorkspace) => typeof this.calendarWorkspace) {
    this.calendarWorkspace = mutate(this.calendarWorkspace);
    this.persistWorkspace();
  }

  upsertCalendarLabel(patch: Partial<CalendarLabel> & Pick<CalendarLabel, "name">) {
    this.mutateWorkspace((workspace) => upsertLabel(workspace, patch));
  }

  deleteCalendarLabel(id: string) {
    this.mutateWorkspace((workspace) => deleteLabel(workspace, id));
  }

  upsertCalendarTask(patch: Partial<CalendarTask> & Pick<CalendarTask, "title" | "start" | "end">) {
    this.mutateWorkspace((workspace) => upsertTask(workspace, patch));
  }

  deleteCalendarTask(id: string) {
    this.mutateWorkspace((workspace) => deleteTask(workspace, id));
  }

  assignCalendarLabel(patch: Partial<CalendarAssignment> & Pick<CalendarAssignment, "start" | "end" | "labelId">) {
    this.mutateWorkspace((workspace) => assignLabel(workspace, patch));
  }

  clearCalendarAssignment(id: string) {
    this.mutateWorkspace((workspace) => clearAssignment(workspace, id));
  }

  reviewCalendarBlock(payload: { block: Pick<ScreenTimeSessionBlock, "id" | "start" | "end">; labelId: string }) {
    this.mutateWorkspace((workspace) => reviewBlock(workspace, payload.block, payload.labelId));
  }

  skipCalendarBlock(blockId: string) {
    this.mutateWorkspace((workspace) => skipBlock(workspace, blockId));
  }

  approveTimesheetEntries(blocks: Array<Pick<ScreenTimeSessionBlock, "id" | "start" | "end" | "category">>) {
    this.mutateWorkspace((workspace) => approveBlocks(workspace, blocks));
  }

  unapproveTimesheetEntry(blockId: string) {
    this.mutateWorkspace((workspace) => unapproveBlock(workspace, blockId));
  }

  assignCalendarLabelToApp(payload: { appKey: string; labelId: string }) {
    const segments = this.snapshot().snapshot.listSegments;
    this.mutateWorkspace((workspace) => assignLabelToApp(workspace, segments, payload.appKey, payload.labelId));
  }

  dismissCalendarReview(unlabeledIds: string[]) {
    this.reviewBarDismissedIds = unlabeledIds;
    this.broadcast();
  }

  setDeviceVisible(key: string, visible: boolean) {
    if (visible) this.hiddenDeviceKeys.delete(key);
    else this.hiddenDeviceKeys.add(key);
    saveHiddenKeys(this.hiddenDeviceKeys);
    this.broadcast();
  }

  async setDeviceNickname(deviceID: string, nickname: string) {
    if (!this.auth.user) {
      this.statusMessage = "Sign in on the Account screen to rename devices.";
      this.broadcast();
      return;
    }
    try {
      await this.api.updateDevice(deviceID, { label: nickname.trim() });
      this.statusMessage = "Device nickname updated.";
      await this.tracker.refreshDevices();
      await this.refreshBlocking();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Could not update device nickname.";
      this.broadcast();
    }
  }

  async deleteDevice(deviceID: string) {
    if (!this.auth.user) {
      this.statusMessage = "Sign in on the Account screen to remove devices.";
      this.broadcast();
      return;
    }
    if (deviceID && deviceID === this.tracker.localDeviceId) {
      this.statusMessage = "This computer is running Stop Scrolling, so it stays connected.";
      this.broadcast();
      return;
    }
    try {
      const removed = this.tracker.registeredDevices.find((device) => device.device_id === deviceID);
      await this.api.deleteDevice(deviceID);
      if (removed) {
        this.hiddenDeviceKeys.delete(deviceKey(removed.device_platform, removed.device_name));
        saveHiddenKeys(this.hiddenDeviceKeys);
      }
      this.statusMessage = "Device removed.";
      await this.refreshVisibleRange();
      await this.refreshBlocking();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Could not remove device.";
      this.broadcast();
    }
  }

  selectInspector(payload: InspectorSelection) {
    this.inspector = inspectorFromSelection(payload);
    this.broadcast();
  }

  /** `quiet` skips rebuilding the tray and app menus when blocking state is unchanged, as on the 15 s poll. */
  async refreshBlockingHelper(fetchPolicy = false, quiet = false) {
    if (!this.auth.user || !this.api.getTokens()) {
      this.clearLocalEnforcement();
      await this.helper.refreshStatus();
      await this.loadInventoryOnce();
      this.syncHelperSnapshot(quiet);
      return;
    }
    let policy: BlockingPolicyResponse | null = null;
    try {
      if (fetchPolicy) {
        const deviceID = await this.tracker.registerLocalDevice();
        const [fetched, publicKey] = await Promise.all([
          this.api.deviceBlockingPolicy(deviceID),
          this.api.blockingPublicKey(),
        ]);
        if (fetched.algorithm !== "Ed25519" || publicKey.algorithm !== "Ed25519" || fetched.kid !== publicKey.kid) {
          throw new Error("Blocking policy signing key does not match the advertised public key.");
        }
        policy = fetched;
        try {
          if (policy.signature !== this.lastPolicySignature) {
            await this.helper.applyPolicy(policy);
            this.lastPolicySignature = policy.signature;
          } else {
            await this.helper.refreshStatus();
          }
        } catch (error) {
          logObservability(`Blocking helper apply failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        try {
          await this.helper.refreshStatus();
        } catch (error) {
          logObservability(`Blocking helper status failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      logObservability(`Blocking policy refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const helperLive = this.helper.status.available && this.helper.status.connected;
    if (policy && helperLive && this.networkFilterIsEnforcing()) {
      this.clearLocalEnforcement();
      const activeID = this.helper.status.activeOccurrenceID;
      this.blocking.activeOccurrence =
        policy.occurrences.find((occurrence) => occurrence.occurrence_id === activeID) ?? null;
      this.scheduleBoundaryRefresh(policy.occurrences);
    } else if (policy) {
      this.localEnforcer.setPolicy(policy);
      this.usingLocalEnforcement = true;
      this.publishLocalEnforcement();
      this.scheduleBoundaryRefresh(policy.occurrences);
    } else if (this.usingLocalEnforcement) {
      this.publishLocalEnforcement();
    }
    await this.loadInventoryOnce();
    this.syncHelperSnapshot(quiet);
  }

  async refreshBlockingInventory() {
    const loaded = await this.helper.refreshInventory();
    if (loaded) this.inventoryLoaded = true;
    this.syncHelperSnapshot();
  }

  private async loadInventoryOnce() {
    if (this.inventoryLoaded) return;
    if (!this.helper.status.available || !this.helper.status.connected) return;
    this.inventoryLoaded = await this.helper.refreshInventory();
  }

  async cancelNormalSession(payload: { scheduleID: string; occurrenceID: string }) {
    if (!this.auth.user) throw new Error("Sign in to end a blocking session.");
    if (this.helper.status.strictOccurrenceIDs.includes(payload.occurrenceID)) {
      throw new Error("Strict Mode sessions cannot be ended normally.");
    }
    const deviceID = await this.tracker.registerLocalDevice();
    const result = await this.api.endNormalOccurrence(payload.scheduleID, deviceID);
    try {
      await this.helper.cancelNormal(result.occurrence_id);
    } catch (error) {
      logObservability(`Native normal cancellation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.lastPolicySignature = null;
    await this.refreshBlockingHelper(true);
    return result;
  }

  async redeemBlockingBypass(input: BypassRedeemInput) {
    await this.helper.redeemBypass(input.token);
    const result = await this.api.redeemBypass(input);
    this.syncHelperSnapshot();
    return result;
  }

  hasHelperConfirmedStrictMode() {
    if (!this.helper.status.strictMode) return false;
    const end = this.blocking.activeOccurrence ? Date.parse(this.blocking.activeOccurrence.end_at) : Number.POSITIVE_INFINITY;
    return end > Date.now();
  }

  syncPending() {
    return Promise.all([this.tracker.flushOutbox(), this.gameSync.flush()]);
  }

  async shutdown() {
    if (this.helperTimer) clearInterval(this.helperTimer);
    if (this.helperBoundaryTimer) clearTimeout(this.helperBoundaryTimer);
    this.stopBlockWatch();
    this.stopClassifierWatch();
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    if (this.hiddenWidgetTimer) clearTimeout(this.hiddenWidgetTimer);
    if (this.nativeWidgetTimer) clearTimeout(this.nativeWidgetTimer);
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
    this.gameSync.stop();
    await Promise.all([this.tracker.shutdown(), this.helper.close()]);
  }

  private syncHelperSnapshot(quietIfUnchanged = false) {
    const helperLive = this.helper.status.available && this.helper.status.connected;
    this.blocking.installedApplications = this.helper.inventory;
    this.blocking.hostSetup = this.helper.hostSetup;
    if (helperLive && this.networkFilterIsEnforcing()) this.clearLocalEnforcement();
    if (!this.usingLocalEnforcement) {
      this.blocking.enforcement = this.helper.status;
      this.blocking.capabilities = this.helper.capabilities;
      if (!this.helper.status.activeOccurrenceID) this.blocking.activeOccurrence = null;
    }
    // The poll's broadcast also advances the live session on screen; only the menus are skipped.
    if (this.blockingChanged() || !quietIfUnchanged) this.onBlockingStateChanged?.();
    this.broadcast();
  }

  private blockingSignature = "";
  private blockingInventory: unknown = null;

  /** True when blocking state differs from the last check, ignoring `checkedAt` timestamps. */
  private blockingChanged() {
    const { installedApplications, ...rest } = this.blocking;
    const signature = JSON.stringify(rest, (key, value) => (key === "checkedAt" ? undefined : value));
    const changed = signature !== this.blockingSignature || installedApplications !== this.blockingInventory;
    this.blockingSignature = signature;
    this.blockingInventory = installedApplications;
    return changed;
  }

  private networkFilterIsEnforcing() {
    return this.helper.hostSetup?.networkFilterApproved === true;
  }

  private clearLocalEnforcement() {
    this.usingLocalEnforcement = false;
    this.stopBlockWatch();
    this.localEnforcer.clear();
    this.hideBlockFreedom();
  }

  private startBlockWatch() {
    this.blockWatchOn = true;
    this.syncBrowserWatch();
  }

  private stopBlockWatch() {
    this.blockWatchOn = false;
    this.syncBrowserWatch();
  }

  private syncClassifierWatch() {
    if (this.distractionResponse() === "block") this.startClassifierWatch();
    else this.stopClassifierWatch();
  }

  private startClassifierWatch() {
    this.classifierWatchOn = true;
    this.syncBrowserWatch();
  }

  private stopClassifierWatch() {
    this.classifierWatchOn = false;
    this.syncBrowserWatch();
  }

  private syncBrowserWatch() {
    const wanted = this.blockWatchOn || this.classifierWatchOn;
    if (wanted && !this.browserWatchTimer) {
      this.browserWatchTimer = setInterval(() => {
        let tab: ReturnType<typeof readFocusedBrowserContext> | undefined;
        const readTab = () => (tab ??= readFocusedBrowserContext());
        if (this.blockWatchOn) this.watchBlockedBrowser(readTab);
        if (this.classifierWatchOn) this.watchClassifierBrowser(readTab);
      }, 250);
    } else if (!wanted && this.browserWatchTimer) {
      clearInterval(this.browserWatchTimer);
      this.browserWatchTimer = null;
    }
  }

  /** Re-read the focused tab so Back from the block page is redirected again. */
  private watchClassifierBrowser(readTab = readFocusedBrowserContext) {
    if (this.distractionResponse() !== "block") return;
    const latest = this.latestForeground;
    if (!latest || (!looksLikeBrowser(latest.bundleID) && !looksLikeBrowser(latest.appName))) return;
    try {
      const tab = readTab();
      if (!tab.url) return;
      if (tab.appName && latest.appName && tab.appName.toLowerCase() !== latest.appName.toLowerCase()) return;
      this.considerDistractionNudge({
        appName: latest.appName,
        bundleID: latest.bundleID,
        title: tab.title || latest.title,
        url: tab.url,
      });
    } catch (error) {
      logObservability(`Jev block watch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private watchBlockedBrowser(readTab = readFocusedBrowserContext) {
    if (!this.usingLocalEnforcement || !this.localEnforcer.activeOccurrence()) return;
    const latest = this.latestForeground;
    if (!latest || (!looksLikeBrowser(latest.bundleID) && !looksLikeBrowser(latest.appName))) return;
    try {
      const tab = readTab();
      if (!tab.url) return;
      if (tab.appName && latest.appName && tab.appName.toLowerCase() !== latest.appName.toLowerCase()) return;
      void this.localEnforcer.enforce({
        appName: latest.appName,
        bundleID: latest.bundleID,
        title: tab.title || latest.title,
        url: tab.url,
      });
    } catch (error) {
      logObservability(`Blocked-site watch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private publishLocalEnforcement() {
    const policy = this.localEnforcer.storedPolicy;
    const active = this.localEnforcer.activeOccurrence();
    this.blocking.activeOccurrence = active;
    if (!active) this.hideBlockFreedom();
    if (active && !this.askedForAccessibility && !isAccessibilityGranted()) {
      this.askedForAccessibility = true;
      requestAccessibilityAccess();
    }
    this.blocking.enforcement = {
      available: true,
      connected: true,
      protocolVersion: 1,
      policyVersion: policy?.policy_version ?? null,
      activeOccurrenceIDs: active ? [active.occurrence_id.toLowerCase()] : [],
      strictOccurrenceIDs: [],
      activeOccurrenceID: active ? active.occurrence_id.toLowerCase() : null,
      strictMode: false,
      policyExpiresAt: policy && Number.isFinite(Date.parse(policy.expires_at))
        ? Math.floor(Date.parse(policy.expires_at) / 1000)
        : null,
      lastError: null,
      checkedAt: new Date().toISOString(),
    };
    this.startBlockWatch();
    this.blocking.capabilities = {
      helperAvailable: false,
      policyEnforcement: true,
      applicationInventory: this.blocking.capabilities?.applicationInventory ?? false,
      normalCancellation: true,
      strictMode: false,
      bypassRedemption: false,
      reason: null,
    };
  }

  async activateNativeBlocking() {
    await this.helper.activateNativeSetup();
    await this.refreshBlockingHelper(true);
    return this.helper.hostSetup;
  }

  private scheduleBoundaryRefresh(occurrences: Array<{ start_at: string; end_at: string }>) {
    if (this.helperBoundaryTimer) clearTimeout(this.helperBoundaryTimer);
    const now = Date.now();
    const boundary = occurrences
      .flatMap((occurrence) => [Date.parse(occurrence.start_at), Date.parse(occurrence.end_at)])
      .filter((value) => Number.isFinite(value) && value >= now - 1_000)
      .sort((a, b) => a - b)[0];
    if (boundary === undefined) return;
    this.helperBoundaryTimer = setTimeout(
      () => void this.refreshBlockingHelper(true),
      Math.max(0, Math.min(boundary - now + 500, 2_147_483_647)),
    );
  }

  async refreshBlocking() {
    if (!this.auth.user) {
      this.clearLocalEnforcement();
      if (this.inspector.kind === "schedule") this.inspector = emptyInspector();
      this.blocking = {
        ...defaultBlocking(this.helper),
        statusMessage: "Sign in on the Account screen to manage sessions and blocklists.",
      };
      this.broadcast();
      return;
    }
    const generation = ++this.blockingRefreshGeneration;
    const started = performance.now();
    if (!this.blocking.schedules.length) {
      this.blocking.loading = true;
      this.broadcast();
    }
    try {
      const { blocklists, schedules, error } = await this.fetchBlockingLists();
      if (generation !== this.blockingRefreshGeneration) return;
      this.publishBlockingLists(blocklists, schedules, error);
      this.blocking.loading = false;
      this.broadcast();
      logObservability(error
        ? `Blocking lists failed to load: ${error}`
        : `Blocking sessions ready in ${(performance.now() - started).toFixed(0)}ms (${schedules?.length ?? 0} sessions)`);
      await this.refreshBlockingDevices();
      if (generation !== this.blockingRefreshGeneration) return;
      await this.refreshBlockingHelper(true);
    } catch (error) {
      if (generation !== this.blockingRefreshGeneration) return;
      this.blocking.statusMessage = error instanceof Error ? error.message : "Blocking data unavailable.";
      this.blocking.loading = false;
      this.broadcast();
    }
  }

  /** Warms session and blocklist lists during startup so the Blocking screen can paint immediately. */
  private async prefetchBlockingLists() {
    if (!this.auth.user) return;
    const generation = ++this.blockingRefreshGeneration;
    try {
      const { blocklists, schedules, error } = await this.fetchBlockingLists();
      if (generation !== this.blockingRefreshGeneration) return;
      this.publishBlockingLists(blocklists, schedules, error);
      this.blocking.loading = false;
      this.broadcast();
      if (error) logObservability(`Blocking sessions prefetch failed: ${error}`);
    } catch (error) {
      if (generation !== this.blockingRefreshGeneration) return;
      logObservability(`Blocking sessions prefetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private fetchBlockingLists() {
    if (this.blockingListsTask) return this.blockingListsTask;
    const reason = (result: PromiseSettledResult<unknown>) => (
      result.status === "rejected"
        ? result.reason instanceof Error ? result.reason.message : String(result.reason)
        : null
    );
    const task = Promise.allSettled([
      this.api.blocklists(),
      this.api.blockingSchedules(),
    ]).then(([blocklists, schedules]) => {
      const failures = [
        reason(schedules) ? `Sessions: ${reason(schedules)}` : "",
        reason(blocklists) ? `Blocklists: ${reason(blocklists)}` : "",
      ].filter(Boolean);
      return {
        blocklists: blocklists.status === "fulfilled" ? blocklists.value : null,
        schedules: schedules.status === "fulfilled" ? schedules.value : null,
        error: failures.length ? failures.join(" · ") : null,
      };
    }).finally(() => {
      if (this.blockingListsTask === task) this.blockingListsTask = null;
    });
    this.blockingListsTask = task;
    return task;
  }

  private publishBlockingLists(
    blocklists: BlockingUiState["blocklists"] | null,
    schedules: BlockingUiState["schedules"] | null,
    error: string | null = null,
  ) {
    if (blocklists) this.blocking.blocklists = blocklists;
    if (schedules) this.blocking.schedules = schedules;
    this.blocking.loadError = error;
    this.blocking.failedLists = [
      ...(schedules ? [] : ["schedules" as const]),
      ...(blocklists ? [] : ["blocklists" as const]),
    ];
    this.blocking.statusMessage = error
      ? ""
      : `${this.blocking.schedules.length} sessions · ${this.blocking.blocklists.length} blocklists`;
    if (schedules && this.inspector.kind === "schedule" && this.inspector.schedule) {
      const next = schedules.find((item) => item.schedule_id === this.inspector.schedule?.schedule_id);
      this.inspector = next
        ? inspectorFromSelection({ kind: "schedule", schedule: next })
        : emptyInspector();
    }
  }

  private async refreshBlockingDevices() {
    try {
      const [devices, status] = await Promise.all([
        this.api.devices(),
        this.api.deviceStatus(),
      ]);
      this.tracker.registeredDevices = devices;
      this.tracker.deviceStatus = status;
      this.broadcast();
    } catch (error) {
      logObservability(`Blocking device refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createBlocklist(input: BlocklistWritePayload) {
    if (!this.auth.user) {
      this.blocking.statusMessage = "Sign in on the Account screen to create blocklists.";
      this.broadcast();
      return;
    }
    try {
      await this.api.createBlocklist(input);
      this.statusMessage = "Blocklist created.";
      await this.refreshBlocking();
    } catch (error) {
      this.blocking.statusMessage = error instanceof Error ? error.message : "Could not create blocklist.";
      this.broadcast();
    }
  }

  async updateBlocklist(input: BlocklistUpdatePayload) {
    if (!this.auth.user) {
      this.blocking.statusMessage = "Sign in on the Account screen to edit blocklists.";
      this.broadcast();
      return;
    }
    try {
      const { blocklist_id, ...payload } = input;
      await this.api.updateBlocklist(blocklist_id, payload);
      this.statusMessage = "Blocklist updated.";
      await this.refreshBlocking();
    } catch (error) {
      this.blocking.statusMessage = error instanceof Error ? error.message : "Could not update blocklist.";
      this.broadcast();
    }
  }

  private blockScreenDir() {
    const dir = join(userDataDir(), "block-screens");
    setBlockScreenMediaRoot(dir);
    return dir;
  }

  previewBlockScreen() {
    this.prepareFreedomScreen("");
    showFreedomScreen();
  }

  previewDistractionPopup(label: string, site: string) {
    showNudgeCard(label, site, () => hideNudgeCard());
  }

  private prepareFreedomScreen(scheduleId: string) {
    const dir = this.blockScreenDir();
    const resolved = resolveBlockScreen(scheduleId, loadBlockScreens(dir));
    setFreedomContent({
      header: resolved.header,
      detail: resolved.detail,
      imagePath: blockScreenImagePath(dir, resolved.imageFile),
    });
  }

  private async blockScreenBaseUrl() {
    try {
      return await freedomPageUrl();
    } catch {
      return "";
    }
  }

  async blockScreens() {
    const dir = this.blockScreenDir();
    const store = loadBlockScreens(dir);
    const base = await this.blockScreenBaseUrl();
    const sessions: Record<string, ReturnType<typeof presentBlockScreen>> = {};
    for (const [id, fields] of Object.entries(store.sessions)) {
      sessions[id] = presentBlockScreen(base, fields);
    }
    return { default: presentBlockScreen(base, store.default), sessions };
  }

  async blockScreenPresets() {
    const base = await this.blockScreenBaseUrl();
    return listBlockScreenPresets().map((item) => ({
      id: item.file,
      label: item.label,
      imageUrl: base ? `${base}presets/${encodeURIComponent(item.file)}` : "",
    }));
  }

  async chooseBlockScreenImage(sourcePath: string) {
    const dir = this.blockScreenDir();
    const imageFile = importBlockScreenImage(dir, sourcePath);
    const base = await this.blockScreenBaseUrl();
    return presentBlockScreen(base, { imageFile, header: "", detail: "" });
  }

  async saveDefaultScreen(fields: BlockScreenFields) {
    const dir = this.blockScreenDir();
    const store = saveDefaultBlockScreen(dir, fields);
    const base = await this.blockScreenBaseUrl();
    return presentBlockScreen(base, store.default);
  }

  async nudgeReminder() {
    const dir = this.blockScreenDir();
    const reminder = loadBlockScreens(dir).reminder;
    const base = await this.blockScreenBaseUrl();
    return presentBlockScreen(base, { imageFile: reminder.imageFile, header: "", detail: reminder.detail });
  }

  async saveReminder(fields: { imageFile: string; detail: string }) {
    const dir = this.blockScreenDir();
    const reminder = saveNudgeReminder(dir, fields);
    const base = await this.blockScreenBaseUrl();
    return presentBlockScreen(base, { imageFile: reminder.imageFile, header: "", detail: reminder.detail });
  }

  async saveSessionScreen(scheduleId: string, fields: BlockScreenFields) {
    const dir = this.blockScreenDir();
    saveSessionBlockScreen(dir, scheduleId, fields);
    return this.blockScreens();
  }

  async createBlockingSchedule(input: BlockingScheduleWritePayload): Promise<{ ok: true; scheduleId: string } | { ok: false; message: string }> {
    if (!this.auth.user) {
      const message = "Sign in on the Account screen to create sessions.";
      this.blocking.statusMessage = message;
      this.broadcast();
      return { ok: false, message };
    }
    try {
      const created = await this.api.createBlockingSchedule(input);
      this.statusMessage = "Session created.";
      await this.refreshBlocking();
      return { ok: true, scheduleId: created.schedule_id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create session.";
      logObservability(`Blocking session create failed: ${message}`);
      this.blocking.statusMessage = message;
      this.broadcast();
      return { ok: false, message };
    }
  }

  async updateBlockingSchedule(input: BlockingScheduleUpdatePayload) {
    if (!this.auth.user) {
      this.blocking.statusMessage = "Sign in on the Account screen to edit sessions.";
      this.broadcast();
      return;
    }
    try {
      const { schedule_id, ...payload } = input;
      await this.api.updateBlockingSchedule(schedule_id, payload);
      this.statusMessage = "Session updated.";
      await this.refreshBlocking();
    } catch (error) {
      this.blocking.statusMessage = error instanceof Error ? error.message : "Could not update session.";
      this.broadcast();
    }
  }

  async deleteBlockingSchedule(scheduleId: string) {
    if (!this.auth.user) {
      this.blocking.statusMessage = "Sign in on the Account screen to delete sessions.";
      this.broadcast();
      return;
    }
    try {
      await this.api.deleteBlockingSchedule(scheduleId);
      saveSessionBlockScreen(this.blockScreenDir(), scheduleId, { imageFile: "", header: "", detail: "" });
      this.statusMessage = "Session deleted.";
      this.lastPolicySignature = null;
      await this.refreshBlocking();
    } catch (error) {
      this.blocking.statusMessage = error instanceof Error ? error.message : "Could not delete session.";
      this.broadcast();
    }
  }

  async refreshLeaderboard() {
    if (!this.auth.user) {
      this.leaderboard.statusMessage = "Sign in on the Account screen to view the friends leaderboard.";
      this.broadcast();
      return;
    }
    this.leaderboard.loading = true;
    this.broadcast();
    try {
      const [board, friends, requests] = await Promise.all([
        this.api.leaderboard({ period: this.leaderboard.period, day: this.leaderboard.day }),
        this.api.friends(),
        this.api.friendRequests(),
      ]);
      this.leaderboard.entries = board.results;
      this.leaderboard.friends = friends;
      this.leaderboard.requests = requests;
      this.leaderboard.statusMessage = `${board.count} people`;
    } catch (error) {
      this.leaderboard.statusMessage = error instanceof Error ? error.message : "Leaderboard unavailable.";
    } finally {
      this.leaderboard.loading = false;
      this.broadcast();
    }
  }

  private async handleAuthResult(result: Awaited<ReturnType<StopScrollingAPI["login"]>>, success: string) {
    if (isMfa(result)) {
      this.auth.mfaChallenge = result;
      this.setAuthStatus(result.message || "Enter the verification code.");
      return;
    }
    this.api.setTokens(result);
    this.auth.user = await this.api.me();
    saveSessionUser(this.auth.user);
    this.auth.mfaChallenge = null;
    this.setAuthStatus(`${success} as ${this.auth.user.email}`);
    void this.loadJevRatings();
    this.refreshCalendars();
    await this.syncPending();
    await this.refreshVisibleRange();
    await this.refreshBlockingHelper(true);
  }

  private deviceEntries(): DeviceListEntry[] {
    const byKey = new Map<string, DeviceListEntry>();
    for (const device of this.tracker.registeredDevices) {
      const status = this.tracker.deviceStatus.find((row) => row.device_id === device.device_id);
      const key = deviceKey(device.device_platform, device.device_name);
      byKey.set(
        key,
        withComputedOnline({
          visibilityKey: key,
          deviceName: this.displayDeviceName(device.device_platform, device.device_name),
          nickname: device.label ?? "",
          devicePlatform: device.device_platform,
          deviceID: device.device_id,
          sessionCount: device.session_count,
          timeZone: device.time_zone,
          lastSeenAt: device.last_seen_at,
          lastOnlineAt: status?.last_online_at ?? null,
          reportedOnline: status?.is_online ?? null,
          isRegistered: true,
          isLocal: device.device_id === this.tracker.localDeviceId,
          ...(typeof device.color_index === "number" ? { colorIndex: device.color_index } : {}),
        }),
      );
    }
    const extras = [
      ...this.observedDevices,
      ...this.tracker.serverEntries.map((entry) => observedDeviceRow(entry.platform, entry.deviceName, entry.timeZoneIdentifier)),
      observedDeviceRow(currentDevicePlatform(), localDeviceName(), this.effectiveTimeZone()),
    ];
    for (const device of extras) {
      if (!device.device_name) continue;
      const key = deviceKey(device.device_platform, device.device_name);
      if (byKey.has(key)) continue;
      byKey.set(
        key,
        withComputedOnline({
          visibilityKey: key,
          deviceName: this.displayDeviceName(device.device_platform, device.device_name),
          nickname: device.label ?? "",
          devicePlatform: device.device_platform,
          deviceID: device.device_id || null,
          sessionCount: device.session_count,
          timeZone: device.time_zone,
          lastSeenAt: device.last_seen_at,
          lastOnlineAt: null,
          reportedOnline: null,
          isRegistered: Boolean(device.device_id),
          isLocal: device.device_id === this.tracker.localDeviceId || key === deviceKey(currentDevicePlatform(), localDeviceName()),
        }),
      );
    }
    return Array.from(byKey.values()).sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.deviceName.localeCompare(b.deviceName));
  }

  /** Shows the Mac computer name instead of the hostname in the device picker. */
  private displayDeviceName(platform: string, name: string) {
    const resolved = resolvedDeviceName(platform, name);
    const host = localDeviceName();
    if (resolved === host || resolved === host.replace(/\.local$/, "")) {
      const friendly = localComputerName();
      if (friendly) return friendly;
    }
    return resolved;
  }

  /** Finds devices recorded on this Mac so the picker still works when the device API is down. */
  private scheduleDeviceIndex() {
    if (this.deviceIndexStarted) return;
    this.deviceIndexStarted = true;
    const days = this.tracker.history.listedDays().sort();
    const found = new Map<string, DeviceRow>();
    let index = 0;
    const step = () => {
      const stop = Math.min(index + 4, days.length);
      for (; index < stop; index += 1) {
        for (const identity of this.tracker.history.identitiesForDay(days[index])) {
          const key = deviceKey(identity.platform, identity.deviceName);
          if (found.has(key)) continue;
          found.set(key, observedDeviceRow(identity.platform, identity.deviceName, identity.timeZoneIdentifier));
        }
      }
      if (index < days.length) {
        setImmediate(step);
        return;
      }
      this.observedDevices = [...found.values()];
      this.broadcast();
    };
    setImmediate(step);
  }

  private applySummary(
    summary: PeriodSummaryResponse | null,
    bounds: { start: Date; end: Date },
    bucket = "",
    deviceId = "",
  ) {
    this.serverSummary = summary;
    this.serverSummaryRange = summary
      ? { start: bounds.start.getTime(), end: bounds.end.getTime(), bucket, deviceId }
      : null;
  }

  private rememberSummary(key: string, summary: PeriodSummaryResponse) {
    this.summaryCache.delete(key);
    this.summaryCache.set(key, summary);
    while (this.summaryCache.size > SUMMARY_CACHE_LIMIT) {
      const oldest = this.summaryCache.keys().next().value;
      if (oldest === undefined) break;
      this.summaryCache.delete(oldest);
    }
  }

  /** Warms Insights summaries so switching periods skips the loading state. */
  private schedulePrefetch() {
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
    this.prefetchTimer = setTimeout(() => {
      this.prefetchTimer = null;
      void this.prefetchInsightsRanges();
    }, PREFETCH_DELAY_MS);
  }

  /**
   * Day-over-day and week-over-week totals for the Trend screen.
   * A synced account uses one cached daily summary for the 14-day window and
   * does not replace the summary that draws the period chart. Offline totals
   * come from local history.
   */
  private trendComparisonsFor(zone: string, deviceKeyForNav: string): TrendComparisons | null {
    if (this.navigation !== "trend") {
      this.trendComparisonPending = false;
      return null;
    }
    const anchor = this.insightsAnchor;
    const window = trendComparisonWindow(anchor, zone);
    const syncing = Boolean(this.api.getTokens() && this.settings.syncEnabled);
    if (!syncing) {
      this.trendComparisonPending = false;
      const entries = filterEntriesForInsights(
        mergeEntries(
          this.tracker.mergedEntries(),
          this.tracker.history.overlapping(window.start, window.end),
        ),
        deviceKeyForNav,
        this.hiddenDeviceKeys,
      );
      return trendComparisonsFromDailyTotals(trackedSecondsByDay(entries, window, zone), anchor, zone);
    }
    const scope = this.insightSummaryScope();
    const key = rangeCacheKey(window, zone, "day", scope);
    const cached = this.summaryCache.get(key);
    if (cached || this.trendComparisonMiss?.key === key) {
      this.trendComparisonPending = false;
      const totals = cached?.tracked_seconds_by_day ?? this.trendComparisonMiss?.totals ?? {};
      return trendComparisonsFromDailyTotals(totals, anchor, zone);
    }
    this.trendComparisonPending = true;
    if (this.trendComparisonInflight !== key) {
      this.trendComparisonInflight = key;
      void this.fetchInsightSummary(window, zone, "day", scope).then((summary) => {
        if (this.trendComparisonInflight !== key) return;
        if (summary) this.rememberSummary(key, summary);
        else this.trendComparisonMiss = { key, totals: {} };
        this.trendComparisonPending = false;
        this.trendComparisonRevision += 1;
        this.broadcast();
      });
    }
    return null;
  }

  private insightBucket(navigation: NavigationItem = this.navigation): "day" | "month" | undefined {
    if (!usesInsightWindow(navigation) || this.insightsPeriod === "day") return undefined;
    return this.insightsPeriod === "year" ? "month" : "day";
  }

  private insightDeviceId(): string | undefined {
    if (this.insightsDeviceKey === ALL_DEVICES) return undefined;
    return this.tracker.registeredDevices.find(
      (device) => deviceKey(device.device_platform, device.device_name) === this.insightsDeviceKey,
    )?.device_id;
  }

  private localInsightChart(
    bounds: { start: Date; end: Date },
    zone: string,
    quiet = false,
  ): LocalInsightRollup | null {
    const key = `${bounds.start.getTime()}|${bounds.end.getTime()}|${zone}|${this.insightsDeviceKey}|${[...this.hiddenDeviceKeys].sort().join("\n")}`;
    if (this.localInsightRollup?.key === key) return this.localInsightRollup;
    this.scheduleLocalInsightRollup(key, bounds, zone);
    if (!quiet) this.insightChartPending = true;
    return null;
  }

  /** Rolls local sessions into daily totals a few days at a time so Insights stays responsive. */
  private scheduleLocalInsightRollup(
    key: string,
    bounds: { start: Date; end: Date },
    zone: string,
  ) {
    if (this.localInsightJobKey === key) return;
    this.localInsightJobKey = key;
    const job = ++this.localInsightJob;
    const days = this.tracker.history.daySpan(bounds.start, bounds.end);
    const totals: Record<string, number> = {};
    const appSeconds = new Map<string, { label: string; category: string; seconds: number }>();
    const categorySeconds = new Map<string, number>();
    const deviceDaySeconds = new Map<string, Map<string, number>>();
    const categoryCache = this.tracker.categoryCache();
    const hidden = this.hiddenDeviceKeys;
    const selected = this.insightsDeviceKey;
    const startMs = bounds.start.getTime();
    const endMs = bounds.end.getTime();
    let index = 0;
    const step = () => {
      if (job !== this.localInsightJob) return;
      const stop = Math.min(index + 3, days.length);
      for (; index < stop; index += 1) {
        for (const entry of this.tracker.history.entriesForDay(days[index])) {
          const device = deviceKey(entry.platform, entry.deviceName);
          if (hidden.has(device)) continue;
          if (selected !== ALL_DEVICES && device !== selected) continue;
          const entryStart = Date.parse(entry.startTimeUTC);
          const entryEnd = Date.parse(entry.endTimeUTC);
          const clipStart = entryStart > startMs ? entryStart : startMs;
          const clipEnd = entryEnd < endMs ? entryEnd : endMs;
          if (!(clipEnd > clipStart)) continue;
          const seconds = (clipEnd - clipStart) / 1000;
          const day = toDateInput(new Date(clipStart), zone);
          totals[day] = (totals[day] ?? 0) + seconds;
          const dayDevices = deviceDaySeconds.get(day) ?? new Map<string, number>();
          dayDevices.set(device, (dayDevices.get(device) ?? 0) + seconds);
          deviceDaySeconds.set(day, dayDevices);
          const label = entry.appName || "Unknown";
          const category = overlayCategory(
            entry.category || "Application",
            appBreakdownKey({ url: entry.url, appName: entry.appName, label: entry.title || label }),
            categoryCache,
          );
          categorySeconds.set(category, (categorySeconds.get(category) ?? 0) + seconds);
          const existing = appSeconds.get(label);
          appSeconds.set(label, {
            label,
            category: existing?.category || category,
            seconds: (existing?.seconds ?? 0) + seconds,
          });
        }
      }
      if (index < days.length) {
        setImmediate(step);
        return;
      }
      const totalSeconds = Object.values(totals).reduce((sum, seconds) => sum + seconds, 0);
      const apps = [...appSeconds.values()]
        .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
        .map((app, colorIndex) => ({
          key: app.label,
          label: app.label,
          subtitle: app.category,
          category: app.category,
          seconds: app.seconds,
          percentage: totalSeconds ? app.seconds / totalSeconds : 0,
          colorIndex,
        }));
      const categories = [...categorySeconds.entries()]
        .map(([category, seconds]) => ({
          category,
          seconds,
          percentage: totalSeconds ? seconds / totalSeconds : 0,
        }))
        .sort((a, b) => b.seconds - a.seconds || a.category.localeCompare(b.category));
      const devicesByDay: Record<string, Record<string, number>> = {};
      for (const [day, shares] of deviceDaySeconds) devicesByDay[day] = Object.fromEntries(shares);
      this.localInsightRollup = { key, totals, totalSeconds, apps, categories, devicesByDay };
      this.insightChartPending = false;
      this.broadcast();
    };
    setImmediate(step);
  }

  /** Week, month, and year Insights render from the summary instead of every session. */
  private usesInsightBuckets(navigation: NavigationItem = this.navigation): boolean {
    if (!this.insightBucket(navigation)) return false;
    if (!this.api.getTokens() || !this.settings.syncEnabled) return false;
    return true;
  }

  /**
   * Cache identity for the summary on screen.
   * Hidden devices cannot be removed from an all-devices total, so that view is the
   * visible device ids joined together and fetched one device at a time.
   */
  private insightSummaryScope(): string {
    if (this.insightsDeviceKey !== ALL_DEVICES) return this.insightDeviceId() ?? "";
    if (this.hiddenDeviceKeys.size === 0) return "";
    return this.visibleInsightDeviceIds().join(",");
  }

  private visibleInsightDeviceIds() {
    return this.tracker.registeredDevices
      .filter((device) => !this.hiddenDeviceKeys.has(deviceKey(device.device_platform, device.device_name)))
      .flatMap((device) => device.device_id ? [device.device_id] : [])
      .sort();
  }

  private async prefetchInsightsRanges() {
    if (!this.api.getTokens() || !this.settings.syncEnabled) return;
    const zone = this.effectiveTimeZone();
    const scope = this.insightSummaryScope();
    for (const period of ["week", "month", "year"] as const) {
      const bounds = periodBounds(period, this.insightsAnchor, zone);
      const bucket = period === "year" ? "month" : "day";
      const key = rangeCacheKey(bounds, zone, bucket, scope);
      if (this.summaryCache.has(key)) continue;
      const summary = await this.fetchInsightSummary(bounds, zone, bucket, scope);
      if (summary) this.rememberSummary(key, summary);
    }
  }

  private async fetchInsightSummary(
    bounds: { start: Date; end: Date },
    zone: string,
    bucket: "day" | "month" | undefined,
    scope: string,
  ) {
    if (!scope.includes(",")) return this.fetchPeriodSummary(bounds, zone, bucket, scope || undefined);
    const parts = await Promise.all(
      scope.split(",").map((deviceId) => this.fetchPeriodSummary(bounds, zone, bucket, deviceId)),
    );
    return mergePeriodSummaries(parts);
  }

  private async fetchPeriodSummary(
    bounds: { start: Date; end: Date },
    zone: string,
    bucket?: "day" | "month",
    deviceId?: string,
  ) {
    if (!this.api.getTokens() || !this.settings.syncEnabled) return null;
    const request = (withBucket: boolean) => this.api.periodSummary({
      start: bounds.start.toISOString(),
      end: bounds.end.toISOString(),
      time_zone: zone,
      include_daily_totals: true,
      bucket: withBucket ? bucket : undefined,
      device_id: deviceId,
    });
    try {
      return await request(Boolean(bucket));
    } catch {
      if (!bucket) return null;
      try {
        return await request(false);
      } catch {
        return null;
      }
    }
  }

  private mappedServerSummary(bounds: { start: Date; end: Date }, navigation: NavigationItem = this.navigation) {
    if (!this.serverSummary || !this.serverSummaryRange) return undefined;
    const bucket = this.usesInsightBuckets(navigation) ? (this.insightBucket(navigation) ?? "") : "";
    const deviceId = this.usesInsightBuckets(navigation) ? this.insightSummaryScope() : "";
    if (
      this.serverSummaryRange.start !== bounds.start.getTime() ||
      this.serverSummaryRange.end !== bounds.end.getTime() ||
      this.serverSummaryRange.bucket !== bucket ||
      this.serverSummaryRange.deviceId !== deviceId
    ) {
      return undefined;
    }
    return {
      totalSeconds: this.serverSummary.total_seconds,
      sessionCount: this.serverSummary.session_count,
      categories: this.serverSummary.categories,
      trackedSecondsByDay: this.serverSummary.tracked_seconds_by_day,
      buckets: this.serverSummary.buckets,
      apps: rankedAppsBySeconds((this.serverSummary.apps ?? []).map((app, index) => ({
        key: app.id ?? `${app.app_name ?? "app"}-${index}`,
        label: app.app_name ?? "Unknown",
        subtitle: app.browser_app || (app.is_website ? "Website" : app.category),
        category: app.category,
        seconds: app.seconds,
        percentage: app.percentage > 1 ? app.percentage / 100 : app.percentage,
        colorIndex: app.color_index ?? index,
      }))),
    };
  }
}

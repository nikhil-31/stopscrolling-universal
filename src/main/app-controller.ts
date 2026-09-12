import { BrowserWindow } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizedEmail, signInError, signUpError } from "@shared/auth-validation";
import {
  assignLabel,
  assignLabelToApp,
  buildCalendarDayStats,
  collectDayBlocks,
  clearAssignment,
  deleteLabel,
  deleteTask,
  reviewBlock,
  skipBlock,
  shouldShowReviewBar,
  type CalendarAssignment,
  type CalendarLabel,
  type CalendarTask,
  type CalendarView,
  upsertLabel,
  upsertTask,
} from "@shared/calendar-workspace";
import { deviceKey, resolvedDeviceName, withComputedOnline } from "@shared/device";
import { IPC } from "@shared/ipc";
import { localTimeZone, toDateInput } from "@shared/platform";
import { TIMER_BONUS_STEP_SECONDS, usesTodayWindow } from "@shared/timer";
import type { AppSnapshot, AuthUiState, BlockingUiState, InspectorSelection, LeaderboardUiState } from "@shared/snapshot";
import { emptyInspector, inspectorFromSelection } from "@shared/snapshot";
import {
  endOfMonth,
  entriesToTimelines,
  filterVisibleTimelines,
  normalizeTodayTab,
  periodBounds,
  snapshotFromEntries,
  snapshotFromRange,
  startOfMonth,
  todayPeriodBounds,
  trackedSecondsByDay,
} from "@shared/timeline";
import type {
  AppSettings,
  CalendarOverlayEvent,
  DeviceListEntry,
  InsightsPeriod,
  InsightsTab,
  NavigationItem,
  PeriodSummaryResponse,
  ScreenTimeSessionBlock,
  TodayPeriod,
  TodayTab,
  BlocklistWritePayload,
  BlocklistUpdatePayload,
  BlockingScheduleUpdatePayload,
  BlockingScheduleWritePayload,
} from "@shared/types";
import { isMfa, StopScrollingAPI } from "./api-client";
import { loadCalendarWorkspace, saveCalendarWorkspace } from "./calendar-workspace-store";
import { GoogleCalendarService } from "./google-calendar";
import { logObservability } from "./logger";
import { hiddenDevicesPath, networkLogPath, observabilityLogPath } from "./paths";
import { loadSettings, saveSettings } from "./settings-store";
import { clearTokens, loadTokens, saveTokens } from "./token-store";
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
  statusMessage: "Sign in or create an account to sync screen time with the backend.",
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

const defaultBlocking = (): BlockingUiState => ({
  schedules: [],
  blocklists: [],
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
  reviewBarDismissedIds: string[] = [];
  insightsPeriod: InsightsPeriod = "day";
  insightsAnchor = new Date();
  insightsTab: InsightsTab = "overview";
  inspector = emptyInspector();
  hiddenDeviceKeys = loadHiddenKeys();
  auth = defaultAuth();
  leaderboard = defaultLeaderboard();
  blocking = defaultBlocking();
  calendarEvents: CalendarOverlayEvent[] = [];
  commandPaletteOpen = false;
  serverSummary: PeriodSummaryResponse | null = null;
  serverSummaryRange: { start: number; end: number } | null = null;
  google = new GoogleCalendarService();
  api = new StopScrollingAPI(this.settings.apiBaseUrl, loadTokens(), (tokens) => {
    if (tokens) saveTokens(tokens);
    else clearTokens();
  });
  tracker = new ScreenTimeTracker(
    this.api,
    () => this.broadcast(),
    () => Boolean(this.settings.syncEnabled && this.api.getTokens()),
  );

  private windows = new Set<BrowserWindow>();
  private timelineTimer: NodeJS.Timeout | null = null;

  async boot() {
    await this.restoreSession();
    if (this.settings.startScreenTimeOnLaunch && process.env.STOPSCROLLING_UI_TEST !== "1") {
      await this.tracker.startTracking();
    }
    this.startTimelineRefresh();
    await this.refreshVisibleRange();
    logObservability("Bootstrap complete");
  }

  addWindow(win: BrowserWindow) {
    this.windows.add(win);
    win.on("closed", () => this.windows.delete(win));
    win.webContents.once("did-finish-load", () => {
      win.webContents.send(IPC.state, this.snapshot());
    });
  }

  visibleRange() {
    if (this.navigation === "calendar") {
      return { start: startOfMonth(this.calendarMonth), end: endOfMonth(this.calendarMonth) };
    }
    if (usesTodayWindow(this.navigation)) {
      return todayPeriodBounds(this.todayPeriod, this.todayDay);
    }
    if (this.navigation === "insights") return periodBounds(this.insightsPeriod, this.insightsAnchor);
    return periodBounds("day", this.todayDay);
  }

  snapshot(): AppSnapshot {
    if (this.navigation === "leaderboard" || this.navigation === "timer") this.navigation = "today";
    const entries = this.tracker.mergedEntries();
    const period = this.navigation === "insights" ? this.insightsPeriod : "day";
    const anchor =
      this.navigation === "insights"
        ? this.insightsAnchor
        : this.navigation === "calendar"
          ? this.calendarAnchor
          : this.todayDay;
    const todayBounds = todayPeriodBounds(this.todayPeriod, this.todayDay);
    const todayWindow = usesTodayWindow(this.navigation);
    const snapshotBounds = todayWindow
      ? todayBounds
      : periodBounds(period, anchor);
    const serverSummary = this.mappedServerSummary(snapshotBounds);
    const snapshot = todayWindow
      ? snapshotFromRange(entries, todayBounds, serverSummary)
      : snapshotFromEntries(entries, period, anchor, serverSummary);
    const extraDevices = this.tracker.registeredDevices.map((device) => ({
      platform: device.device_platform,
      name: device.device_name,
      timeZone: device.time_zone,
    }));
    const timelines = filterVisibleTimelines(
      entriesToTimelines(
        entries,
        this.navigation === "calendar" ? this.calendarAnchor : this.todayDay,
        extraDevices,
        todayWindow ? todayBounds : undefined,
      ),
      this.hiddenDeviceKeys,
    );
    const calendarTimelines = this.navigation === "calendar"
      ? timelines
      : filterVisibleTimelines(
          entriesToTimelines(entries, this.calendarAnchor, extraDevices),
          this.hiddenDeviceKeys,
        );
    const calendarDayStats = buildCalendarDayStats(
      this.calendarWorkspace,
      collectDayBlocks(calendarTimelines),
      this.calendarAnchor,
      this.settings.dailyWorkTargetSeconds || 8 * 60 * 60,
    );
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
      todayPeriod: this.todayPeriod,
      calendarAnchor: this.calendarAnchor.toISOString(),
      calendarMonth: this.calendarMonth.toISOString(),
      calendarView: this.calendarView,
      calendarWorkspace: this.calendarWorkspace,
      calendarDayStats,
      calendarReviewVisible: shouldShowReviewBar(
        calendarDayStats.unlabeledBlocks.map((block) => block.id),
        this.reviewBarDismissedIds,
      ),
      insightsPeriod: this.insightsPeriod,
      insightsAnchor: this.insightsAnchor.toISOString(),
      insightsTab: this.insightsTab,
      snapshot: this.navigation === "calendar"
        ? { ...snapshot, trackedSecondsByDay: trackedSecondsByDay(entries, this.calendarMonth) }
        : snapshot,
      timelines,
      loadingEntries: this.tracker.loadingEntries,
      entriesUnavailableReason: this.tracker.entriesUnavailableReason,
      devices: this.deviceEntries(),
      hiddenDeviceKeys: [...this.hiddenDeviceKeys],
      inspector: this.inspector,
      capabilities: this.tracker.capabilities(),
      calendarEvents: this.settings.showGoogleCalendarEvents ? this.calendarEvents : [],
      googleCalendarConnected: this.google.connected(),
      googleCalendarStatus: this.google.connected()
        ? "Showing Google Calendar events"
        : "Google Calendar not connected",
      logs: {
        network: networkLogPath(),
        observability: observabilityLogPath(),
      },
      leaderboard: this.leaderboard,
      blocking: this.blocking,
      commandPaletteOpen: this.commandPaletteOpen,
    };
  }

  broadcast() {
    const snap = this.snapshot();
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.state, snap);
    }
  }

  selectNavigation(item: NavigationItem) {
    if (item === "leaderboard" || item === "timer") item = "today";
    this.navigation = item;
    this.inspector = emptyInspector();
    this.statusMessage = `Showing ${item[0].toUpperCase()}${item.slice(1)}`;
    this.commandPaletteOpen = false;
    if (item === "blocking") void this.refreshBlocking();
    void this.refreshVisibleRange();
    this.broadcast();
  }

  async refreshVisibleRange() {
    const bounds = this.visibleRange();
    const zone = localTimeZone();
    await this.tracker.loadRange(bounds.start, bounds.end, zone);
    if (this.api.getTokens() && this.settings.syncEnabled) {
      try {
        this.serverSummary = await this.api.periodSummary({
          start: bounds.start.toISOString(),
          end: bounds.end.toISOString(),
          time_zone: zone,
          include_daily_totals: true,
        });
        this.serverSummaryRange = { start: bounds.start.getTime(), end: bounds.end.getTime() };
      } catch {
        this.serverSummary = null;
        this.serverSummaryRange = null;
      }
      await this.tracker.refreshDevices();
    } else {
      this.serverSummary = null;
      this.serverSummaryRange = null;
    }
    if (this.navigation === "calendar" && this.settings.showGoogleCalendarEvents) {
      try {
        this.calendarEvents = await this.google.eventsForDay(this.calendarAnchor, this.settings.googleClientId);
      } catch {
        this.calendarEvents = [];
      }
    }
    this.broadcast();
  }

  startTimelineRefresh() {
    if (this.timelineTimer) clearInterval(this.timelineTimer);
    this.timelineTimer = setInterval(() => {
      if (["today", "timer", "calendar", "insights"].includes(this.navigation)) {
        void this.refreshVisibleRange();
      }
      if (this.auth.user) void this.tracker.heartbeat();
    }, 60_000);
  }

  async restoreSession() {
    const tokens = this.api.getTokens();
    if (!tokens) return;
    this.auth.loading = true;
    this.broadcast();
    try {
      this.auth.user = await this.api.me();
      this.auth.statusMessage = `Signed in as ${this.auth.user.email}`;
      this.auth.mfaChallenge = null;
    } catch {
      this.api.setTokens(null);
      this.auth.user = null;
      this.auth.statusMessage = "Session expired. Sign in again.";
    } finally {
      this.auth.loading = false;
      this.broadcast();
    }
  }

  async login() {
    const error = signInError(this.auth.email, this.auth.password);
    if (error) {
      this.auth.statusMessage = error;
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
      this.auth.statusMessage = error instanceof Error ? error.message : "Sign in failed.";
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
      this.auth.statusMessage = error;
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
      this.auth.statusMessage = error instanceof Error ? error.message : "Registration failed.";
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
      this.auth.statusMessage = `Signed in as ${this.auth.user.email}`;
      await this.tracker.flushOutbox();
      await this.refreshVisibleRange();
    } catch (error) {
      this.auth.statusMessage = error instanceof Error ? error.message : "Verification failed.";
    } finally {
      this.auth.loading = false;
      this.broadcast();
    }
  }

  async resendOtp() {
    if (!this.auth.mfaChallenge) return;
    try {
      await this.api.resendOTP(this.auth.mfaChallenge.mfa_token);
      this.auth.statusMessage = "A new code is on the way.";
    } catch (error) {
      this.auth.statusMessage = error instanceof Error ? error.message : "Could not resend code.";
    }
    this.broadcast();
  }

  logout() {
    this.api.setTokens(null);
    this.auth = { ...defaultAuth(), email: this.auth.email };
    this.blocking = defaultBlocking();
    this.statusMessage = "Signed out";
    this.broadcast();
  }

  updateSettings(patch: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.api.setBaseUrl(this.settings.apiBaseUrl);
    this.broadcast();
  }

  addTimerBonus(seconds = TIMER_BONUS_STEP_SECONDS) {
    const day = toDateInput(new Date());
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

  setTodayPeriod(period: TodayPeriod) {
    this.todayPeriod = period;
    void this.refreshVisibleRange();
  }

  setTodayTab(tab: string) {
    this.todayTab = normalizeTodayTab(tab);
    this.broadcast();
  }

  persistWorkspace() {
    saveCalendarWorkspace(this.calendarWorkspace);
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

  selectInspector(payload: InspectorSelection) {
    this.inspector = inspectorFromSelection(payload);
    this.broadcast();
  }

  async refreshBlocking() {
    if (!this.auth.user) {
      if (this.inspector.kind === "schedule") this.inspector = emptyInspector();
      this.blocking = {
        ...defaultBlocking(),
        statusMessage: "Sign in on the Account screen to manage sessions and blocklists.",
      };
      this.broadcast();
      return;
    }
    this.blocking.loading = true;
    this.broadcast();
    try {
      const [blocklists, schedules] = await Promise.all([
        this.api.blocklists(),
        this.api.blockingSchedules(),
      ]);
      this.blocking.blocklists = blocklists;
      this.blocking.schedules = schedules;
      this.blocking.statusMessage = `${schedules.length} sessions · ${blocklists.length} blocklists`;
      if (this.inspector.kind === "schedule" && this.inspector.schedule) {
        const next = schedules.find((item) => item.schedule_id === this.inspector.schedule?.schedule_id);
        this.inspector = next
          ? inspectorFromSelection({ kind: "schedule", schedule: next })
          : emptyInspector();
      }
      try {
        this.tracker.registeredDevices = await this.api.devices();
        this.tracker.deviceStatus = await this.api.deviceStatus();
      } catch (error) {
        logObservability(`Blocking device refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      this.blocking.statusMessage = error instanceof Error ? error.message : "Blocking data unavailable.";
    } finally {
      this.blocking.loading = false;
      this.broadcast();
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

  async createBlockingSchedule(input: BlockingScheduleWritePayload) {
    if (!this.auth.user) {
      this.blocking.statusMessage = "Sign in on the Account screen to create sessions.";
      this.broadcast();
      return;
    }
    try {
      await this.api.createBlockingSchedule(input);
      this.statusMessage = "Session created.";
      await this.refreshBlocking();
    } catch (error) {
      this.blocking.statusMessage = error instanceof Error ? error.message : "Could not create session.";
      this.broadcast();
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
      this.auth.statusMessage = result.message || "Enter the verification code.";
      return;
    }
    this.api.setTokens(result);
    this.auth.user = await this.api.me();
    this.auth.mfaChallenge = null;
    this.auth.statusMessage = `${success} as ${this.auth.user.email}`;
    await this.tracker.flushOutbox();
    await this.refreshVisibleRange();
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
          deviceName: resolvedDeviceName(device.device_platform, device.device_name),
          devicePlatform: device.device_platform,
          deviceID: device.device_id,
          sessionCount: device.session_count,
          timeZone: device.time_zone,
          lastSeenAt: device.last_seen_at,
          lastOnlineAt: status?.last_online_at ?? null,
          reportedOnline: status?.is_online ?? null,
          isRegistered: true,
        }),
      );
    }
    return Array.from(byKey.values()).sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.deviceName.localeCompare(b.deviceName));
  }

  private mappedServerSummary(bounds: { start: Date; end: Date }) {
    if (!this.serverSummary || !this.serverSummaryRange) return undefined;
    if (
      this.serverSummaryRange.start !== bounds.start.getTime() ||
      this.serverSummaryRange.end !== bounds.end.getTime()
    ) {
      return undefined;
    }
    return {
      totalSeconds: this.serverSummary.total_seconds,
      sessionCount: this.serverSummary.session_count,
      categories: this.serverSummary.categories,
      trackedSecondsByDay: this.serverSummary.tracked_seconds_by_day,
      apps: this.serverSummary.apps?.map((app, index) => ({
        key: app.id ?? `${app.app_name ?? "app"}-${index}`,
        label: app.app_name ?? "Unknown",
        subtitle: app.browser_app || (app.is_website ? "Website" : app.category),
        category: app.category,
        seconds: app.seconds,
        percentage: app.percentage > 1 ? app.percentage / 100 : app.percentage,
        colorIndex: app.color_index ?? index,
      })),
    };
  }
}

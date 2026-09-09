export type NavigationItem = "today" | "calendar" | "insights" | "leaderboard" | "account";

export type InsightsPeriod = "day" | "week" | "year";
export type InsightsTab = "overview" | "breakdown" | "sessions";
export type TodayTab = "overview" | "blocks" | "eventLog" | "breakdown";
export type LeaderboardPeriod = "day" | "week";
export type ThemePreference = "system" | "light" | "dark";
export type MFAMethod = "totp" | "email_otp" | "sms_otp";
export type AuthFormMode = "signIn" | "signUp";
export type DevicePlatform = "macos" | "windows" | "linux";

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  tracking_id: string;
  totp_enabled: boolean;
  phone_number: string;
  phone_verified: boolean;
  mfa_delivery: string;
  social_providers: string[];
  theme?: "light" | "dark";
}

export interface MFAPendingResponse {
  mfa_required: boolean;
  mfa_token: string;
  mfa_method: MFAMethod;
  message: string;
  created?: boolean;
}

export type LoginResponse = AuthTokens | MFAPendingResponse;

export interface DeviceRow {
  device_id: string;
  device_platform: string;
  device_name: string;
  label: string;
  time_zone: string;
  registered_at: string;
  updated_at: string;
  last_seen_at: string | null;
  session_count: number;
}

export interface DeviceStatusRow {
  device_id: string;
  device_platform: string;
  device_name: string;
  label: string;
  is_online: boolean;
  last_online_at: string | null;
  last_online_seconds_ago: number | null;
}

export interface DeviceListEntry {
  visibilityKey: string;
  deviceName: string;
  devicePlatform: string;
  deviceID: string | null;
  sessionCount: number;
  timeZone: string;
  lastSeenAt: string | null;
  lastOnlineAt: string | null;
  reportedOnline: boolean | null;
  isOnline: boolean;
  isRegistered: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  tracking_id: string;
  email: string;
  display_name: string;
  total_seconds: number;
  is_self: boolean;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  day: string;
  week_start: string | null;
  week_end: string | null;
  count: number;
  results: LeaderboardEntry[];
}

export interface FriendUser {
  user_id: number;
  email: string;
  tracking_id: string;
  display_name: string;
}

export interface FriendRequestUser {
  user_id: number;
  email: string;
  tracking_id: string;
  display_name: string;
}

export interface FriendRequest {
  request_id: number;
  from_user: FriendRequestUser;
  to_user: FriendRequestUser;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PeriodSummaryResponse {
  start: string;
  end: string;
  total_seconds: number;
  session_count: number;
  categories: ScreenTimeCategoryBreakdown[];
  apps: Array<{
    id?: string;
    app_name?: string;
    category: string;
    seconds: number;
    percentage: number;
    color_index?: number;
    browser_app?: string | null;
    is_website?: boolean;
    device_label?: string;
  }>;
  tracked_seconds_by_day?: Record<string, number>;
}

export interface SyncStatusResponse {
  daily_through: string | null;
  hourly_through: string | null;
  events_through: string | null;
  daily_fingerprint: string | number;
  hourly_fingerprint: string | number;
  events_fingerprint: string | number;
}

export interface SyncDeviceStatus {
  device_id: string;
  device_platform: string;
  device_name: string;
  session_count: number;
  cursor?: SyncStatusResponse;
}

export interface ScreenTimeSyncSession {
  started_at: string;
  ended_at: string;
  title: string;
  url: string;
  process_name: string;
  app_name: string;
  app_category: string;
  app_bundle_id: string;
  device_platform: string;
  device_name: string;
  duration_seconds: number;
  time_zone: string;
}

export interface ScreenTimeEntry {
  id: string;
  startTimeUTC: string;
  endTimeUTC: string;
  title: string;
  url: string;
  bundleID: string;
  appName: string;
  category: string;
  platform: string;
  deviceName: string;
  timeZoneIdentifier: string;
  source: "local" | "sync" | "live";
}

export interface ScreenTimeTimelineSegment {
  id: string;
  start: string;
  end: string;
  label: string;
  subtitle: string;
  url: string;
  bundleID: string;
  category: string;
  appName: string;
  devicePlatform: string;
  deviceName: string;
  timeZoneIdentifier: string;
  isLive: boolean;
}

export interface ScreenTimeSessionBlockItem {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  category: string;
  appName: string;
  start: string;
  end: string;
  durationSeconds: number;
}

export interface ScreenTimeSessionBlock {
  id: string;
  start: string;
  end: string;
  title: string;
  subtitle: string;
  category: string;
  devicePlatform: string;
  deviceName: string;
  durationSeconds: number;
  items: ScreenTimeSessionBlockItem[];
}

export interface ScreenTimeDeviceTimeline {
  id: string;
  deviceName: string;
  devicePlatform: string;
  timeZoneIdentifier: string;
  dayStart: string;
  dayEnd: string;
  segments: ScreenTimeTimelineSegment[];
  blocks: ScreenTimeSessionBlock[];
}

export interface ScreenTimeCategoryBreakdown {
  category: string;
  seconds: number;
  percentage: number;
}

export interface ScreenTimeAppBreakdown {
  key: string;
  label: string;
  subtitle: string;
  category: string;
  seconds: number;
  percentage: number;
  colorIndex?: number;
}

export interface ScreenTimePeriodBucket {
  id: string;
  label: string;
  start: string;
  end: string;
  seconds: number;
}

export interface ScreenTimeSnapshot {
  totalSeconds: number;
  sessionCount: number;
  timelineSegments: ScreenTimeTimelineSegment[];
  listSegments: ScreenTimeTimelineSegment[];
  categories: ScreenTimeCategoryBreakdown[];
  apps: ScreenTimeAppBreakdown[];
  buckets: ScreenTimePeriodBucket[];
  trackedSecondsByDay: Record<string, number>;
}

export interface ForegroundContext {
  title: string;
  url: string;
  appName: string;
  bundleID: string;
  category: string;
}

export interface TrackingCapabilities {
  platform: DevicePlatform;
  accessibilityGranted: boolean;
  urlCaptureSupported: boolean;
  urlCaptureNote: string;
  waylandLimited: boolean;
}

export interface CalendarOverlayEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendarName: string;
  isAllDay: boolean;
  colorHex: string | null;
  provider: "google";
}

export interface AppSettings {
  startScreenTimeOnLaunch: boolean;
  appearance: ThemePreference;
  apiBaseUrl: string;
  syncEnabled: boolean;
  showGoogleCalendarEvents: boolean;
  googleClientId: string;
}

export interface ScreenTimeApiPayload {
  recorded_at: string;
  device_platform: string;
  device_name: string;
  app_name: string;
  app_category: string;
  app_bundle_id: string;
  duration_seconds: number;
  foreground_state: string;
  started_at: string;
  session_title: string;
  session_url: string;
  process_name: string;
  time_zone: string;
}

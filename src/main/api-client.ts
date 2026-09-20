import type {
  AuthenticatedUser,
  AuthTokens,
  DeviceRow,
  DeviceStatusRow,
  FriendRequest,
  FriendUser,
  LeaderboardPeriod,
  LeaderboardResponse,
  LoginResponse,
  MFAMethod,
  MFAPendingResponse,
  PeriodSummaryResponse,
  ScreenTimeApiPayload,
  ScreenTimeSyncSession,
  SyncDeviceStatus,
  Blocklist,
  BlocklistWritePayload,
  BlockingSchedule,
  BlockingScheduleUpdatePayload,
  BlockingScheduleWritePayload,
  BlockingPolicyResponse,
  BlockingPublicKey,
  EndNormalOccurrenceResponse,
  BypassRedeemInput,
  BypassIssueInput,
} from "@shared/types";
import { logNetwork } from "./logger";

export class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "APIError";
  }
}

function isMfa(body: LoginResponse): body is MFAPendingResponse {
  return Boolean((body as MFAPendingResponse).mfa_required);
}

function apiMessage(body: unknown, status?: number) {
  if (typeof body === "string" && body.trim()) {
    const trimmed = body.trim();
    if (/^\s*</.test(trimmed) || trimmed.length > 280) {
      return `Request failed (${status ?? "error"}).`;
    }
    return trimmed;
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (Array.isArray(record.non_field_errors) && typeof record.non_field_errors[0] === "string") {
      return record.non_field_errors[0];
    }
    for (const [field, value] of Object.entries(record)) {
      if (Array.isArray(value) && typeof value[0] === "string") {
        return `${field.replaceAll("_", " ")}: ${value[0]}`;
      }
    }
  }
  return "Request failed.";
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asList<T>(body: { results?: T[] } | T[] | null | undefined): T[] {
  if (!body) return [];
  return Array.isArray(body) ? body : (body.results ?? []);
}

export class StopScrollingAPI {
  constructor(
    private baseUrl: string,
    private tokens: AuthTokens | null,
    private readonly onTokensChanged: (tokens: AuthTokens | null) => void,
  ) {}

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setTokens(tokens: AuthTokens | null) {
    this.tokens = tokens;
    this.onTokensChanged(tokens);
  }

  getTokens() {
    return this.tokens;
  }

  private url(path: string) {
    return new URL(path, this.baseUrl.replace(/\/?$/, "/")).toString();
  }

  private async request<T>(path: string, options: RequestInit & { token?: string | null; retryOnAuth?: boolean } = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
    const token = options.token === undefined ? this.tokens?.access : options.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const started = Date.now();
    const response = await fetch(this.url(path), { ...options, headers });
    const body = await parseResponse(response);
    logNetwork(`${options.method ?? "GET"} ${path} ${response.status} ${Date.now() - started}ms`);

    if (response.status === 401 && options.retryOnAuth !== false && this.tokens?.refresh) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.request<T>(path, { ...options, retryOnAuth: false });
      }
    }

    if (!response.ok) {
      throw new APIError(apiMessage(body, response.status), response.status, body);
    }
    return body as T;
  }

  async register(input: { email: string; password: string; phone_number?: string }) {
    return this.request<LoginResponse>("api/auth/register/", {
      method: "POST",
      body: JSON.stringify(input),
      token: null,
    });
  }

  async login(input: { email: string; password: string }) {
    return this.request<LoginResponse>("api/auth/login/", {
      method: "POST",
      body: JSON.stringify(input),
      token: null,
    });
  }

  async verifyMFA(input: { token: string; code: string; method: MFAMethod | "backup_code" }) {
    const endpoint =
      input.method === "totp"
        ? "api/auth/mfa/totp/verify/"
        : input.method === "backup_code"
          ? "api/auth/mfa/backup-code/verify/"
          : "api/auth/mfa/otp/verify/";
    const body =
      input.method === "backup_code"
        ? { mfa_token: input.token, backup_code: input.code }
        : { mfa_token: input.token, code: input.code };
    return this.request<AuthTokens>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      token: null,
    });
  }

  async resendOTP(mfaToken: string) {
    return this.request<{ detail?: string }>("api/auth/mfa/otp/resend/", {
      method: "POST",
      body: JSON.stringify({ mfa_token: mfaToken }),
      token: null,
    });
  }

  async refreshAccessToken() {
    if (!this.tokens?.refresh) return false;
    try {
      const response = await this.request<{ access: string }>("api/auth/token/refresh/", {
        method: "POST",
        body: JSON.stringify({ refresh: this.tokens.refresh }),
        token: null,
        retryOnAuth: false,
      });
      this.setTokens({ ...this.tokens, access: response.access });
      return true;
    } catch {
      this.setTokens(null);
      return false;
    }
  }

  async me() {
    return this.request<AuthenticatedUser>("api/auth/me/");
  }

  async devices() {
    return asList(await this.request<{ results?: DeviceRow[] } | DeviceRow[]>("api/devices/"));
  }

  async deviceStatus() {
    return asList(
      await this.request<{ results?: DeviceStatusRow[] } | DeviceStatusRow[]>("api/devices/status/"),
    );
  }

  async registerDevice(payload: {
    device_platform: string;
    device_name: string;
    time_zone: string;
    label?: string;
  }) {
    return this.request<DeviceRow>("api/devices/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateDevice(deviceId: string, payload: { label: string }) {
    return this.request<DeviceRow>(`api/devices/${deviceId}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async heartbeat(deviceId: string) {
    return this.request<DeviceStatusRow>(`api/devices/${deviceId}/heartbeat/`, { method: "POST" });
  }

  async postEventsBulk(events: ScreenTimeApiPayload[]) {
    return this.request<{ inserted: number }>("api/events/bulk/", {
      method: "POST",
      body: JSON.stringify({ events }),
    });
  }

  async sessions(params: { day?: string; start?: string; end?: string; time_zone?: string }) {
    const search = new URLSearchParams();
    if (params.day) search.set("day", params.day);
    if (params.start) search.set("start", params.start);
    if (params.end) search.set("end", params.end);
    if (params.time_zone) search.set("time_zone", params.time_zone);
    const body = await this.request<{ sessions?: ScreenTimeSyncSession[]; results?: ScreenTimeSyncSession[] }>(
      `api/insights/sessions/?${search.toString()}`,
    );
    return body.sessions ?? body.results ?? [];
  }

  async periodSummary(params: {
    start: string;
    end: string;
    time_zone?: string;
    include_daily_totals?: boolean;
  }) {
    const search = new URLSearchParams({ start: params.start, end: params.end });
    if (params.time_zone) search.set("time_zone", params.time_zone);
    if (params.include_daily_totals) search.set("include_daily_totals", "true");
    return this.request<PeriodSummaryResponse>(`api/insights/summary/?${search.toString()}`);
  }

  async syncDevices() {
    return asList(
      await this.request<{ results?: SyncDeviceStatus[] } | SyncDeviceStatus[]>("api/sync/devices/"),
    );
  }

  async pullDevice(deviceId: string, eventsSince?: string) {
    const search = new URLSearchParams({
      include_profile: "false",
      sessions_limit: "500",
    });
    if (eventsSince) search.set("events_since", eventsSince);
    return this.request<{ sessions?: ScreenTimeSyncSession[]; has_more_sessions?: boolean }>(
      `api/devices/${deviceId}/sync/?${search.toString()}`,
    );
  }

  async leaderboard(params: { period: LeaderboardPeriod; day: string }) {
    const search = new URLSearchParams({ period: params.period, day: params.day });
    return this.request<LeaderboardResponse>(`api/leaderboard/?${search.toString()}`);
  }

  async friends() {
    return asList(await this.request<{ results?: FriendUser[] } | FriendUser[]>("api/friends/"));
  }

  async sendFriendRequest(email: string) {
    return this.request<FriendRequest>("api/friends/", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async removeFriend(friendUserId: number) {
    return this.request<void>(`api/friends/${friendUserId}/`, { method: "DELETE" });
  }

  async friendRequests() {
    return asList(
      await this.request<{ results?: FriendRequest[] } | FriendRequest[]>("api/friends/requests/"),
    );
  }

  async acceptFriendRequest(requestId: number) {
    return this.request<FriendRequest>(`api/friends/requests/${requestId}/accept/`, { method: "POST" });
  }

  async declineFriendRequest(requestId: number) {
    return this.request<FriendRequest>(`api/friends/requests/${requestId}/decline/`, { method: "POST" });
  }

  async blocklists() {
    return asList(await this.request<{ results?: Blocklist[] } | Blocklist[]>("api/blocklists/"));
  }

  async createBlocklist(input: BlocklistWritePayload) {
    return this.request<Blocklist>("api/blocklists/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateBlocklist(id: string, input: BlocklistWritePayload) {
    return this.request<Blocklist>(`api/blocklists/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async blockingSchedules() {
    return asList(
      await this.request<{ results?: BlockingSchedule[] } | BlockingSchedule[]>("api/blocking-schedules/"),
    );
  }

  async createBlockingSchedule(input: BlockingScheduleWritePayload) {
    return this.request<BlockingSchedule>("api/blocking-schedules/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateBlockingSchedule(id: string, input: BlockingScheduleWritePayload) {
    return this.request<BlockingSchedule>(`api/blocking-schedules/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deleteBlockingSchedule(id: string) {
    await this.request<unknown>(`api/blocking-schedules/${id}/`, { method: "DELETE" });
  }

  async deviceBlockingPolicy(deviceId: string) {
    return this.request<BlockingPolicyResponse>(`api/blocking-policy/devices/${deviceId}/`);
  }

  async blockingPublicKey() {
    return this.request<BlockingPublicKey>("api/blocking-policy/keys/current/", { token: null });
  }

  async endNormalOccurrence(scheduleId: string, deviceId: string) {
    return this.request<EndNormalOccurrenceResponse>(`api/blocking-schedules/${scheduleId}/end/`, {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId }),
    });
  }

  async issueBypass(input: BypassIssueInput) {
    return this.request<{
      token: string;
      nonce: string;
      device_id: string;
      occurrence_id: string;
      action: string;
      expires_at: string;
      kid: string;
    }>("api/blocking-policy/bypass-tokens/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async redeemBypass(input: BypassRedeemInput) {
    return this.request<{ redeemed: boolean; nonce: string; redeemed_at: string }>(
      "api/blocking-policy/bypass-tokens/redeem/",
      { method: "POST", body: JSON.stringify(input) },
    );
  }
}

export { isMfa };

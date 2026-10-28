import type {
  AppleCalendarAccess,
  CalendarConnectionRow,
  CalendarErrorRow,
  CalendarEventRow,
  CalendarIntegrationState,
  CalendarOverlayEvent,
  CalendarProvider,
  CalendarSourceOption,
  CalendarSourceRow,
} from "@shared/types";
import type { AppleCalendar, AppleCalendarBridge, AppleCalendarEvent } from "./apple-calendar";
import { logObservability } from "./logger";

export interface CalendarEventsApi {
  calendarConnections(): Promise<CalendarConnectionRow[]>;
  startGoogleCalendarConnect(): Promise<{ authorization_url: string }>;
  deleteCalendarConnection(id: number): Promise<void>;
  calendarSources(refresh?: boolean): Promise<{ calendars: CalendarSourceRow[]; errors: CalendarErrorRow[] }>;
  setCalendarSourceSelected(id: number, selected: boolean): Promise<CalendarSourceRow>;
  calendarEvents(params: { start: string; end: string; tz: string }): Promise<{ events: CalendarEventRow[]; errors: CalendarErrorRow[] }>;
}

export interface CalendarEventsHost {
  signedIn(): boolean;
  /** Apple calendars the user picked; null means every calendar not covered by a Google link. */
  appleCalendarIds(): string[] | null;
  setAppleCalendarIds(ids: string[] | null): void;
  openExternal(url: string): Promise<void>;
  changed(): void;
}

type AppleLike = Pick<AppleCalendarBridge, "supported" | "access" | "requestAccess" | "calendars" | "events">;

const CONNECT_POLL_MS = 2_000;
const CONNECT_TIMEOUT_MS = 5 * 60_000;

/**
 * Linked calendars and their events. Google accounts are linked and read through the server, so
 * tokens never live on this device; Apple calendars are read locally through EventKit on macOS.
 */
export class CalendarEventsService {
  private connections: CalendarConnectionRow[] = [];
  private googleSources: CalendarSourceRow[] = [];
  private appleAccess: AppleCalendarAccess = "unsupported";
  private appleCalendars: AppleCalendar[] = [];
  private errors: string[] = [];
  private connecting: Promise<boolean> | null = null;
  private wake: (() => void) | null = null;
  private cancelled = false;

  constructor(
    private readonly api: CalendarEventsApi,
    private readonly apple: AppleLike,
    private readonly host: CalendarEventsHost,
    private readonly pollMs = CONNECT_POLL_MS,
  ) {}

  state(): CalendarIntegrationState {
    return {
      google: {
        available: this.host.signedIn(),
        connecting: this.connecting !== null,
        accounts: this.connections.map((row) => ({
          id: row.id,
          email: row.account_email,
          needsReauth: row.status === "needs_reauth",
        })),
      },
      apple: { access: this.appleAccess },
      calendars: this.calendarOptions(),
      errors: this.errors,
    };
  }

  hasSources() {
    return this.connections.length > 0 || this.appleAccess === "fullAccess";
  }

  /** Reload linked accounts and calendar lists. `fromGoogle` re-reads calendar lists at Google. */
  async refresh(options: { fromGoogle?: boolean } = {}) {
    await Promise.allSettled([this.refreshGoogle(options.fromGoogle ?? false), this.refreshApple()]);
    this.host.changed();
  }

  async events(start: Date, end: Date, timeZone: string): Promise<CalendarOverlayEvent[]> {
    const [google, apple] = await Promise.allSettled([
      this.googleEvents(start, end, timeZone),
      this.appleEvents(start, end),
    ]);
    const errors: string[] = [];
    const googleEvents = google.status === "fulfilled" ? google.value.events : [];
    if (google.status === "fulfilled") errors.push(...google.value.errors);
    else errors.push("Couldn't load Google Calendar events.");
    const appleEvents = apple.status === "fulfilled" ? apple.value : [];
    if (apple.status === "rejected") errors.push("Couldn't read Apple Calendar.");
    this.errors = errors;
    return dedupeEvents(googleEvents, appleEvents);
  }

  /** Opens Google's consent page and waits until the server reports the linked account. */
  connectGoogle(): Promise<boolean> {
    this.connecting ??= this.runConnect().finally(() => {
      this.connecting = null;
      this.host.changed();
    });
    this.host.changed();
    return this.connecting;
  }

  /** The browser sent the user back (deep link) or the app regained focus: check right away. */
  checkConnectionNow() {
    this.wake?.();
  }

  async disconnectGoogle(id: number) {
    await this.api.deleteCalendarConnection(id);
    this.connections = this.connections.filter((row) => row.id !== id);
    this.googleSources = this.googleSources.filter((row) => row.connection_id !== id);
    this.host.changed();
  }

  async requestAppleAccess() {
    this.appleAccess = await this.apple.requestAccess();
    await this.refreshApple();
    this.host.changed();
    return this.appleAccess;
  }

  async setSelected(provider: CalendarProvider, id: string, selected: boolean) {
    if (provider === "google") {
      const row = await this.api.setCalendarSourceSelected(Number(id), selected);
      this.googleSources = this.googleSources.map((source) => (source.id === row.id ? row : source));
    } else {
      const current = this.appleCalendarIds();
      const next = selected ? [...new Set([...current, id])] : current.filter((value) => value !== id);
      this.host.setAppleCalendarIds(next);
    }
    this.host.changed();
  }

  /** Signed out: forget Google accounts (they belong to the account) and stop any connect wait. */
  reset() {
    this.cancelled = true;
    this.wake?.();
    this.connections = [];
    this.googleSources = [];
    this.errors = [];
  }

  private async refreshGoogle(fromGoogle: boolean) {
    if (!this.host.signedIn()) {
      this.connections = [];
      this.googleSources = [];
      return;
    }
    try {
      const [connections, sources] = await Promise.all([
        this.api.calendarConnections(),
        this.api.calendarSources(fromGoogle),
      ]);
      this.connections = connections;
      this.googleSources = sources.calendars;
    } catch (error) {
      logObservability(`Calendar accounts refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async refreshApple() {
    try {
      this.appleAccess = await this.apple.access();
      this.appleCalendars = this.appleAccess === "fullAccess" ? await this.apple.calendars() : [];
    } catch (error) {
      this.appleCalendars = [];
      logObservability(`Apple Calendar refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async googleEvents(start: Date, end: Date, timeZone: string) {
    const selected = this.googleSources.some((source) => source.selected);
    if (!this.host.signedIn() || !this.connections.length || !selected) {
      return { events: [] as CalendarOverlayEvent[], errors: [] as string[] };
    }
    const body = await this.api.calendarEvents({ start: start.toISOString(), end: end.toISOString(), tz: timeZone });
    if (body.errors.some((error) => error.needs_reauth)) {
      this.connections = this.connections.map((row) =>
        body.errors.some((error) => error.needs_reauth && error.connection_id === row.id)
          ? { ...row, status: "needs_reauth" as const }
          : row,
      );
    }
    return {
      events: body.events.map(fromGoogleRow),
      errors: [...new Set(body.errors.map((error) => `${error.account_email}: ${error.detail}`))],
    };
  }

  private async appleEvents(start: Date, end: Date) {
    if (this.appleAccess !== "fullAccess") return [];
    const ids = this.calendarOptions()
      .filter((option) => option.provider === "apple" && option.selected)
      .map((option) => option.id);
    return (await this.apple.events(start, end, ids)).map(fromAppleEvent);
  }

  private async runConnect() {
    this.cancelled = false;
    const before = new Map((await this.api.calendarConnections()).map((row) => [row.id, row]));
    const { authorization_url } = await this.api.startGoogleCalendarConnect();
    await this.host.openExternal(authorization_url);
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    while (!this.cancelled && Date.now() < deadline) {
      await this.sleep(this.pollMs);
      if (this.cancelled) break;
      const rows = await this.api.calendarConnections().catch(() => null);
      if (!rows) continue;
      const linked = rows.some((row) => {
        const earlier = before.get(row.id);
        return row.status === "active" && (!earlier || earlier.updated_at !== row.updated_at || earlier.status !== "active");
      });
      if (linked) {
        this.connections = rows;
        await this.refreshGoogle(false);
        return true;
      }
    }
    return false;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = () => {
        this.wake = null;
        done();
      };
    });
  }

  private appleCalendarIds() {
    const stored = this.host.appleCalendarIds();
    if (stored) return stored;
    return this.appleCalendars.filter((calendar) => !this.coveredByGoogle(calendar)).map((calendar) => calendar.id);
  }

  /** An Apple calendar that comes from a Google account already linked here. */
  private coveredByGoogle(calendar: AppleCalendar) {
    if (!this.connections.length) return false;
    const source = calendar.sourceTitle.toLowerCase();
    return calendar.isGoogleSourced || this.connections.some((row) => row.account_email.toLowerCase() === source);
  }

  private calendarOptions(): CalendarSourceOption[] {
    const google = this.googleSources.map<CalendarSourceOption>((source) => ({
      id: String(source.id),
      provider: "google",
      name: source.name,
      accountLabel: source.account_email,
      colorHex: source.color_hex || null,
      selected: source.selected,
      coveredByGoogle: false,
    }));
    const selectedApple = new Set(this.appleCalendarIds());
    const apple = this.appleCalendars.map<CalendarSourceOption>((calendar) => {
      const covered = this.coveredByGoogle(calendar);
      return {
        id: calendar.id,
        provider: "apple",
        name: calendar.title,
        accountLabel: calendar.sourceTitle,
        colorHex: calendar.colorHex,
        selected: !covered && selectedApple.has(calendar.id),
        coveredByGoogle: covered,
      };
    });
    return [...google, ...apple];
  }
}

function fromGoogleRow(row: CalendarEventRow): CalendarOverlayEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start,
    end: row.end,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    isAllDay: row.is_all_day,
    colorHex: row.color_hex,
    provider: "google",
    icalUid: row.ical_uid,
  };
}

function fromAppleEvent(event: AppleCalendarEvent): CalendarOverlayEvent {
  return { ...event, provider: "apple" };
}

/** The same meeting can arrive from Google and from Calendar.app; keep the Google copy. */
export function dedupeEvents(google: CalendarOverlayEvent[], apple: CalendarOverlayEvent[]) {
  const key = (event: CalendarOverlayEvent) =>
    event.icalUid ? `${event.icalUid}|${event.isAllDay ? event.start : Date.parse(event.start)}` : null;
  const seen = new Set(google.map(key).filter((value): value is string => value !== null));
  const merged = [...google, ...apple.filter((event) => {
    const value = key(event);
    return !value || !seen.has(value);
  })];
  return merged.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function sortKey(event: CalendarOverlayEvent) {
  return event.isAllDay ? event.start : new Date(event.start).toISOString();
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CATEGORY_FILTERS,
  COMMON_FILTERS,
  collectBlocklistEntries,
  defaultTimeZone,
  formatRemaining,
  normalizeWebsite,
  parseWebsiteList,
  remainingUntilEnd,
  scheduleRowKind,
  scheduleWhen,
  WEEKDAYS,
} from "@shared/blocking";
import type { AppSnapshot } from "@shared/snapshot";
import type { BlockingSchedule, DeviceListEntry } from "@shared/types";
import {
  Check,
  CircleHelp,
  Laptop2,
  MonitorSmartphone,
  Plus,
  Shield,
  ShieldOff,
  X,
} from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Grouped,
  LoadingState,
  Tabs,
  TextField,
  Toggle,
} from "../components/ui";

type SessionTab = "sessions" | "history";

function scheduleDetail(schedule: BlockingSchedule, kind: "current" | "schedule" | "named", now: Date) {
  if (kind === "current") return formatRemaining(remainingUntilEnd(schedule, now));
  if (kind === "schedule") return "Always Active";
  if (!schedule.blocklists.length) return "No blocklists";
  return `Blocks ${schedule.blocklists.map((list) => list.name).join(" and ")}`;
}

function scheduleBody(kind: "current" | "schedule" | "named") {
  if (kind === "current") return "This timed session is running. This desktop app does not enforce blocks yet.";
  if (kind === "schedule") return "Always-on schedule for selected lists. This desktop app does not enforce blocks yet.";
  return "A named session synced to your account. This desktop app does not enforce blocks yet.";
}

export function BlockingScreen({ state }: { state: AppSnapshot }) {
  const [lockedMode, setLockedMode] = useState(false);
  const [tab, setTab] = useState<SessionTab>("sessions");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [showCreateBlocklist, setShowCreateBlocklist] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleName, setScheduleName] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [selectedBlocklistIds, setSelectedBlocklistIds] = useState<string[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [blocklistName, setBlocklistName] = useState("");
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [multipleSitesText, setMultipleSitesText] = useState("");
  const [showMultipleSites, setShowMultipleSites] = useState(false);
  const [customWebsites, setCustomWebsites] = useState<string[]>([]);
  const [selectedCommonIds, setSelectedCommonIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const blocking = state.blocking ?? { schedules: [], blocklists: [], statusMessage: "", loading: false };
  const devices = state.devices ?? [];
  const registeredDevices = devices.filter((device): device is DeviceListEntry & { deviceID: string } => Boolean(device.deviceID));
  const registeredIdKey = registeredDevices.map((device) => device.deviceID).join("|");
  const now = useMemo(() => new Date(), [blocking.schedules]);

  useEffect(() => {
    if (!showCreateSession) return;
    const ids = registeredIdKey ? registeredIdKey.split("|") : [];
    setSelectedDeviceIds((current) => {
      if (!ids.length) return [];
      if (!current.length) return ids;
      const keep = current.filter((id) => ids.includes(id));
      return keep.length ? keep : ids;
    });
  }, [showCreateSession, registeredIdKey]);

  if (!state.isAuthenticated) {
    return (
      <EmptyState
        title="Sessions need an account"
        body="Sign in to create blocklists and blocking sessions that sync across your devices."
        icon={ShieldOff}
        action={<Button variant="primary" onClick={() => window.stopscrolling.navigate("account")}>Go to account</Button>}
      />
    );
  }

  const visibleSchedules = tab === "sessions" ? blocking.schedules : [];
  const canCreateSession = Boolean(
    scheduleName.trim()
    && startTime
    && endTime
    && selectedDays.length
    && selectedBlocklistIds.length
    && selectedDeviceIds.length,
  );

  function toggleDay(day: number) {
    setSelectedDays((current) => (
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day]
    ));
  }

  function toggleId(id: string, selected: string[], setSelected: (next: string[]) => void) {
    setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  function resetBlocklistForm() {
    setBlocklistName("");
    setWebsiteDraft("");
    setMultipleSitesText("");
    setShowMultipleSites(false);
    setCustomWebsites([]);
    setSelectedCommonIds([]);
    setSelectedCategoryIds([]);
  }

  function addCustomWebsites(values: string[]) {
    const next = values.filter(Boolean);
    if (!next.length) return;
    setCustomWebsites((current) => [...new Set([...current, ...next])]);
    setWebsiteDraft("");
    setMultipleSitesText("");
    setShowMultipleSites(false);
  }

  function submitBlocklist(event: FormEvent) {
    event.preventDefault();
    const entries = collectBlocklistEntries({
      customWebsites,
      commonFilterIds: selectedCommonIds,
      categoryIds: selectedCategoryIds,
    });
    if (!blocklistName.trim() || !entries.length) {
      setFormError("Add a name and at least one website or filter.");
      return;
    }
    setFormError(null);
    window.stopscrolling.createBlocklist({ name: blocklistName.trim(), entries });
    setShowCreateBlocklist(false);
    resetBlocklistForm();
  }

  function submitSchedule(event: FormEvent) {
    event.preventDefault();
    if (!canCreateSession) {
      setFormError("Choose a name, time range, days, at least one blocklist, and one device.");
      return;
    }
    setFormError(null);
    window.stopscrolling.createBlockingSchedule({
      name: scheduleName.trim(),
      start_time: startTime,
      end_time: endTime,
      days_of_week: [...selectedDays].sort((a, b) => a - b),
      time_zone: timeZone.trim() || defaultTimeZone(),
      blocklist_ids: selectedBlocklistIds,
      device_ids: selectedDeviceIds,
    });
    setShowCreateSession(false);
    setScheduleName("");
    setSelectedBlocklistIds([]);
    setSelectedDeviceIds([]);
  }

  return (
    <div className="blocking-page" data-testid="blocking-page">
      <Banner tone="info">
        Sessions and blocklists sync to your account. This desktop app does not enforce blocks yet.
      </Banner>
      {blocking.statusMessage ? <p className="muted">{blocking.statusMessage}</p> : null}
      <div className="blocking-layout">
        <div className="blocking-column">
          <Grouped
            title="My Sessions"
            description="Schedules synced from your account"
            action={(
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setShowCreateSession((open) => !open);
                  setFormError(null);
                }}
              >
                Add Session
              </Button>
            )}
          >
            <Tabs
              ariaLabel="Session views"
              value={tab}
              onChange={setTab}
              items={[
                { value: "sessions", label: "My Sessions" },
                { value: "history", label: "Session History" },
              ]}
            />
            {showCreateSession ? (
              <form className="form blocking-create" onSubmit={submitSchedule}>
                {formError && showCreateSession ? <p className="muted" role="alert">{formError}</p> : null}
                <TextField
                  label="Session name"
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  placeholder="Work focus"
                  required
                />
                <div className="blocking-time-grid">
                  <TextField
                    label="Start time"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                  <TextField
                    label="End time"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </div>
                <TextField
                  label="Time zone"
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  required
                />
                <fieldset className="blocking-fieldset">
                  <legend>Repeat on</legend>
                  <div className="blocking-weekdays">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        className={`blocking-weekday ${selectedDays.includes(day.value) ? "active" : ""}`}
                        aria-pressed={selectedDays.includes(day.value)}
                        onClick={() => toggleDay(day.value)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="blocking-fieldset">
                  <legend>Blocklists</legend>
                  {!blocking.blocklists.length ? (
                    <p className="muted">Create a blocklist before scheduling a session.</p>
                  ) : (
                    <div className="blocking-check-list">
                      {blocking.blocklists.map((list) => (
                        <label className="blocking-check-row" key={list.blocklist_id}>
                          <input
                            type="checkbox"
                            checked={selectedBlocklistIds.includes(list.blocklist_id)}
                            onChange={() => toggleId(list.blocklist_id, selectedBlocklistIds, setSelectedBlocklistIds)}
                          />
                          <span>
                            <strong>{list.name}</strong>
                            <span className="row-subtitle">{list.entry_count} {list.entry_count === 1 ? "filter" : "filters"}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
                <fieldset className="blocking-fieldset">
                  <legend>Devices</legend>
                  {!registeredDevices.length ? (
                    <p className="muted">No registered devices yet. Sync this computer first.</p>
                  ) : (
                    <div className="blocking-check-list" role="group" aria-label="Devices">
                      {registeredDevices.map((device) => (
                        <label className="blocking-device-option" key={device.deviceID}>
                          <span className="row-title">{device.deviceName}</span>
                          <input
                            type="checkbox"
                            checked={selectedDeviceIds.includes(device.deviceID)}
                            onChange={() => toggleId(device.deviceID, selectedDeviceIds, setSelectedDeviceIds)}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
                <Button variant="primary" type="submit" disabled={!canCreateSession || blocking.loading}>
                  Create blocking session
                </Button>
              </form>
            ) : null}
            <div className="blocking-session-list">
              {blocking.loading && !visibleSchedules.length ? <LoadingState label="Loading sessions…" /> : null}
              {tab === "history" ? (
                <EmptyState title="No session history" body="Completed sessions aren’t stored yet." />
              ) : null}
              {tab === "sessions" && !blocking.loading && !visibleSchedules.length && !showCreateSession ? (
                <EmptyState title="No sessions yet" body="Create a blocklist, then schedule a session." />
              ) : null}
              {visibleSchedules.map((schedule) => {
                const kind = scheduleRowKind(schedule, now);
                return (
                  <details
                    key={schedule.schedule_id}
                    className={`blocking-session ${kind === "current" ? "blocking-session-current" : ""}`}
                    open={kind === "current"}
                  >
                    <summary>
                      <span>
                        <span className="blocking-session-title">{kind === "current" ? "Current Session" : schedule.name}</span>
                        <span className="blocking-session-meta">{scheduleWhen(schedule, { today: kind === "current" })}</span>
                      </span>
                      <span className={kind === "named" ? "blocking-session-meta" : "blocking-session-status"}>
                        {kind === "current"
                          ? `${schedule.name} · ${scheduleDetail(schedule, kind, now)}`
                          : scheduleDetail(schedule, kind, now)}
                      </span>
                    </summary>
                    <div className="blocking-session-body">{scheduleBody(kind)}</div>
                  </details>
                );
              })}
            </div>
          </Grouped>

          <Grouped
            title="My Blocklists"
            description="Lists of apps and sites to use in a session"
            action={(
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setShowCreateBlocklist((open) => !open);
                  setFormError(null);
                }}
              >
                Add Blocklist
              </Button>
            )}
          >
            {showCreateBlocklist ? (
              <form className="form blocking-create blocking-composer" onSubmit={submitBlocklist}>
                {formError && showCreateBlocklist ? <p className="muted" role="alert">{formError}</p> : null}
                <label className="field">
                  <span className="sr-only">Name your blocklist</span>
                  <input
                    value={blocklistName}
                    onChange={(event) => setBlocklistName(event.target.value)}
                    placeholder="Name your blocklist"
                    required
                  />
                </label>

                <section className="blocking-composer-panel">
                  <h3>Your custom websites</h3>
                  {customWebsites.length ? (
                    <div className="blocking-site-chips">
                      {customWebsites.map((website) => (
                        <button
                          type="button"
                          className="blocking-site-chip"
                          key={website}
                          onClick={() => setCustomWebsites((current) => current.filter((item) => item !== website))}
                        >
                          {website}
                          <X size={12} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {showMultipleSites ? (
                    <>
                      <textarea
                        value={multipleSitesText}
                        onChange={(event) => setMultipleSitesText(event.target.value)}
                        placeholder="cnn.com, reddit.com"
                        aria-label="Add multiple sites"
                      />
                      <div className="form-actions">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => addCustomWebsites(parseWebsiteList(multipleSitesText))}
                        >
                          Add sites
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setShowMultipleSites(false);
                            setMultipleSitesText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="blocking-add-site">
                        <input
                          value={websiteDraft}
                          onChange={(event) => setWebsiteDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addCustomWebsites([normalizeWebsite(websiteDraft)]);
                          }}
                          placeholder="Add custom website (e.g. cnn.com)"
                          aria-label="Add custom website"
                        />
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => addCustomWebsites([normalizeWebsite(websiteDraft)])}
                        >
                          Add site
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        icon={Plus}
                        onClick={() => setShowMultipleSites(true)}
                      >
                        Add multiple sites
                      </Button>
                    </>
                  )}
                </section>

                <section className="blocking-composer-panel">
                  <h3>
                    Common filters
                    <span className="blocking-filter-help" title="Add a well-known site with one click.">
                      <CircleHelp size={13} aria-hidden="true" />
                      <span className="sr-only">Add a well-known site with one click.</span>
                    </span>
                  </h3>
                  <div className="blocking-filter-grid">
                    {COMMON_FILTERS.map((filter) => {
                      const selected = selectedCommonIds.includes(filter.id);
                      return (
                        <button
                          type="button"
                          className={`blocking-filter-chip ${selected ? "is-selected" : ""}`}
                          aria-pressed={selected}
                          key={filter.id}
                          onClick={() => toggleId(filter.id, selectedCommonIds, setSelectedCommonIds)}
                        >
                          <span className="blocking-filter-add">{selected ? <Check size={11} /> : <Plus size={11} />}</span>
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="blocking-composer-panel">
                  <h3>
                    Category filters
                    <span className="blocking-filter-help" title="Add a group of related sites.">
                      <CircleHelp size={13} aria-hidden="true" />
                      <span className="sr-only">Add a group of related sites.</span>
                    </span>
                  </h3>
                  <div className="blocking-filter-grid">
                    {CATEGORY_FILTERS.map((category) => {
                      const selected = selectedCategoryIds.includes(category.id);
                      return (
                        <button
                          type="button"
                          className={`blocking-filter-chip ${selected ? "is-selected" : ""}`}
                          aria-pressed={selected}
                          key={category.id}
                          onClick={() => toggleId(category.id, selectedCategoryIds, setSelectedCategoryIds)}
                        >
                          <span className="blocking-filter-add">{selected ? <Check size={11} /> : <Plus size={11} />}</span>
                          {category.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <Button className="blocking-composer-submit" variant="primary" type="submit" disabled={blocking.loading}>
                  Create blocklist
                </Button>
              </form>
            ) : null}
            {blocking.loading && !blocking.blocklists.length ? <LoadingState label="Loading blocklists…" /> : null}
            {!blocking.loading && !blocking.blocklists.length && !showCreateBlocklist ? (
              <EmptyState title="No blocklists" body="Create a blocklist with websites and apps to use in sessions." />
            ) : null}
            {blocking.blocklists.map((list) => (
              <div className="blocking-list-row" key={list.blocklist_id}>
                <span className="blocking-list-icon"><Shield size={14} aria-hidden="true" /></span>
                <span className="row-copy">
                  <span className="row-title">{list.name}</span>
                  <span className="row-subtitle">{list.entry_count} custom {list.entry_count === 1 ? "filter" : "filters"}</span>
                </span>
                <Badge>{list.entry_count}</Badge>
              </div>
            ))}
          </Grouped>
        </div>

        <div className="blocking-column">
          <Grouped
            className="blocking-devices"
            title="My Devices"
            description="Devices that can join a session"
            action={<Badge>{devices.length}</Badge>}
          >
            <div className="device-grid">
              {devices.map((device) => (
                <div className="device-card" key={device.visibilityKey}>
                  <div className="device-card-top">
                    <span className="device-icon">
                      {device.devicePlatform === "windows" ? <MonitorSmartphone size={15} /> : <Laptop2 size={15} />}
                    </span>
                    <span className="row-copy">
                      <span className="row-title">{device.deviceName}</span>
                      <span className="row-subtitle">{device.devicePlatform}</span>
                    </span>
                    <span className={`dot ${device.isOnline ? "online" : ""}`} title={device.isOnline ? "Online" : "Offline"} />
                  </div>
                </div>
              ))}
            </div>
            {!devices.length ? <p className="muted">Devices appear here after your first sync.</p> : null}
          </Grouped>

          <Grouped title="Options" description="Session behavior on this device">
            <Toggle
              label="Locked Mode"
              description="Keeps the session from ending early. Preview only."
              checked={lockedMode}
              onChange={setLockedMode}
              testId="blocking-locked-mode"
            />
          </Grouped>
        </div>
      </div>
    </div>
  );
}

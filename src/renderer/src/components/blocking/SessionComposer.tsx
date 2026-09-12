import { useEffect, useState, type FormEvent } from "react";
import { defaultTimeZone, WEEKDAYS, type SessionComposerDraft } from "@shared/blocking";
import type {
  Blocklist,
  BlockingScheduleBlocklistRef,
  BlockingScheduleDeviceRef,
  BlockingScheduleWritePayload,
  DeviceListEntry,
} from "@shared/types";
import { Button, TextField } from "../ui";

type RegisteredDevice = DeviceListEntry & { deviceID: string };

export function SessionComposer({
  initialDraft,
  blocklists,
  devices,
  extraBlocklists = [],
  extraDevices = [],
  submitLabel,
  loading = false,
  onSubmit,
  onCancel,
}: {
  initialDraft: SessionComposerDraft;
  blocklists: Blocklist[];
  devices: RegisteredDevice[];
  extraBlocklists?: BlockingScheduleBlocklistRef[];
  extraDevices?: BlockingScheduleDeviceRef[];
  submitLabel: string;
  loading?: boolean;
  onSubmit: (payload: BlockingScheduleWritePayload) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialDraft.name);
  const [startTime, setStartTime] = useState(initialDraft.startTime);
  const [endTime, setEndTime] = useState(initialDraft.endTime);
  const [timeZone, setTimeZone] = useState(initialDraft.timeZone);
  const [selectedDays, setSelectedDays] = useState(initialDraft.selectedDays);
  const [selectedBlocklistIds, setSelectedBlocklistIds] = useState(initialDraft.selectedBlocklistIds);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(initialDraft.selectedDeviceIds);
  const [error, setError] = useState<string | null>(null);

  const registeredIdKey = devices.map((device) => device.deviceID).join("|");

  useEffect(() => {
    if (initialDraft.selectedDeviceIds.length) return;
    const ids = registeredIdKey ? registeredIdKey.split("|") : [];
    setSelectedDeviceIds((current) => {
      if (!ids.length) return current.length ? current : [];
      if (!current.length) return ids;
      const keep = current.filter((id) => ids.includes(id));
      return keep.length ? keep : ids;
    });
  }, [initialDraft.selectedDeviceIds.length, registeredIdKey]);

  const canSubmit = Boolean(
    name.trim()
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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setError("Choose a name, time range, days, at least one blocklist, and one device.");
      return;
    }
    setError(null);
    const payload: BlockingScheduleWritePayload = {
      name: name.trim(),
      start_time: startTime,
      end_time: endTime,
      days_of_week: [...selectedDays].sort((a, b) => a - b),
      time_zone: timeZone.trim() || defaultTimeZone(),
      blocklist_ids: selectedBlocklistIds,
      device_ids: selectedDeviceIds,
    };
    if (initialDraft.isActive !== undefined) payload.is_active = initialDraft.isActive;
    onSubmit(payload);
  }

  const catalogIds = new Set(blocklists.map((list) => list.blocklist_id));
  const missingBlocklists = extraBlocklists.filter((list) => !catalogIds.has(list.blocklist_id));
  const registeredIds = new Set(devices.map((device) => device.deviceID));
  const missingDevices = extraDevices.filter((device) => !registeredIds.has(device.device_id));
  const hasBlocklists = Boolean(blocklists.length || missingBlocklists.length);
  const hasDevices = Boolean(devices.length || missingDevices.length);

  return (
    <form className="form blocking-create" onSubmit={submit}>
      {error ? <p className="muted" role="alert">{error}</p> : null}
      <TextField
        label="Session name"
        value={name}
        onChange={(event) => setName(event.target.value)}
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
        {!hasBlocklists ? (
          <p className="muted">Create a blocklist before scheduling a session.</p>
        ) : (
          <div className="blocking-check-list">
            {blocklists.map((list) => (
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
            {missingBlocklists.map((list) => (
              <label className="blocking-check-row" key={list.blocklist_id}>
                <input
                  type="checkbox"
                  checked={selectedBlocklistIds.includes(list.blocklist_id)}
                  onChange={() => toggleId(list.blocklist_id, selectedBlocklistIds, setSelectedBlocklistIds)}
                />
                <span>
                  <strong>{list.name}</strong>
                  <span className="row-subtitle">Unavailable</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset className="blocking-fieldset">
        <legend>Devices</legend>
        {!hasDevices ? (
          <p className="muted">No registered devices yet. Sync this computer first.</p>
        ) : (
          <div className="blocking-check-list" role="group" aria-label="Devices">
            {devices.map((device) => (
              <label className="blocking-device-option" key={device.deviceID}>
                <span className="row-title">{device.deviceName}</span>
                <input
                  type="checkbox"
                  checked={selectedDeviceIds.includes(device.deviceID)}
                  onChange={() => toggleId(device.deviceID, selectedDeviceIds, setSelectedDeviceIds)}
                />
              </label>
            ))}
            {missingDevices.map((device) => (
              <label className="blocking-device-option" key={device.device_id}>
                <span className="row-title">{device.device_name || device.label || device.device_id}</span>
                <input
                  type="checkbox"
                  checked={selectedDeviceIds.includes(device.device_id)}
                  onChange={() => toggleId(device.device_id, selectedDeviceIds, setSelectedDeviceIds)}
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Button variant="primary" type="submit" disabled={!canSubmit || loading}>
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </form>
  );
}

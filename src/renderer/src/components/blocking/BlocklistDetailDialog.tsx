import { useEffect, useState } from "react";
import { decomposeBlocklistEntries } from "@shared/blocking";
import type { Blocklist, BlocklistEntry, InstalledApplication } from "@shared/types";
import { AppWindow, Globe2, Shield, X } from "lucide-react";
import { Button, EmptyState, IconButton } from "../ui";
import { BlocklistComposer } from "./BlocklistComposer";

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function EntrySection({ title, entries }: { title: string; entries: BlocklistEntry[] }) {
  return (
    <section className="blocking-dialog-section" aria-label={title}>
      <div className="inspector-kicker">{title}</div>
      {entries.map((entry) => {
        const heading = entry.label || entry.identifier;
        const showIdentifier = Boolean(entry.label && entry.label !== entry.identifier);
        const Icon = entry.entry_type === "website" ? Globe2 : AppWindow;
        return (
          <div className="data-row" key={entry.entry_id}>
            <span className="blocking-dialog-entry-icon" aria-hidden="true">
              <Icon size={13} />
            </span>
            <span className="row-copy">
              <span className="row-title">{heading}</span>
              {showIdentifier ? <span className="row-subtitle">{entry.identifier}</span> : null}
            </span>
          </div>
        );
      })}
    </section>
  );
}

export function BlocklistDetailDialog({
  blocklist,
  loading = false,
  installedApplications,
  inventoryLoading = false,
  inventoryUnavailableReason = null,
  onRefreshInventory,
  editingDisabledReason,
  onClose,
}: {
  blocklist: Blocklist;
  loading?: boolean;
  installedApplications?: InstalledApplication[];
  inventoryLoading?: boolean;
  inventoryUnavailableReason?: string | null;
  onRefreshInventory?: () => void;
  editingDisabledReason?: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const websites = blocklist.entries.filter((entry) => entry.entry_type === "website");
  const apps = blocklist.entries.filter((entry) => entry.entry_type === "app");
  const count = blocklist.entry_count || blocklist.entries.length;

  useEffect(() => {
    setEditing(false);
  }, [blocklist]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (editing) {
        setEditing(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  return (
    <div className="blocking-dialog-scrim" onClick={onClose}>
      <div
        className={`blocking-dialog ${editing ? "blocking-dialog-composer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blocklist-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <IconButton
          className="blocking-dialog-close"
          label="Close blocklist details"
          icon={X}
          onClick={onClose}
        />
        {editing ? (
          <>
            <div className="inspector-kicker">Edit blocklist</div>
            <h2 id="blocklist-detail-title" className="sr-only">{blocklist.name}</h2>
            <BlocklistComposer
              key={`${blocklist.blocklist_id}-${blocklist.updated_at}`}
              initialName={blocklist.name}
              initialDraft={decomposeBlocklistEntries(blocklist.entries)}
              submitLabel="Save blocklist"
              loading={loading}
              installedApplications={installedApplications}
              inventoryLoading={inventoryLoading}
              inventoryUnavailableReason={inventoryUnavailableReason}
              onRefreshInventory={onRefreshInventory}
              onCancel={() => setEditing(false)}
              onSubmit={(payload) => {
                window.stopscrolling.updateBlocklist({
                  blocklist_id: blocklist.blocklist_id,
                  ...payload,
                });
                setEditing(false);
              }}
            />
          </>
        ) : (
          <>
            <div className="inspector-kicker">Blocklist</div>
            <div className="blocking-dialog-header">
              <span className="blocking-list-icon"><Shield size={14} aria-hidden="true" /></span>
              <span className="row-copy">
                <h2 id="blocklist-detail-title">{blocklist.name}</h2>
                <p className="muted">
                  {count} {count === 1 ? "entry" : "entries"}
                </p>
              </span>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={Boolean(editingDisabledReason)}
                title={editingDisabledReason}
                onClick={() => setEditing(true)}
              >
                Edit blocklist
              </Button>
            </div>
            {editingDisabledReason ? <p className="muted" role="status">{editingDisabledReason}</p> : null}
            <div className="data-row">
              <span className="row-title">Created</span>
              <span className="row-value muted">{formatTimestamp(blocklist.created_at)}</span>
            </div>
            <div className="data-row">
              <span className="row-title">Updated</span>
              <span className="row-value muted">{formatTimestamp(blocklist.updated_at)}</span>
            </div>
            {!blocklist.entries.length ? (
              <EmptyState
                title="No entries"
                body="This blocklist does not contain any websites or apps yet."
              />
            ) : (
              <>
                {websites.length ? <EntrySection title="Websites" entries={websites} /> : null}
                {apps.length ? <EntrySection title="Apps" entries={apps} /> : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

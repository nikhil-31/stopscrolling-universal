import { useState, type FormEvent } from "react";
import {
  CATEGORY_FILTERS,
  COMMON_FILTERS,
  collectBlocklistEntries,
  decomposeBlocklistEntries,
  normalizeWebsite,
  parseWebsiteList,
} from "@shared/blocking";
import type { BlocklistWritePayload, InstalledApplication } from "@shared/types";
import { AppWindow, Check, CircleHelp, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "../ui";

type ComposerDraft = ReturnType<typeof decomposeBlocklistEntries>;

const emptyDraft: ComposerDraft = {
  customWebsites: [],
  commonFilterIds: [],
  categoryIds: [],
  appEntries: [],
};

function installedApplicationIdentifier(application: InstalledApplication) {
  return application.signingIdentifier
    || application.bundleIdentifier
    || application.packageFamilyName
    || application.publisherThumbprint
    || application.executablePath;
}

export function BlocklistComposer({
  initialName = "",
  initialDraft = emptyDraft,
  submitLabel,
  loading = false,
  installedApplications,
  inventoryLoading = false,
  inventoryUnavailableReason = null,
  onRefreshInventory,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialDraft?: ComposerDraft;
  submitLabel: string;
  loading?: boolean;
  installedApplications?: InstalledApplication[];
  inventoryLoading?: boolean;
  inventoryUnavailableReason?: string | null;
  onRefreshInventory?: () => void;
  onSubmit: (payload: BlocklistWritePayload) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [customWebsites, setCustomWebsites] = useState(initialDraft.customWebsites);
  const [selectedCommonIds, setSelectedCommonIds] = useState(initialDraft.commonFilterIds);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(initialDraft.categoryIds);
  const [selectedApps, setSelectedApps] = useState(() => {
    const entries = new Map<string, ComposerDraft["appEntries"][number]>();
    for (const entry of initialDraft.appEntries) entries.set(entry.identifier, entry);
    return [...entries.values()];
  });
  const [appSearch, setAppSearch] = useState("");
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [multipleSitesText, setMultipleSitesText] = useState("");
  const [showMultipleSites, setShowMultipleSites] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applicationOptions = [...new Map(
    (installedApplications ?? [])
      .map((application) => [installedApplicationIdentifier(application), application] as const)
      .filter(([identifier]) => Boolean(identifier)),
  ).values()];
  const normalizedAppSearch = appSearch.trim().toLocaleLowerCase();
  const visibleApplications = applicationOptions.filter((application) => (
    application.displayName.toLocaleLowerCase().includes(normalizedAppSearch)
    || installedApplicationIdentifier(application).toLocaleLowerCase().includes(normalizedAppSearch)
  ));

  function toggleId(id: string, selected: string[], setSelected: (next: string[]) => void) {
    setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  function addCustomWebsites(values: string[]) {
    const next = values.filter(Boolean);
    if (!next.length) return;
    setCustomWebsites((current) => [...new Set([...current, ...next])]);
    setWebsiteDraft("");
    setMultipleSitesText("");
    setShowMultipleSites(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const entries = [
      ...collectBlocklistEntries({
        customWebsites,
        commonFilterIds: selectedCommonIds,
        categoryIds: selectedCategoryIds,
      }),
      ...selectedApps,
    ];
    if (!name.trim() || !entries.length) {
      setError("Add a name and at least one website, app, or filter.");
      return;
    }
    setError(null);
    onSubmit({ name: name.trim(), entries });
  }

  return (
    <form className="form blocking-create blocking-composer" onSubmit={submit}>
      {error ? <p className="muted" role="alert">{error}</p> : null}
      <label className="field">
        <span className="sr-only">Name your blocklist</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
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
          Applications
          <span className="blocking-filter-help" title="Apps are stored using a stable helper-provided identifier.">
            <CircleHelp size={13} aria-hidden="true" />
            <span className="sr-only">Apps are stored using a stable helper-provided identifier.</span>
          </span>
        </h3>
        {selectedApps.length ? (
          <div className="blocking-site-chips" aria-label="Selected applications">
            {selectedApps.map((app) => (
              <button
                type="button"
                className="blocking-site-chip"
                key={app.identifier}
                onClick={() => setSelectedApps((current) => current.filter((item) => item.identifier !== app.identifier))}
                aria-label={`Remove ${app.label || app.identifier}`}
              >
                <AppWindow size={12} aria-hidden="true" />
                {app.label || app.identifier}
                <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        {inventoryLoading || installedApplications === undefined ? (
          <p className="muted" role="status">Loading installed applications…</p>
        ) : inventoryUnavailableReason ? (
          <div>
            <p className="muted">Application inventory unavailable: {inventoryUnavailableReason}</p>
            {onRefreshInventory ? (
              <Button type="button" size="sm" variant="secondary" icon={RefreshCw} onClick={onRefreshInventory}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : applicationOptions.length ? (
          <>
            <label className="blocking-app-search">
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">Search installed applications</span>
              <input
                type="search"
                value={appSearch}
                onChange={(event) => setAppSearch(event.target.value)}
                placeholder="Search installed applications"
              />
            </label>
            <div className="blocking-check-list blocking-app-list">
              {visibleApplications.map((application) => {
                  const identifier = installedApplicationIdentifier(application);
                  const selected = selectedApps.some((entry) => entry.identifier === identifier);
                  return (
                    <label className="blocking-check-row" key={identifier}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelectedApps((current) => (
                          selected
                            ? current.filter((entry) => entry.identifier !== identifier)
                            : [...current, {
                                entry_type: "app",
                                identifier,
                                label: application.displayName,
                              }]
                        ))}
                      />
                      <span>
                        <strong>{application.displayName}</strong>
                        <span className="row-subtitle">{identifier}</span>
                      </span>
                    </label>
                  );
                })}
            </div>
            {appSearch && !visibleApplications.length
              ? <p className="muted">No installed applications match “{appSearch}”.</p>
              : null}
          </>
        ) : (
          <p className="muted">No installed applications were found.</p>
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

      <Button className="blocking-composer-submit" variant="primary" type="submit" disabled={loading}>
        {submitLabel}
      </Button>
      {onCancel && !showMultipleSites ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </form>
  );
}

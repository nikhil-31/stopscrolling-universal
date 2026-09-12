import { useState, type FormEvent } from "react";
import {
  CATEGORY_FILTERS,
  COMMON_FILTERS,
  collectBlocklistEntries,
  decomposeBlocklistEntries,
  normalizeWebsite,
  parseWebsiteList,
} from "@shared/blocking";
import type { BlocklistWritePayload } from "@shared/types";
import { Check, CircleHelp, Plus, X } from "lucide-react";
import { Button } from "../ui";

type ComposerDraft = ReturnType<typeof decomposeBlocklistEntries>;

const emptyDraft: ComposerDraft = {
  customWebsites: [],
  commonFilterIds: [],
  categoryIds: [],
  appEntries: [],
};

export function BlocklistComposer({
  initialName = "",
  initialDraft = emptyDraft,
  submitLabel,
  loading = false,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialDraft?: ComposerDraft;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (payload: BlocklistWritePayload) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [customWebsites, setCustomWebsites] = useState(initialDraft.customWebsites);
  const [selectedCommonIds, setSelectedCommonIds] = useState(initialDraft.commonFilterIds);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(initialDraft.categoryIds);
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [multipleSitesText, setMultipleSitesText] = useState("");
  const [showMultipleSites, setShowMultipleSites] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      ...initialDraft.appEntries,
    ];
    if (!name.trim() || !entries.length) {
      setError("Add a name and at least one website or filter.");
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

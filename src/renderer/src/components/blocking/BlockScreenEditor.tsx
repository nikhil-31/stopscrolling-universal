import { useEffect, useState } from "react";
import { Button, TextField } from "../ui";

export interface BlockScreenDraft {
  imageFile: string;
  imageUrl: string;
  header: string;
  detail: string;
}

export function emptyBlockScreenDraft(): BlockScreenDraft {
  return { imageFile: "", imageUrl: "", header: "", detail: "" };
}

export function BlockScreenEditor({
  value,
  onChange,
  hint,
}: {
  value: BlockScreenDraft;
  onChange: (next: BlockScreenDraft) => void;
  hint: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; label: string; imageUrl: string }>>([]);

  useEffect(() => {
    const list = window.stopscrolling.listBlockScreenPresets;
    if (!list) return;
    void list().then(setPresets).catch(() => {});
  }, []);

  async function chooseImage() {
    setError(null);
    const chosen = await window.stopscrolling.chooseBlockScreenImage();
    if (!chosen) return;
    if ("error" in chosen) {
      setError(chosen.error);
      return;
    }
    onChange({ ...value, imageFile: chosen.imageFile, imageUrl: chosen.imageUrl });
  }

  return (
    <div className="block-screen-editor">
      <p className="muted">{hint}</p>
      {error ? <p className="muted" role="alert">{error}</p> : null}
      <div className="block-screen-preview" aria-hidden="true">
        {value.imageUrl ? <img src={value.imageUrl} alt="" /> : <span className="block-screen-preview-mark" />}
        <strong>{value.header.trim() || "You are free."}</strong>
        <span>{value.detail.trim() || "Do what matters."}</span>
        <em>Stop Scrolling</em>
      </div>
      {presets.length ? (
        <div className="block-screen-gallery" role="listbox" aria-label="Images and GIFs">
          {presets.map((preset) => {
            const selected = value.imageFile === `preset:${preset.id}`;
            return (
              <button
                key={preset.id}
                type="button"
                role="option"
                className={`block-screen-choice${selected ? " is-selected" : ""}`}
                aria-selected={selected}
                aria-label={preset.label}
                onClick={() => onChange({
                  ...value,
                  imageFile: `preset:${preset.id}`,
                  imageUrl: preset.imageUrl,
                })}
              >
                <img src={preset.imageUrl} alt="" />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="block-screen-actions">
        <Button type="button" size="sm" onClick={() => void chooseImage()}>
          Choose from your files
        </Button>
        {value.imageFile ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange({ ...value, imageFile: "", imageUrl: "" })}
          >
            Remove image
          </Button>
        ) : null}
      </div>
      <TextField
        label="Header"
        value={value.header}
        onChange={(event) => onChange({ ...value, header: event.target.value })}
        placeholder="You are free."
      />
      <TextField
        label="Detail"
        value={value.detail}
        onChange={(event) => onChange({ ...value, detail: event.target.value })}
        placeholder="Do what matters."
      />
    </div>
  );
}

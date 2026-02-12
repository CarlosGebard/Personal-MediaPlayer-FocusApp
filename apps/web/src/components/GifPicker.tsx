import React, { useEffect, useMemo, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const PRESETS = ["auto"] as const;

export function GifPicker({ value, onChange }: Props) {
  const initialMode = useMemo(() => {
    if (!value) return "auto";
    return "custom";
  }, [value]);

  const [mode, setMode] = useState<string>(initialMode);
  const [custom, setCustom] = useState<string>(value && initialMode === "custom" ? value : "");
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/gifs/manifest.json")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.gifs)) {
          setOptions(data.gifs);
        }
      })
      .catch(() => {
        setOptions([]);
      });
  }, []);

  useEffect(() => {
    if (mode === "custom") {
      onChange(custom.trim());
    } else {
      onChange("");
    }
  }, [mode, custom, onChange]);

  return (
    <div className="card gif-picker-card">
      <div className="gif-picker-header">
        <div>
          <h3>Header gif</h3>
          <div className="chat-subtitle">Choose the gif displayed next to Account.</div>
        </div>
      </div>
      <div className="gif-picker-controls">
        <select
          className="chat-input chat-select chat-select--compact"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="auto">Auto (by tab)</option>
          <option value="custom">Custom</option>
        </select>
        {mode === "custom" ? (
          <input
            className="chat-input"
            placeholder="gif name (without .gif)"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
        ) : null}
      </div>
      {options.length > 0 ? (
        <div className="gif-picker-options">
          {options.map((gif) => (
            <button
              key={gif}
              type="button"
              className={`btn btn-ghost btn-sm ${custom === gif ? "active" : ""}`}
              onClick={() => {
                setMode("custom");
                setCustom(gif);
              }}
            >
              {gif}
            </button>
          ))}
        </div>
      ) : null}
      <div className="chat-subtitle">
        Files are loaded from `public/gifs/` and must be named like `focus.gif`.
      </div>
    </div>
  );
}

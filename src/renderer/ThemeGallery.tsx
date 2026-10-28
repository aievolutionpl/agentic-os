import React from "react";
import type { ThemeMode } from "../shared";
import { THEME_CHOICES, THEME_PREVIEWS } from "./theme-catalog";
import { Icon } from "./ui";

/** Every palette as a small preview; native radios keep arrow-key selection. */
export function ThemeGallery({ value, pl, disabled, onChange }: { value: ThemeMode; pl: boolean; disabled?: boolean; onChange: (theme: ThemeMode) => void }) {
  return <fieldset className="theme-gallery" disabled={disabled}>
    <legend>{pl ? "Motyw" : "Theme"}</legend>
    <div className="theme-gallery-grid">
      {THEME_CHOICES.map(({ value: theme, label }) => {
        const p = THEME_PREVIEWS[theme];
        return <label key={theme} className="theme-card">
          <input type="radio" name="workspace-theme" value={theme} checked={value === theme} onChange={() => onChange(theme)} />
          <span className="theme-preview" aria-hidden="true" style={{ background: p.bg, ["--p-surface" as string]: p.surface, ["--p-accent" as string]: p.accent }}><i style={{ background: p.nav }} /><b /></span>
          <span>{label}{value === theme && <Icon name="check" />}</span>
        </label>;
      })}
    </div>
  </fieldset>;
}

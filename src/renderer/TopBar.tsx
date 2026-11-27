import React from "react";
import type { Preferences } from "../shared";
import { Icon, SelectField } from "./ui";
import { THEME_CHOICES } from "./theme-catalog";
import { QuotaStrip } from "./QuotaStrip";
import { words } from "./i18n";

/** Workspace header: back, breadcrumb, palette picker, search, settings and quota strip. */
export function TopBar({
  prefs,
  screenTitle,
  projectName,
  projectsExpanded,
  projectsToggleRef,
  canGoBack,
  disabled,
  onOpenProjects,
  onBack,
  onTheme,
  onSearch,
  onSettings,
  onQuota,
}: {
  prefs: Preferences;
  screenTitle: string;
  projectName?: string;
  projectsExpanded: boolean;
  projectsToggleRef: React.Ref<HTMLButtonElement>;
  canGoBack: boolean;
  disabled: boolean;
  /** Present only in the narrow layout, where projects live in a drawer. */
  onOpenProjects?: () => void;
  onBack: () => void;
  onTheme: (theme: Preferences["theme"]) => void;
  onSearch: () => void;
  onSettings: () => void;
  onQuota: () => void;
}) {
  const w = words[prefs.language];
  return (
    <div className="compact-workspace-header"><header className="top-bar">
      {onOpenProjects && (
        <button
          ref={projectsToggleRef}
          className="projects-toggle icon-button"
          title={w.projects}
          aria-label={w.projects}
          aria-controls="project-navigation"
          aria-expanded={projectsExpanded}
          onClick={onOpenProjects}
        >
          <Icon name="menu" />
        </button>
      )}
      {canGoBack && (
        <button
          className="icon-button view-back"
          title={`${prefs.language === "pl" ? "Wstecz" : "Back"} (Alt+←)`}
          aria-label={prefs.language === "pl" ? "Wstecz" : "Back"}
          aria-keyshortcuts="Alt+ArrowLeft"
          onClick={onBack}
        >
          <Icon name="back" />
        </button>
      )}
      <div className="breadcrumb">
        <span>{w.workspace}</span>
        <Icon name="chevron" />
        <strong title={projectName} aria-current="page">
          {screenTitle}
        </strong>
      </div>
      <div className="settings">
        <SelectField label={prefs.language === "pl" ? "Kolorystyka" : "Color palette"} value={prefs.theme} options={THEME_CHOICES} icon="palette" className="top-theme-picker" disabled={disabled} onChange={theme => onTheme(theme as Preferences["theme"])} />
        <button
          className="palette-trigger"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={onSearch}
        >
          <Icon name="search" />
          <span>{prefs.language === "pl" ? "Szukaj" : "Search"}</span>
        </button>
        <button className="icon-button" aria-label={prefs.language === "pl" ? "Ustawienia" : "Settings"} onClick={onSettings}><Icon name="settings" /></button>
      </div>
    </header>
    <QuotaStrip pl={prefs.language === "pl"} onOpen={onQuota} /></div>
  );
}

import { Icon, Modal, SelectField } from "./ui";
import type { Preferences } from "../shared";
import type { View } from "./views";
import { words } from "./i18n";
import { ThemeGallery } from "./ThemeGallery";
import { WorkspaceCustomization } from "./WorkspaceCustomization";
import { VoiceSettings } from "./VoiceSettings";
import companyLogo from "./assets/ai-evolution.png";

const api = window.agenting;

/** Workspace settings: language, palette, layout, voice and shortcuts to deeper settings. */
export function SettingsDialog({
  open,
  onClose,
  prefs,
  disabled,
  onPreferences,
  onNavigate,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  disabled: boolean;
  onPreferences: (patch: Partial<Preferences>) => void;
  onNavigate: (view: View) => void;
  onError: () => void;
}) {
  const w = words[prefs.language];
  return (
    <Modal open={open} onClose={onClose} titleId="workspace-settings-title" className="workspace-settings-dialog">
      <h2 id="workspace-settings-title">{prefs.language === "pl" ? "Ustawienia" : "Settings"}</h2>
      <p>{prefs.language === "pl" ? "Wygląd i język" : "Appearance and language"}</p>
      <div className="settings-fields">            <SelectField
            label={w.language}
            value={prefs.language}
            options={[
              { value: "en", label: "English" },
              { value: "pl", label: "Polski" },
            ]}
            disabled={disabled}
            onChange={(value) =>
              onPreferences({ language: value as Preferences["language"] })
            }
            icon="globe"
            className="language-select"
          />
  </div>
      <ThemeGallery value={prefs.theme} pl={prefs.language === "pl"} disabled={disabled} onChange={theme => onPreferences({ theme })} />
      <WorkspaceCustomization pl={prefs.language === "pl"}/><VoiceSettings pl={prefs.language === "pl"}/>
      <div className="settings-links">{([
        ["connections", "connections", "Agenci i modele", "Agents and models"],
        ["plugins", "connections", "Pluginy i aplikacje", "Plugins and apps"],
        ["skills", "skill", "Biblioteka skili", "Skills library"],
        ["harness", "layers", "Instrukcja agenta i pamięć", "Agent instructions and memory"],
      ] as const).map(([id, icon, pl, en]) => <button className="secondary" key={id} onClick={() => { onNavigate(id); onClose(); }}><Icon name={icon} />{prefs.language === "pl" ? pl : en}<Icon name="chevron" /></button>)}</div>
      <section className="settings-about" aria-label="O aplikacji">
        <img className="company-logo" src={companyLogo} alt="AI Evolution Polska" /><div><h3>Agenting OS</h3><p>{prefs.language === "pl" ? "Stworzone przez AI Evolution Polska. Rozmowy, projekty i pamięć agentów w jednej lokalnej przestrzeni pracy." : "Built by AI Evolution Polska. Conversations, projects and agent memory in one local workspace."}</p>
        <div className="about-links">{[["GitHub", "https://github.com/aievolutionpl/agentic-os"], ["AI Evolution Polska", "https://www.aievolutionpolska.pl"]].map(([label, url]) => <button key={url} className="text-action" onClick={() => void api?.openExternalLink?.({url: url!}).catch(onError)}>{label}<Icon name="arrow" /></button>)}</div></div>
      </section>
    </Modal>
  );
}

import React, {useState} from "react";

type Preferences = {language: "pl" | "en"; model: "tiny" | "base" | "small"; shortcut: string};
const key = "agenting-voice-v1";
export function voicePreferences(): Preferences {
  let p: Partial<Preferences> = {};
  try { p = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* Retain defaults. */ }
  return {language: p?.language === "en" ? "en" : "pl",
    model: p?.model === "tiny" || p?.model === "small" ? p.model : "base",
    shortcut: ["F8", "F9", "F10", "none"].includes(p?.shortcut || "") ? p.shortcut! : "F8"};
}

export function VoiceSettings() {
  const [prefs, setPrefs] = useState(voicePreferences);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  function save(next: Preferences) {
    localStorage.setItem(key, JSON.stringify(next)); setPrefs(next);
    window.dispatchEvent(new Event("agenting-voice-settings"));
  }
  async function download() {
    setBusy(true); setStatus("Pobieranie i sprawdzanie modelu. Pierwsze uruchomienie może potrwać kilka minut…");
    try {
      if (!window.agenting?.voicePrepare) throw Error("UNAVAILABLE");
      await window.agenting.voicePrepare({model: prefs.model});
      setStatus(`Model ${prefs.model} jest gotowy do pracy lokalnej.`);
    } catch { setStatus("Nie udało się przygotować modelu. Sprawdź połączenie, instalację OpenAI Whisper w Pythonie oraz FFmpeg. Spróbuj ponownie po zakończeniu dyktowania."); }
    finally { setBusy(false); }
  }
  return <fieldset className="workspace-customization voice-settings"><legend>Głos i dyktowanie</legend>
    <label>Język nagrania<select value={prefs.language} onChange={e=>save({...prefs,language:e.target.value as Preferences["language"]})}><option value="pl">Polski (domyślnie)</option><option value="en">English</option></select></label>
    <label>Model Whisper<select disabled={busy} value={prefs.model} onChange={e=>{setStatus("");save({...prefs,model:e.target.value as Preferences["model"]});}}><option value="tiny">Tiny — szybszy, mniej dokładny</option><option value="base">Base — zrównoważony</option><option value="small">Small — dokładniejszy, wolniejszy</option></select></label>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void download()}>{busy ? "Przygotowywanie modelu…" : "Pobierz / sprawdź model"}</button>
    <label>Przytrzymaj, aby mówić<select value={prefs.shortcut} onChange={e=>save({...prefs,shortcut:e.target.value})}>{["F8","F9","F10"].map(value=><option key={value}>{value}</option>)}<option value="none">Wyłącz skrót</option></select></label>
    <p>Skrót działa w aktywnym oknie rozmowy. Puść klawisz, aby zakończyć nagranie. Możesz też kliknąć mikrofon, a następnie stop. Limit nagrania: 60 sekund. Tekst sprawdzasz przed wysłaniem.</p>
    <p>Wymagane: Python z pakietem openai-whisper oraz FFmpeg dostępne w PATH. Modele są pobierane przy pierwszym użyciu; później transkrypcja działa lokalnie.</p>
    <p role="status">{status}</p>
  </fieldset>;
}

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

export function VoiceSettings({ pl = true }: { pl?: boolean }) {
  const [prefs, setPrefs] = useState(voicePreferences);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  function save(next: Preferences) {
    localStorage.setItem(key, JSON.stringify(next)); setPrefs(next);
    window.dispatchEvent(new Event("agenting-voice-settings"));
  }
  async function download() {
    setBusy(true); setStatus(pl ? "Pobieranie i sprawdzanie modelu. Pierwsze uruchomienie może potrwać kilka minut…" : "Downloading and checking the model. The first run can take a few minutes…");
    try {
      if (!window.agenting?.voicePrepare) throw Error("UNAVAILABLE");
      await window.agenting.voicePrepare({model: prefs.model});
      setStatus(pl ? `Model ${prefs.model} jest gotowy do pracy lokalnej.` : `Model ${prefs.model} is ready for local use.`);
    } catch { setStatus(pl ? "Nie udało się przygotować modelu. Sprawdź połączenie, instalację OpenAI Whisper w Pythonie oraz FFmpeg. Spróbuj ponownie po zakończeniu dyktowania." : "Could not prepare the model. Check your connection, the OpenAI Whisper Python package and FFmpeg, then try again after dictation ends."); }
    finally { setBusy(false); }
  }
  return <fieldset className="workspace-customization voice-settings"><legend>{pl ? "Głos i dyktowanie" : "Voice and dictation"}</legend>
    <label>{pl ? "Język nagrania" : "Recording language"}<select value={prefs.language} onChange={e=>save({...prefs,language:e.target.value as Preferences["language"]})}><option value="pl">{pl ? "Polski (domyślnie)" : "Polish (default)"}</option><option value="en">English</option></select></label>
    <label>{pl ? "Model Whisper" : "Whisper model"}<select disabled={busy} value={prefs.model} onChange={e=>{setStatus("");save({...prefs,model:e.target.value as Preferences["model"]});}}><option value="tiny">{pl ? "Tiny — szybszy, mniej dokładny" : "Tiny — faster, less accurate"}</option><option value="base">{pl ? "Base — zrównoważony" : "Base — balanced"}</option><option value="small">{pl ? "Small — dokładniejszy, wolniejszy" : "Small — more accurate, slower"}</option></select></label>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void download()}>{busy ? (pl ? "Przygotowywanie modelu…" : "Preparing model…") : (pl ? "Pobierz / sprawdź model" : "Download / check model")}</button>
    <label>{pl ? "Przytrzymaj, aby mówić" : "Hold to talk"}<select value={prefs.shortcut} onChange={e=>save({...prefs,shortcut:e.target.value})}>{["F8","F9","F10"].map(value=><option key={value}>{value}</option>)}<option value="none">{pl ? "Wyłącz skrót" : "Turn off shortcut"}</option></select></label>
    <p>{pl ? "Skrót działa w aktywnym oknie rozmowy. Puść klawisz, aby zakończyć nagranie. Możesz też kliknąć mikrofon, a następnie stop. Limit nagrania: 60 sekund. Tekst sprawdzasz przed wysłaniem." : "The shortcut works in the active conversation. Release the key to stop recording, or click the microphone and then stop. Recordings are limited to 60 seconds, and you review the text before sending."}</p>
    <p>{pl ? "Wymagane: Python z pakietem openai-whisper oraz FFmpeg dostępne w PATH. Modele są pobierane przy pierwszym użyciu; później transkrypcja działa lokalnie." : "Requires Python with the openai-whisper package and FFmpeg on PATH. Models download on first use; after that transcription runs locally."}</p>
    <p role="status">{status}</p>
  </fieldset>;
}

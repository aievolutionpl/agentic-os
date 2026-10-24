import React, {useEffect, useRef, useState} from "react";
import {Mic, Square} from "lucide-react";
import {voicePreferences} from "./VoiceSettings";

export function VoiceInput({onText, pl}: {onText: (text: string) => void; pl: boolean}) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [prefs, setPrefs] = useState(voicePreferences);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true), busy = useRef(false), released = useRef(false), held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onTextRef = useRef(onText); onTextRef.current = onText;
  useEffect(() => {
    alive.current = true;
    const update = () => setPrefs(voicePreferences());
    window.addEventListener("agenting-voice-settings", update);
    return () => {
      alive.current = false; clearTimeout(timer.current);
      window.removeEventListener("agenting-voice-settings", update);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  async function start() {
    if (busy.current) return;
    busy.current = true; setError(""); setState("starting");
    const preferences = voicePreferences();
    try {
      if (!await window.agenting?.voiceBegin?.()) throw Error("Zainstaluj lokalne Whisper i FFmpeg. Model przygotujesz w ustawieniach głosu.");
      const media = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
      if (!alive.current || released.current) {
        media.getTracks().forEach(track => track.stop()); busy.current = false;
        if (alive.current) setState("idle"); return;
      }
      stream.current = media;
      const r = new MediaRecorder(media, {mimeType: "audio/webm"}); recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
      r.onstop = async () => {
        clearTimeout(timer.current); held.current = false;
        media.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        setState("transcribing");
        try {
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
          if (!bytes.length) return;
          if (bytes.length > 8_000_000) throw Error("AUDIO_TOO_LARGE");
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const result = await window.agenting!.voiceTranscribe!({audio: btoa(binary), language: preferences.language, model: preferences.model});
          if (alive.current && result) onTextRef.current(result);
        } catch {
          if (alive.current) setError(pl ? "Transkrypcja nie powiodła się. Sprawdź Whisper i pobierz wybrany model w ustawieniach." : "Transcription failed. Check Whisper and download the selected model in settings.");
        } finally {busy.current = false; if (alive.current) setState("idle");}
      };
      r.start(); setState("recording");
      timer.current = setTimeout(() => {if (r.state === "recording") r.stop();}, 60000);
    } catch (e) {
      busy.current = false; held.current = false;
      stream.current?.getTracks().forEach(track => track.stop());
      if (alive.current) {setState("idle"); setError(e instanceof Error ? e.message : "Mikrofon niedostępny");}
    }
  }
  const startRef = useRef(start); startRef.current = start;
  useEffect(() => {
    const stop = () => {released.current = true; held.current = false; if (recorder.current?.state === "recording") recorder.current.stop();};
    const down = (e: KeyboardEvent) => {
      if (e.code !== voicePreferences().shortcut || e.repeat || busy.current || document.querySelector('dialog[open]')) return;
      e.preventDefault(); held.current = true; released.current = false; void startRef.current();
    };
    const up = (e: KeyboardEvent) => {if (held.current && e.code === voicePreferences().shortcut) {e.preventDefault(); stop();}};
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", stop);
    return () => {window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", stop);};
  }, []);
  const hint = `Dyktowanie · ${prefs.language.toUpperCase()}${prefs.shortcut === "none" ? "" : ` · przytrzymaj ${prefs.shortcut}`}`;
  return <div className="voice-input">
    <button type="button" aria-label={state === "recording" ? "Zatrzymaj dyktowanie" : "Dyktowanie"} aria-pressed={state === "recording"} title={hint} className="secondary voice-microphone" disabled={state === "starting" || state === "transcribing"} onClick={() => {
      if (state === "recording") recorder.current?.stop(); else {released.current = false; void start();}
    }}>{state === "recording" ? <Square size={18}/> : <Mic size={18}/>}</button>
    <small role="status">{state === "transcribing" ? "Transkrypcja…" : state === "starting" ? "Uruchamianie mikrofonu…" : hint}</small>
    {(state === "recording" || state === "transcribing") && <div className="voice-recording" role="status"><span className="voice-wave" aria-hidden="true">▂ ▅ ▇ ▃ ▆</span>{state === "recording" ? "Nagrywanie · puść skrót lub kliknij stop" : "Zamieniam głos na tekst…"}</div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

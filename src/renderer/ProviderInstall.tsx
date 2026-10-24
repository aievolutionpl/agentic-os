import React, { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Agent, ProviderInstallPlan, TerminalSession } from "../shared";
const TerminalView = lazy(() => import("./TerminalPanel").then(module => ({ default: module.TerminalView })));

export function ProviderInstall({ agent, pl, onDetect }: { agent: Agent; pl: boolean; onDetect: () => Promise<void> }) {
  const [plan, setPlan] = useState<ProviderInstallPlan | null>(null);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [loginSession, setLoginSession] = useState<TerminalSession | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const state = await window.agenting?.providerInstallStatus?.({ agent });
    if (!state) return;
    setPlan(state.plan); setSession(state.session);
    if (state.session?.state === "exited") {
      setNotice(state.installed
        ? (pl ? "Instalacja zakończona, CLI wykryte. Teraz zaloguj się i sprawdź połączenie." : "Installation finished and CLI detected. Sign in and check the connection next.")
        : (pl ? "Instalacja niepotwierdzona. Sprawdź wynik w terminalu i ponów próbę." : "Installation not confirmed. Check the terminal output and retry."));
    }
  }, [agent, pl]);
  useEffect(() => {
    let live = true;
    void window.agenting?.providerInstallStatus?.({ agent }).then(state => {
      if (state && live) { setPlan(state.plan); setSession(state.session); }
    }).catch(() => { if (live) setNotice(pl ? "Nie udało się sprawdzić instalacji." : "Could not check installation."); });
    return () => { live = false; };
  }, [agent, pl]);
  const finished = useCallback(() => { void refresh().then(onDetect).catch(() => setNotice(pl ? "Wykrywanie nie powiodło się." : "Detection failed.")); }, [refresh, onDetect, pl]);
  if (!["codex", "claude", "antigravity"].includes(agent) || !window.agenting?.providerInstallStart) return null;
  return <section className="provider-install">
    {plan && <>
      <p>{pl ? "Oficjalne polecenie dla Twojego systemu:" : "Official command for your system:"}</p>
      <pre><code>{plan.command}</code></pre>
      {!!plan.missing.length && <p role="alert">{pl ? "Najpierw zainstaluj: " : "Install first: "}{plan.missing.join(", ")}</p>}
      <button type="button" className="secondary" disabled={busy} onClick={() => { void refresh().catch(() => setNotice(pl ? "Sprawdzenie nie powiodło się." : "Check failed.")); }}>{pl ? "Sprawdź wymagania ponownie" : "Recheck prerequisites"}</button>
      {plan.executable && <p>{pl ? "CLI już dostępne. Instalacja ponownie uruchomi oficjalny instalator." : "CLI already available. Install runs the official installer again."}</p>}
      <button type="button" className="secondary" disabled={!plan.ready || busy || session?.state === "running"} onClick={() => {
        setBusy(true); setNotice("");
        void window.agenting!.providerInstallStart!({ agent, consent: true }).then(setSession)
          .catch(() => setNotice(pl ? "Nie udało się rozpocząć instalacji. Sprawdź zależności i spróbuj ponownie." : "Could not start installation. Check dependencies and retry."))
          .finally(() => setBusy(false));
      }}>{pl ? "Zainstaluj w terminalu" : "Install in terminal"}</button>
      <button type="button" className="secondary" disabled={!plan.executable || busy || !!loginSession || session?.state === "running"} onClick={() => {
        setBusy(true);
        void window.agenting!.providerLoginStart!({ agent, consent: true }).then(setLoginSession)
          .catch(() => setNotice(pl ? "Logowanie nie wystartowało. Sprawdź instalację CLI." : "Login did not start. Check CLI installation."))
          .finally(() => setBusy(false));
      }}>{pl ? "Zaloguj przez oficjalne CLI" : "Sign in with official CLI"}</button>
      {session?.state === "running" && <button type="button" className="secondary" disabled={busy} onClick={() => {
        setBusy(true);
        void window.agenting!.terminalClose!({ id: session.id }).then(() => { setSession(null); setNotice(pl ? "Instalację przerwano. Część plików mogła już zostać pobrana." : "Installation stopped. Some files may already have been downloaded."); })
          .catch(() => setNotice(pl ? "Nie udało się potwierdzić zatrzymania." : "Could not confirm cancellation."))
          .finally(() => setBusy(false));
      }}>{pl ? "Przerwij instalację" : "Cancel installation"}</button>}
    </>}
    {notice && <p role="status">{notice}</p>}
    {loginSession && <>
      <p>{pl ? "Dokończ oficjalne logowanie, potem sprawdź połączenie poniżej. Samo otwarcie terminala nie potwierdza logowania." : "Complete the official login, then check the connection below. Opening the terminal does not confirm authentication."}</p>
      <Suspense fallback={<p>Terminal…</p>}><TerminalView session={loginSession} pl={pl} theme="dark" onExit={() => { void onDetect(); }} /></Suspense>
      <button type="button" className="secondary" onClick={() => {
        void window.agenting!.terminalClose!({ id: loginSession.id }).then(() => setLoginSession(null)).catch(() => setNotice(pl ? "Nie udało się zamknąć sesji." : "Could not close session."));
      }}>{pl ? "Zamknij terminal logowania" : "Close login terminal"}</button>
    </>}
    {session && <Suspense fallback={<p>{pl ? "Otwieranie terminala…" : "Opening terminal…"}</p>}>
      <TerminalView session={session} pl={pl} theme="dark" onExit={finished} />
    </Suspense>}
  </section>;
}

import React, { useEffect, useState } from "react";
import type { Agent, ProviderSetting } from "../shared";
import { SelectField } from "./ui";
export function ProviderSetup({ language }: { language: "pl" | "en" }) {
  const pl = language === "pl",
    api = window.agenting!;
  const [settings, setSettings] = useState<ProviderSetting[]>([]),
    [agent, setAgent] = useState<Agent>("codex"),
    [command, setCommand] = useState(""),
    [args, setArgs] = useState("[]"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState<"saved" | "error" | "login" | null>(null);
  async function load() {
    if (api.providerSettings) setSettings(await api.providerSettings());
  }
  useEffect(() => {
    void load().catch(() => setStatus("error"));
  }, []);
  useEffect(() => {
    const config = settings.find((p) => p.id === agent);
    setCommand(config?.command ?? "");
    setArgs(JSON.stringify(config?.args ?? []));
    setConsent(false);
  }, [agent, settings]);
  if (!api.providerSettings) return null;
  async function act(
    fn: () => Promise<unknown>,
    status: "saved" | "login" | null = "saved",
  ) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      if (status === "saved") await load();
      setStatus(status);
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="provider-setup" aria-labelledby="provider-setup-title">
      <h2 id="provider-setup-title">
        {pl ? "Połączenia wykonawcze" : "Execution connections"}
      </h2>
      <p className="helper">
        {pl
          ? "Codex używa app-server z osobnym profilem aplikacji. Claude wymaga zaufanego mostu ACP. Sondy CLI powyżej nie mierzą limitów konta."
          : "Codex uses app-server with a separate application profile. Claude requires a trusted ACP bridge. CLI probes above do not measure account limits."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act(() =>
            api.configureProvider({
              agent,
              command,
              args: JSON.parse(args),
              protocol: agent === "codex" ? "codex" : "acp",
              consent: true,
            }),
          );
        }}
      >
        <label className="field-label">{pl ? "Agent" : "Agent"}</label>
        <SelectField
          label={pl ? "Konfiguracja agenta" : "Agent connection"}
          value={agent}
          onChange={(value) => setAgent(value as Agent)}
          options={[
            { value: "codex", label: "Codex app-server" },
            { value: "claude", label: "Claude · ACP" },
          ]}
          disabled={busy}
        />
        <label>
          {pl ? "Zaufany plik wykonywalny" : "Trusted executable"}
          <div className="path-input">
            <input
              value={command}
              maxLength={4096}
              required
              onChange={(event) => {
                setCommand(event.target.value);
                setConsent(false);
              }}
              disabled={busy}
            />
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const path = await api.chooseExecutable();
                  if (path) {
                    setCommand(path);
                    setConsent(false);
                  }
                }, null)
              }
            >
              {pl ? "Wybierz" : "Browse"}
            </button>
          </div>
        </label>
        <label>
          {pl ? "Argumenty (tablica JSON)" : "Arguments (JSON array)"}
          <input
            value={args}
            maxLength={12000}
            onChange={(event) => setArgs(event.target.value)}
            disabled={busy || agent === "codex"}
            spellCheck={false}
          />
        </label>
        <label className="dependency-choice consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={busy}
          />
          <span>
            {pl
              ? "Ufam temu lokalnemu programowi i zezwalam aplikacji na uruchamianie go po mojej akcji. ACP wymaga własnej izolacji po stronie serwera."
              : "I trust this local program and allow the app to launch it on my action. ACP requires server-side isolation."}
          </span>
        </label>
        <div className="panel-actions">
          <button
            className="primary"
            disabled={busy || !consent || !command.trim()}
          >
            {pl ? "Zapisz połączenie" : "Save connection"}
          </button>
          {agent === "codex" &&
            settings.find((p) => p.id === "codex")?.configured && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void act(() => api.providerLogin(), "login")}
              >
                {pl ? "Zaloguj przez przeglądarkę" : "Sign in through browser"}
              </button>
            )}
        </div>
      </form>
      {status && (
        <p
          role={status === "error" ? "alert" : "status"}
          className={status === "error" ? "inline-error" : "helper"}
        >
          {status === "error"
            ? pl
              ? "Nie udało się zapisać połączenia. Sprawdź ścieżkę, JSON i uprawnienia."
              : "Connection failed. Check the executable, JSON arguments and permissions."
            : status === "login"
              ? pl
                ? "Dokończ logowanie w przeglądarce. Dane logowania obsługuje Codex."
                : "Finish signing in through your browser. Codex manages the credentials."
              : pl
                ? "Zapisano lokalnie."
                : "Saved locally."}
        </p>
      )}
    </section>
  );
}

import React, { useEffect, useState } from "react";
import type {
  Agent,
  ProviderSetting,
  OpenRouterModel,
  OpenRouterSetting,
  API,
  ProviderHealth,
} from "../shared";
import {
  SelectField,
  Icon,
  agentName,
  connectionLabel,
  connectionState,
  relativeTime,
} from "./ui";
import { ProviderIcon } from "./ProviderIcon";

const defaults = {
  codex: "codex",
  claude: "claude-cli",
  opencode: "acp",
  gemini: "acp",
  hermes: "acp",
  local: "acp",
  antigravity: "antigravity-cli",
} as const;
export function ProviderSetup({ language }: { language: "pl" | "en" }) {
  const pl = language === "pl",
    api = window.agenting!;
  const [settings, setSettings] = useState<ProviderSetting[]>([]),
    [detected, setDetected] = useState<Partial<Record<Agent, string>>>({});
  const [agent, setAgent] = useState<Agent>("codex"),
    [command, setCommand] = useState(""),
    [args, setArgs] = useState("[]");
  const [protocol, setProtocol] =
    useState<Parameters<API["configureProvider"]>[0]["protocol"]>("codex");
  const [profile, setProfile] = useState<"existing" | "isolated">("existing");
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [model, setModel] = useState("");
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  async function load() {
    setSettings(await api.providerSettings());
  }
  // Card state always comes from the recorded evidence in the database, so the
  // newest check wins and a cleared check is never resurrected by a local cache.
  // Kept apart from `settings` so refreshing it never resets the form.
  const [checks, setChecks] = useState<
    Partial<Record<Agent, ProviderSetting["lastCheck"]>>
  >({});
  async function refreshChecks() {
    const rows = await api.providerSettings();
    setChecks(Object.fromEntries(rows.map((r) => [r.id, r.lastCheck ?? null])));
    // Other views (the sidebar dock) mirror the same evidence.
    window.dispatchEvent(new Event("agenting:evidence"));
    return rows;
  }
  useEffect(() => {
    void refreshChecks().catch(() => {});
  }, [health]);
  useEffect(() => {
    let active = true;
    void load()
      .then(async () => {
        // Re-check saved connections whose last check is missing or old, one at a
        // time, so a lit card reflects a real handshake rather than a saved path.
        const rows = await api.providerSettings();
        for (const row of rows) {
          const age = row.lastCheck
            ? Date.now() - Date.parse(row.lastCheck.observedAt)
            : Infinity;
          if (!active || !row.configured || age < 6 * 3600_000) continue;
          const result = await api
            .providerCheck?.({ agent: row.id })
            .catch(() => null);
          if (active && result) await refreshChecks().catch(() => {});
        }
      })
      .catch(() => setStatus("error"));
    void api
      .providerDetect?.()
      .then(setDetected)
      .catch(() => setStatus("error"));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const config = settings.find((p) => p.id === agent);
    setCommand(config?.command || detected[agent] || "");
    setProtocol((config?.protocol || defaults[agent]) as typeof protocol);
    setArgs(
      JSON.stringify(
        config?.args?.length
          ? config.args
          : ["opencode", "local", "hermes"].includes(agent)
            ? ["acp"]
            : agent === "gemini"
              ? ["--acp"]
              : [],
      ),
    );
    setProfile(
      config?.configured ? (config.profile ?? "isolated") : "existing",
    );
    setModel(config?.model ?? "");
    setConsent(false);
    setStatus("");
  }, [agent, settings, detected]);
  useEffect(() => setHealth(null), [agent]);
  async function act(fn: () => Promise<unknown>, message = "saved") {
    setBusy(true);
    setStatus("");
    try {
      await fn();
      if (message === "saved") await load();
      await refreshChecks();
      setStatus(message);
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  if (!api.providerSettings) return null;
  return (
    <section className="provider-setup" aria-labelledby="provider-setup-title">
      <div className="section-eyebrow">AI EVOLUTION POLSKA / CONNECTIONS</div>
      <h2 id="provider-setup-title">
        {pl
          ? "Twoi agenci. Twoje subskrypcje."
          : "Your agents. Your subscriptions."}
      </h2>
      <p className="helper">
        {pl
          ? "Podłącz lokalne CLI. Zalogowane konta pozostają pod kontrolą dostawcy, a każdy agent pracuje na wybranym lokalnym projekcie."
          : "Connect local CLIs. Providers manage their own sign-ins; each agent works in your selected local project."}
      </p>
      <div
        className="provider-picker"
        role="group"
        aria-label={pl ? "Wybierz agenta" : "Choose agent"}
      >
        {(Object.keys(defaults) as Agent[]).map((id) => {
          const saved = settings.find((p) => p.id === id);
          const setting = saved && {
            ...saved,
            lastCheck: id in checks ? checks[id] : saved.lastCheck,
          };
          const state = connectionState(setting, !!detected[id]);
          return (
            <button
              key={id}
              type="button"
              className={`state-${state}${agent === id ? " chosen" : ""}`}
              aria-pressed={agent === id}
              onClick={() => setAgent(id)}
              disabled={busy}
            >
              <span className="picker-glyph">
                <ProviderIcon provider={id} />
                {state !== "none" && (
                  <i className="connection-dot" aria-hidden="true" />
                )}
              </span>
              <strong>{agentName(id)}</strong>
              <small>
                {connectionLabel(state, pl)}
                {setting?.lastCheck && (
                  <>
                    {" · "}
                    {relativeTime(setting.lastCheck.observedAt, language)}
                  </>
                )}
              </small>
            </button>
          );
        })}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act(() =>
            api.configureProvider({
              agent,
              command,
              args: protocol === "acp" ? JSON.parse(args) : [],
              protocol,
              profile,
              model,
              consent: true,
            }),
          );
        }}
      >
        <div className="subscription-connect">
          <Icon name="shield" />
          <div>
            <strong>
              {pl
                ? "Istniejąca subskrypcja, własne logowanie CLI"
                : "Existing subscription, native CLI sign-in"}
            </strong>
            <p>
              {agent === "hermes"
                ? pl
                  ? "Połącz wykrytą instalację, zaloguj ChatGPT/Codex i sprawdź połączenie. Wybierz model openai-codex poniżej i zapisz. Ten wybór obowiązuje w Agenting OS; globalny model Hermesa pozostaje osobny."
                  : "Connect the detected installation, sign in to ChatGPT/Codex and check the connection. Select an openai-codex model below and save. This selection applies in Agenting OS, separately from Hermes' global model."
                : agent === "gemini"
                  ? pl
                    ? "Google przeniósł konta indywidualne AI Pro/Ultra do Antigravity. Gemini CLI zachowujemy dla obsługiwanych kont Code Assist organizacji. Do Twojej indywidualnej subskrypcji wybierz Antigravity."
                    : "Google moved personal AI Pro/Ultra accounts to Antigravity. Gemini CLI remains available for supported organizational Code Assist accounts. Select Antigravity for a personal subscription."
                  : agent === "claude"
                    ? pl
                      ? "Zaloguj Claude Code poleceniem claude auth login. Agenting OS użyje jego sesji, bez kopiowania tokenów."
                      : "Sign in with claude auth login. Agenting OS uses the CLI session without copying tokens."
                    : agent === "codex"
                      ? pl
                        ? "Możesz użyć bieżącego konta Codex albo osobnego profilu aplikacji. Odczyt limitów uruchamia się automatycznie po połączeniu."
                        : "Use your existing Codex account or an isolated app profile. Quota reads start automatically after connection."
                      : pl
                        ? "Zaloguj się w narzędziu dostawcy, a następnie zapisz i sprawdź połączenie."
                        : "Sign in with the provider's tool, then save and check the connection."}
            </p>
          </div>
          {api.providerConnectDetected &&
            detected[agent] &&
            !settings.find((p) => p.id === agent)?.configured && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setSettings(
                      await api.providerConnectDetected!({
                        agent,
                        consent: true,
                      }),
                    );
                    setHealth(await api.providerCheck!({ agent }));
                  })
                }
              >
                {pl ? "Połącz wykryte CLI" : "Connect detected CLI"}
              </button>
            )}
        </div>
        {agent === "claude" && (
          <SelectField
            label={pl ? "Sposób połączenia" : "Connection method"}
            value={protocol}
            onChange={(v) => {
              setProtocol(v as typeof protocol);
              setConsent(false);
            }}
            options={[
              { value: "claude-cli", label: "Claude Code CLI" },
              { value: "acp", label: "ACP bridge" },
            ]}
            disabled={busy}
          />
        )}
        {agent === "codex" && (
          <SelectField
            label={pl ? "Konto Codex" : "Codex account"}
            value={profile}
            onChange={(v) => {
              setProfile(v as typeof profile);
              setConsent(false);
            }}
            options={[
              {
                value: "existing",
                label: pl
                  ? "Użyj istniejącego logowania CLI"
                  : "Use existing CLI sign-in",
              },
              {
                value: "isolated",
                label: pl
                  ? "Osobny profil Agenting OS"
                  : "Separate Agenting OS profile",
              },
            ]}
            disabled={busy}
          />
        )}
        <label>
          {pl ? "Plik wykonywalny agenta" : "Agent executable"}
          <div className="path-input">
            <input
              value={command}
              required
              maxLength={4096}
              disabled={busy}
              onChange={(e) => {
                setCommand(e.target.value);
                setConsent(false);
              }}
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
                }, "")
              }
            >
              {pl ? "Wybierz" : "Browse"}
            </button>
          </div>
        </label>
        {protocol === "acp" && agent === "claude" && (
          <label>
            {pl ? "Argumenty mostu ACP (JSON)" : "ACP bridge arguments (JSON)"}
            <input
              value={args}
              onChange={(e) => {
                setArgs(e.target.value);
                setConsent(false);
              }}
              disabled={busy}
            />
          </label>
        )}
        <p className="connection-note">
          <Icon name="info" />
          {agent === "local"
            ? pl
              ? "Wybierz plik wykonywalny OpenCode. Lokalny model i adres Ollamy lub LM Studio ustaw poniżej. Ten profil nie korzysta z klucza OpenRouter."
              : "Select the OpenCode executable. Configure your Ollama or LM Studio model below. This profile does not use the OpenRouter key."
            : agent === "gemini"
              ? pl
                ? "Gemini CLI działa przez ACP (--acp). Wykrywamy punkt wejścia npm, w tym bundle/gemini.js. Master i recenzent wymagają udostępnionego przez CLI trybu plan."
                : "Gemini CLI uses ACP (--acp). Discovery follows npm's entry point, including bundle/gemini.js. Master and review require the CLI's advertised plan mode."
              : agent === "hermes"
                ? pl
                  ? "Wybierz hermes z zainstalowanym dodatkiem ACP i skonfigurowanym modelem. Uruchamiamy hermes acp. Obecnie dostępny jako wykonawca; nie deklarujemy trybu tylko do odczytu."
                  : "Select hermes with the ACP extra and model configured. Launches hermes acp. Available as a worker; read-only mode is not claimed."
                : agent === "codex"
                  ? pl
                    ? "Limity będą odczytywane z tego samego profilu, który wykonuje zadania."
                    : "Limits are read from the same profile that runs tasks."
                  : agent === "claude"
                    ? pl
                      ? "Zaloguj CLI poleceniem claude auth login. Tryb natywny udostępnia odczyt i edycję plików; polecenia powłoki są wyłączone."
                      : "Sign in using claude auth login. Native mode exposes file reading and editing; shell commands are disabled."
                    : agent === "opencode"
                      ? pl
                        ? "OpenCode uruchamia się przez ACP. Wybierz model OpenRouter poniżej lub użyj konfiguracji własnego OpenCode."
                        : "OpenCode runs through ACP. Select an OpenRouter model below or use your own OpenCode configuration."
                      : pl
                        ? "Wymaga CLI agy i jego logowania. Adapter wykonawczy jest eksperymentalny; przeglądy tylko do odczytu i wznowienia są niedostępne."
                        : "Requires agy CLI and its sign-in. Execution is experimental; read-only reviews and resume are unavailable."}
        </p>
        {["gemini", "hermes", "antigravity"].includes(agent) && (
          <label>
            {pl ? "Model w Agenting OS" : "Model in Agenting OS"}
            <select
              aria-label={pl ? "Model w Agenting OS" : "Model in Agenting OS"}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
            >
              <option value="">
                {agent === "hermes"
                  ? pl
                    ? "Sprawdź połączenie i wybierz model"
                    : "Check the connection and select a model"
                  : pl
                    ? "Automatyczny model dostawcy"
                    : "Automatic provider model"}
              </option>
              {model && !health?.models.some((m) => m.id === model) && (
                <option value={model}>{model}</option>
              )}
              {health?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id.startsWith("openai-codex:")
                    ? pl
                      ? "Subskrypcja ChatGPT · "
                      : "ChatGPT subscription · "
                    : ""}
                  {m.name}
                </option>
              ))}
            </select>
            <small>
              {pl
                ? "Zapisz połączenie po zmianie modelu. W Hermes wybór jest wymagany, aby uniknąć przypadkowego użycia innego dostawcy."
                : "Save the connection after changing the model. Hermes requires an explicit choice to avoid unintentionally using another provider."}
            </small>
          </label>
        )}
        <label className="dependency-choice consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            {pl
              ? "Ufam wybranemu programowi i zezwalam na jego uruchamianie przy wykonywaniu zadań oraz odczycie konta. Program używa własnych uprawnień systemowych."
              : "I trust this executable and allow task execution and account reads. It runs with its own operating system permissions."}
          </span>
        </label>
        <div className="panel-actions">
          {api.providerSignIn && (agent === "gemini" || agent === "hermes") && (
            <button
              type="button"
              className="secondary"
              disabled={
                busy || !settings.find((p) => p.id === agent)?.configured
              }
              onClick={() =>
                void act(async () => {
                  setHealth(
                    await api.providerSignIn!({
                      agent: agent as "gemini" | "hermes",
                    }),
                  );
                }, "login")
              }
            >
              <Icon name="globe" />
              {pl
                ? agent === "gemini"
                  ? "Zaloguj Google"
                  : "Zaloguj ChatGPT / Codex"
                : agent === "gemini"
                  ? "Sign in with Google"
                  : "Sign in to ChatGPT / Codex"}
            </button>
          )}
          {api.providerCheck && (
            <button
              type="button"
              className="secondary"
              disabled={
                busy || !settings.find((p) => p.id === agent)?.configured
              }
              onClick={() =>
                void act(async () => {
                  setHealth(await api.providerCheck!({ agent }));
                }, "checked")
              }
            >
              <Icon name="connections" />
              {pl ? "Sprawdź połączenie" : "Check connection"}
            </button>
          )}
          <button
            className="primary"
            disabled={busy || !consent || !command.trim()}
          >
            <Icon name="check" />
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
        {agent === "gemini" && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setAgent("antigravity")}
          >
            {pl
              ? "Google AI Pro/Ultra → Antigravity"
              : "Google AI Pro/Ultra → Antigravity"}
          </button>
        )}
        {status && (
          <p role={status === "error" ? "alert" : "status"}>
            {status === "error"
              ? pl
                ? "Operacja nie powiodła się. Sprawdź program, argumenty i dostęp do konta."
                : "Operation failed. Check executable, arguments and account access."
              : status === "login"
                ? pl
                  ? "Dokończ logowanie w przeglądarce."
                  : "Finish signing in through your browser."
                : status === "checked"
                  ? pl
                    ? "Diagnostyka zakończona."
                    : "Connection check complete."
                  : pl
                    ? "Zapisano lokalnie."
                    : "Saved locally."}
          </p>
        )}
      </form>
      {health && (
        <div className={`connection-health ${health.state}`} role="status">
          <Icon name={health.state === "connected" ? "check" : "info"} />
          <div>
            <strong>
              {health.detail === "ANTIGRAVITY_MODELS_READY"
                ? pl
                  ? "Antigravity udostępnia modele konta Google. Dostęp do rozmowy potwierdzi pierwsza odpowiedź."
                  : "Antigravity lists the Google account models. The first response verifies conversation access."
                : health.detail === "GEMINI_SUBSCRIPTION_MOVED"
                  ? pl
                    ? "Google zakończył obsługę indywidualnych subskrypcji w Gemini CLI. Wybierz Antigravity."
                    : "Google ended personal subscription support in Gemini CLI. Select Antigravity."
                  : health.detail === "PROVIDER_TLS_ERROR"
                    ? pl
                      ? "Nie udało się zweryfikować certyfikatu dostawcy. Sprawdź zaufane certyfikaty Windows."
                      : "Provider certificate verification failed. Check trusted Windows certificates."
                    : health.detail === "GOOGLE_SIGN_IN_VERIFIED"
                      ? pl
                        ? "Logowanie Google potwierdzone"
                        : "Google sign-in verified"
                      : health.detail === "CLI_SIGN_IN_VERIFIED"
                        ? pl
                          ? "Logowanie CLI potwierdzone"
                          : "CLI sign-in verified"
                        : health.detail === "ACP_READY_AUTH_UNVERIFIED"
                          ? pl
                            ? "ACP odpowiada. Dostęp modelu potwierdzi pierwsza rozmowa."
                            : "ACP responds. The first conversation verifies model access."
                          : health.detail === "HERMES_ACP_CHECK_REQUIRED"
                            ? pl
                              ? "Sprawdź instalację dodatku ACP i uruchom hermes acp --check."
                              : "Check the ACP extra and run hermes acp --check."
                            : health.detail === "GEMINI_ACP_CHECK_REQUIRED"
                              ? pl
                                ? "Sprawdź logowanie i wersję Gemini CLI z obsługą --experimental-acp. Starsza instalacja wymaga aktualizacji."
                                : "Check sign-in and a Gemini CLI version supporting --experimental-acp. Older installations need an update."
                              : pl
                                ? "Połączenie wymaga konfiguracji lub logowania."
                                : "Connection requires setup or sign-in."}
            </strong>
            <p>{new Date(health.observedAt).toLocaleTimeString(language)}</p>
            {!!health.models.length && (
              <details>
                <summary>
                  {pl
                    ? "Modele zgłoszone przez agenta"
                    : "Models reported by agent"}{" "}
                  · {health.models.length}
                </summary>
                <ul>
                  {health.models.map((m) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
      <OpenRouterSetup language={language} />
      <LocalModelSetup language={language} />
    </section>
  );
}

function LocalModelSetup({ language }: { language: "pl" | "en" }) {
  const api = window.agenting!,
    pl = language === "pl";
  const [baseURL, setBaseURL] = useState("http://127.0.0.1:11434/v1"),
    [model, setModel] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void api
      .localModelSettings?.()
      .then((s) => {
        setBaseURL(s.baseURL);
        setModel(s.model);
      })
      .catch(() =>
        setMessage(
          pl
            ? "Nie udało się odczytać konfiguracji."
            : "Could not read configuration.",
        ),
      );
  }, []);
  if (!api.localModelSave) return null;
  return (
    <section className="local-model-setup">
      <h3>
        <ProviderIcon provider="local" />
        {pl
          ? "Lokalne modele · Ollama / LM Studio"
          : "Local models · Ollama / LM Studio"}
      </h3>
      <p className="helper">
        {pl
          ? "Włącz serwer zgodny z OpenAI i podaj dokładny identyfikator zainstalowanego modelu. Narzędzia agenta obsługuje OpenCode przez ACP. Serwer i model muszą działać na tym komputerze."
          : "Start an OpenAI-compatible server and enter the exact installed model ID. OpenCode provides agent tools over ACP. The server and model must run on this computer."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          void api.localModelSave!({ baseURL, model })
            .then(() =>
              setMessage(
                pl
                  ? "Zapisano. Połącz profil Lokalny LLM z OpenCode powyżej."
                  : "Saved. Connect the Local LLM profile to OpenCode above.",
              ),
            )
            .catch(() =>
              setMessage(
                pl
                  ? "Wymagany adres http://localhost:port/v1 i prawidłowy identyfikator modelu."
                  : "Use http://localhost:port/v1 and a valid model ID.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <label>
          {pl ? "Adres lokalnego API" : "Local API URL"}
          <input
            type="url"
            required
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          {pl ? "Identyfikator modelu" : "Model ID"}
          <input
            required
            maxLength={200}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="qwen3.5"
            disabled={busy}
          />
        </label>
        <div className="mission-actions">
          <button disabled={busy || !model.trim()}>
            {pl ? "Zapisz lokalny model" : "Save local model"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api.localModelRemove!()
                .then(() => {
                  setModel("");
                  setMessage(
                    pl ? "Usunięto konfigurację." : "Configuration removed.",
                  );
                })
                .catch(() =>
                  setMessage(
                    pl
                      ? "Nie udało się usunąć konfiguracji."
                      : "Could not remove configuration.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Usuń konfigurację" : "Remove configuration"}
          </button>
        </div>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}

function OpenRouterSetup({ language }: { language: "pl" | "en" }) {
  const pl = language === "pl",
    api = window.agenting!;
  const [setting, setSetting] = useState<OpenRouterSetting | null>(null),
    [models, setModels] = useState<OpenRouterModel[]>([]);
  const [key, setKey] = useState(""),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void api
      .openRouterSettings?.()
      .then((s) => {
        setSetting(s);
        setModel(s.model);
      })
      .catch(() => setMessage("error"));
  }, []);
  if (!api.openRouterSettings) return null;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage("saved");
    } catch {
      setMessage("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="router-setup" aria-labelledby="router-title">
      <div className="router-heading">
        <ProviderIcon provider="openrouter" />
        <div>
          <h3 id="router-title">OpenRouter</h3>
          <p>
            {pl
              ? "Jeden klucz. Modele w Twoim workspace."
              : "One key. Models in your workspace."}
          </p>
        </div>
        <span className="state-badge">
          {setting?.configured
            ? pl
              ? "Klucz zapisany"
              : "Key saved"
            : pl
              ? "API"
              : "API"}
        </span>
      </div>
      <p className="helper">
        {pl
          ? "To osobne rozliczenie API. Klucz jest szyfrowany przez system operacyjny i przekazywany wyłącznie lokalnemu OpenCode oraz API OpenRouter."
          : "This uses separate API billing. Your key is encrypted by the operating system and passed only to local OpenCode and the OpenRouter API."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            const s = await api.openRouterSave!({
              ...(key ? { apiKey: key } : {}),
              model,
              consent: true,
            });
            setKey("");
            setSetting(s);
          });
        }}
      >
        <label>
          {pl ? "Klucz API" : "API key"}
          <input
            type="password"
            autoComplete="off"
            value={key}
            maxLength={4096}
            placeholder={
              setting?.configured
                ? pl
                  ? "Zapisany · wpisz, aby wymienić"
                  : "Saved · enter to replace"
                : "sk-or-…"
            }
            onChange={(e) => setKey(e.target.value)}
            required={!setting?.configured}
            disabled={busy}
          />
        </label>
        <label>
          {pl ? "Model (identyfikator OpenRouter)" : "Model (OpenRouter ID)"}
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list="router-models"
            placeholder="provider/model"
            required
            maxLength={200}
            disabled={busy}
          />
          <datalist id="router-models">
            {models.map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
                {m.contextLength
                  ? ` · ${m.contextLength.toLocaleString()} context`
                  : ""}
              </option>
            ))}
          </datalist>
        </label>
        <div className="panel-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(async () => setModels(await api.openRouterModels!()))
            }
          >
            <Icon name="refresh" />
            {pl ? "Pobierz katalog modeli" : "Load model catalog"}
          </button>
          <button
            className="primary"
            disabled={busy || !setting?.encryptionAvailable}
          >
            {pl ? "Zapisz OpenRouter" : "Save OpenRouter"}
          </button>
          {setting?.configured && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.openRouterRemove!();
                  setSetting(await api.openRouterSettings!());
                  setKey("");
                })
              }
            >
              {pl ? "Usuń klucz" : "Remove key"}
            </button>
          )}
        </div>
        {setting && !setting.encryptionAvailable && (
          <p role="alert">
            {pl
              ? "Systemowy magazyn szyfrowania jest niedostępny."
              : "Operating system encryption is unavailable."}
          </p>
        )}
        {message && (
          <p role={message === "error" ? "alert" : "status"}>
            {message === "error"
              ? pl
                ? "Operacja nie powiodła się. Sprawdź model, klucz i połączenie."
                : "Operation failed. Check the model, key and connection."
              : pl
                ? "Gotowe. Nie wykonano płatnego zapytania do modelu."
                : "Done. No paid model request was made."}
          </p>
        )}
      </form>
    </section>
  );
}

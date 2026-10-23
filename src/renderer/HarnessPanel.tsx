import React, { useEffect, useRef, useState } from "react";
import type {
  ContextPreview,
  Extension,
  HarnessSettings,
  Memory,
  Project,
  ProviderSetting,
} from "../shared";
import { AVAILABLE_AGENTS } from "../shared";
import { agentName, connectionLabel, connectionState, Icon } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { ErrorNote } from "./ErrorNote";
import { copyText } from "./clipboard";
import "./harness-studio.css";

type Destination =
  | "connections"
  | "quota"
  | "skills"
  | "shared-memory"
  | "terminal"
  | "chat";
export function HarnessPanel({
  language,
  projects,
  onNavigate,
  onProjectTools,
}: {
  language: "pl" | "en";
  projects: Project[];
  onNavigate: (view: Destination) => void;
  onProjectTools: (projectId: string) => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [saved, setSaved] = useState<
    (HarnessSettings & { core: string }) | null
  >(null);
  const [instructions, setInstructions] = useState("");
  const [autoRecall, setAutoRecall] = useState(true),
    [recallLimit, setRecallLimit] = useState(4);
  const [saving, setSaving] = useState(false),
    [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [workflow, setWorkflow] = useState("implementation"),
    [query, setQuery] = useState("");
  const [memory, setMemory] = useState<Memory[]>([]),
    [skills, setSkills] = useState<Extension[]>([]);
  const [memoryIds, setMemoryIds] = useState<string[]>([]),
    [skillIds, setSkillIds] = useState<string[]>([]);
  const [contextLoading, setContextLoading] = useState(false),
    [contextError, setContextError] = useState("");
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [previewing, setPreviewing] = useState(false),
    [previewError, setPreviewError] = useState("");
  const [providers, setProviders] = useState<ProviderSetting[]>([]),
    [providerError, setProviderError] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(true);
  const previewEpoch = useRef(0);
  const dirty =
    !!saved &&
    (saved.instructions !== instructions ||
      saved.autoRecall !== autoRecall ||
      saved.recallLimit !== recallLimit);
  function apply(value: HarnessSettings & { core: string }) {
    setSaved(value);
    setInstructions(value.instructions);
    setAutoRecall(value.autoRecall);
    setRecallLimit(value.recallLimit);
  }
  useEffect(() => {
    let active = true;
    void api.harnessGet!()
      .then((value) => {
        if (active) apply(value);
      })
      .catch((e) => {
        if (active) setSettingsError(String(e));
      });
    void api
      .providerSettings()
      .then((value) => {
        if (active) setProviders(value);
      })
      .catch(() => {
        if (active) setProviderError(true);
      })
      .finally(() => {
        if (active) setProvidersLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);
  useEffect(() => {
    let active = true;
    setMemory([]);
    setSkills([]);
    setMemoryIds([]);
    setSkillIds([]);
    setContextError("");
    if (!projectId) return;
    setContextLoading(true);
    void Promise.all([
      api.memorySearch({ projectId, query: "" }),
      api.extensionList({ projectId }),
    ])
      .then(([notes, extensions]) => {
        if (active) {
          setMemory(notes);
          setSkills(
            extensions.filter((s) => s.kind === "skill" && s.enabled !== false),
          );
        }
      })
      .catch((e) => {
        if (active) setContextError(String(e));
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    previewEpoch.current++;
    setPreview(null);
    setPreviewError("");
    setPreviewing(false);
    return () => {
      previewEpoch.current++;
    };
  }, [
    projectId,
    workflow,
    query,
    memoryIds,
    skillIds,
    saved?.revision,
    instructions,
    autoRecall,
    recallLimit,
  ]);
  async function save() {
    if (!saved || saving) return;
    setSaving(true);
    setSettingsError("");
    setNotice("");
    try {
      apply(
        await api.harnessSave!({
          instructions,
          autoRecall,
          recallLimit,
          revision: saved.revision,
        }),
      );
      setNotice(
        pl
          ? "Zapisano. Nowe uruchomienia otrzymają tę instrukcję."
          : "Saved. New runs will receive these instructions.",
      );
    } catch (e) {
      setSettingsError(String(e));
    } finally {
      setSaving(false);
    }
  }
  async function buildPreview() {
    const epoch = ++previewEpoch.current;
    setPreviewing(true);
    setPreviewError("");
    setPreview(null);
    try {
      const result = await api.contextPreview({
        projectId,
        workflow,
        query,
        contextIds: memoryIds,
        skillIds,
      });
      if (epoch === previewEpoch.current) setPreview(result);
    } catch (e) {
      if (epoch === previewEpoch.current) setPreviewError(String(e));
    } finally {
      if (epoch === previewEpoch.current) setPreviewing(false);
    }
  }
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  const reason = (value: string) =>
    ({
      required: pl ? "Rdzeń" : "Core",
      pinned: pl ? "Przypięte" : "Pinned",
      selected: pl ? "Dołączone" : "Included",
      recalled: pl ? "Przywołane" : "Recalled",
    })[value] ?? value;
  return (
    <section className="harness-studio" aria-labelledby="harness-title">
      <header className="harness-heading">
        <div>
          <span className="harness-eyebrow">AI EVOLUTION POLSKA / HARNESS</span>
          <h1 id="harness-title">
            {pl
              ? "Jeden zespół. Wspólny kontekst."
              : "One team. Shared context."}
          </h1>
          <p>
            {pl
              ? "Ustal zasady pracy i sprawdź, co agenci dostają przed startem."
              : "Set the working rules and inspect what agents receive before a run."}
          </p>
        </div>
        <button className="secondary" onClick={() => onNavigate("chat")}>
          <Icon name="message" />
          {pl ? "Otwórz czat" : "Open chat"}
        </button>
      </header>
      <ol
        className="harness-cycle"
        aria-label={pl ? "Cykl pracy agentów" : "Agent work cycle"}
      >
        {(pl
          ? ["Cel", "Kontekst", "Wykonanie", "Weryfikacja", "Przekazanie"]
          : ["Goal", "Context", "Execution", "Verification", "Handoff"]
        ).map((step, i) => (
          <li key={step}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
      <div className="harness-columns">
        <section
          className="harness-section"
          aria-labelledby="instruction-title"
        >
          <div className="harness-section-title">
            <h2 id="instruction-title">
              {pl ? "Instrukcja główna" : "Main instructions"}
            </h2>
            <span>{saved ? `v${saved.revision}` : "…"}</span>
          </div>
          <p className="harness-help">
            {pl
              ? "Wspólna dla czatów, Mastera, wykonawców i recenzentów. Zmiany dotyczą nowych kontekstów; aktywne zadania zachowują swój zapis."
              : "Shared by chats, Master, workers and reviewers. Changes affect new contexts; active tasks keep their snapshot."}
          </p>
          {settingsError && (
            <ErrorNote
              value={settingsError}
              pl={pl}
              action={
                <button
                  onClick={() => {
                    void api.harnessGet!()
                      .then((value) => {
                        apply(value);
                        setSettingsError("");
                        setNotice("");
                      })
                      .catch((e) => setSettingsError(String(e)));
                  }}
                >
                  {pl ? "Wczytaj zapisane ustawienia" : "Load saved settings"}
                </button>
              }
            />
          )}
          {!saved ? (
            <p role="status">
              {settingsError
                ? pl
                  ? "Ustawienia niedostępne."
                  : "Settings unavailable."
                : pl
                  ? "Wczytywanie ustawień…"
                  : "Loading settings…"}
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={saving}>
                <label htmlFor="harness-instructions">
                  {pl ? "Zasady Twojego zespołu" : "Your team's working rules"}
                </label>
                <textarea
                  id="harness-instructions"
                  value={instructions}
                  onChange={(e) => {
                    setInstructions(e.target.value);
                    setNotice("");
                  }}
                  maxLength={6000}
                  rows={10}
                  placeholder={
                    pl
                      ? "Np. odpowiadaj po polsku, stosuj konwencje projektu, przekazuj wyniki testów kolejnemu agentowi…"
                      : "For example: follow project conventions and hand off test evidence to the next agent…"
                  }
                  aria-describedby="harness-instruction-help"
                />
                <div className="harness-field-note">
                  <span id="harness-instruction-help">
                    {pl
                      ? "Bez kluczy API. Uprawnienia pozostają kontrolowane przez aplikację."
                      : "No API keys. The application continues to enforce permissions."}
                  </span>
                  <span>{instructions.length}/6000</span>
                </div>
                <label className="harness-checkbox">
                  <input
                    type="checkbox"
                    checked={autoRecall}
                    onChange={(e) => {
                      setAutoRecall(e.target.checked);
                      setNotice("");
                    }}
                  />
                  <span>
                    {pl
                      ? "Automatycznie przywołuj pasującą pamięć"
                      : "Automatically recall relevant memory"}
                  </span>
                </label>
                <label className="harness-limit">
                  {pl
                    ? "Maksymalna liczba przywołanych wpisów"
                    : "Maximum recalled entries"}
                  <select
                    aria-label={
                      pl
                        ? "Maksymalna liczba przywołanych wpisów"
                        : "Maximum recalled entries"
                    }
                    value={recallLimit}
                    disabled={!autoRecall}
                    onChange={(e) => {
                      setRecallLimit(Number(e.target.value));
                      setNotice("");
                    }}
                  >
                    {Array.from({ length: 9 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="harness-help">
                  {pl
                    ? "Przypięte i wybrane wpisy mają pierwszeństwo. Powtarzające się notatki są pomijane przy automatycznym doborze."
                    : "Pinned and selected notes take priority. Automatic recall skips duplicate notes."}
                </p>
                <div className="harness-actions">
                  <button
                    className="primary"
                    disabled={!dirty || saving}
                    type="submit"
                  >
                    {saving
                      ? pl
                        ? "Zapisywanie…"
                        : "Saving…"
                      : pl
                        ? "Zapisz instrukcję"
                        : "Save instructions"}
                  </button>
                  {dirty && (
                    <span>{pl ? "Niezapisane zmiany" : "Unsaved changes"}</span>
                  )}
                </div>
              </fieldset>
              {notice && (
                <p className="harness-notice" role="status">
                  {notice}
                </p>
              )}
            </form>
          )}
          <details className="harness-disclosure">
            <summary>
              {pl
                ? "Wbudowana instrukcja harnessa"
                : "Built-in harness instructions"}
            </summary>
            <pre>{saved?.core}</pre>
          </details>
        </section>
        <section className="harness-section" aria-labelledby="context-title">
          <div className="harness-section-title">
            <h2 id="context-title">
              {pl ? "Inspektor kontekstu" : "Context inspector"}
            </h2>
            <Icon name="layers" />
          </div>
          <p className="harness-help">
            {pl
              ? "Podgląd bez wywołania modelu. Dokładny rozmiar w znakach obejmuje instrukcję, workflow, pamięć i skille."
              : "Preview without a model call. The exact character budget covers instructions, workflow, memory and skills."}
          </p>
          {!projects.length ? (
            <p className="harness-empty">
              {pl
                ? "Dodaj projekt w pasku bocznym, aby sprawdzić jego kontekst."
                : "Add a project in the sidebar to inspect its context."}
            </p>
          ) : (
            <>
              <div className="harness-fields">
                <label>
                  {pl ? "Projekt kontekstu" : "Context project"}
                  <select
                    aria-label={pl ? "Projekt kontekstu" : "Context project"}
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {pl ? "Tryb pracy" : "Workflow"}
                  <select
                    aria-label={pl ? "Tryb pracy" : "Workflow"}
                    value={workflow}
                    onChange={(e) => setWorkflow(e.target.value)}
                  >
                    {[
                      ["implementation", "Implementacja", "Implementation"],
                      ["bugfix", "Naprawa błędu", "Bug fix"],
                      [
                        "research",
                        "Research · tylko odczyt",
                        "Research · read only",
                      ],
                      [
                        "audit",
                        "Audyt UI · tylko odczyt",
                        "UI audit · read only",
                      ],
                    ].map(([id, a, b]) => (
                      <option key={id} value={id}>
                        {pl ? a : b}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="harness-query">
                {pl
                  ? "Cel zadania do wyszukania pamięci"
                  : "Task goal for memory retrieval"}
                <textarea
                  rows={2}
                  value={query}
                  maxLength={1000}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    pl
                      ? "Np. dopracuj dostępność formularza logowania"
                      : "For example: improve login form accessibility"
                  }
                />
              </label>
              {contextLoading && (
                <p role="status">
                  {pl
                    ? "Wczytywanie pamięci i skilli…"
                    : "Loading memory and skills…"}
                </p>
              )}
              {contextError && <ErrorNote value={contextError} pl={pl} />}
              <details className="harness-disclosure">
                <summary>
                  {pl ? "Wybierz pamięć i skille" : "Choose memory and skills"}{" "}
                  ({memoryIds.length + skillIds.length})
                </summary>
                <p className="harness-help">
                  {pl
                    ? "Do 20 wpisów pamięci i 10 skilli. Zainstalowane, aktywne skille i przypięte notatki są dołączane automatycznie. Lista pamięci pokazuje 50 najnowszych wpisów."
                    : "Up to 20 memory entries and 10 skills. Installed active skills and pinned notes are included automatically. The memory list shows the 50 latest entries."}
                </p>
                <div className="harness-choices">
                  <h3>{pl ? "Pamięć" : "Memory"}</h3>
                  {!memory.length && (
                    <p>
                      {pl
                        ? "Brak wpisów w tym projekcie."
                        : "No notes in this project."}
                    </p>
                  )}
                  {memory.map((m) => (
                    <label className="harness-checkbox" key={m.id}>
                      <input
                        type="checkbox"
                        checked={!!m.pinned || memoryIds.includes(m.id)}
                        disabled={
                          !!m.pinned ||
                          (!memoryIds.includes(m.id) && memoryIds.length >= 20)
                        }
                        onChange={() => setMemoryIds(toggle(memoryIds, m.id))}
                      />
                      <span>
                        {m.content.split(/\r?\n/)[0].slice(0, 100)}
                        <small>
                          {m.scope === "workspace"
                            ? pl
                              ? "Wspólna"
                              : "Shared"
                            : pl
                              ? "Projekt"
                              : "Project"}
                          {m.pinned ? (pl ? " · przypięta" : " · pinned") : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                  <h3>{pl ? "Skille" : "Skills"}</h3>
                  {skills.map((s) => (
                    <label className="harness-checkbox" key={s.id}>
                      <input
                        type="checkbox"
                        checked={!!s.installed || skillIds.includes(s.id)}
                        disabled={
                          !!s.installed ||
                          (!skillIds.includes(s.id) && skillIds.length >= 10)
                        }
                        onChange={() => setSkillIds(toggle(skillIds, s.id))}
                      />
                      <span>
                        {s.name}
                        {s.installed && (
                          <small>
                            {pl
                              ? "Zainstalowany · automatyczny"
                              : "Installed · automatic"}
                          </small>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </details>
              <button
                className="primary"
                disabled={
                  !saved ||
                  dirty ||
                  saving ||
                  contextLoading ||
                  !!contextError ||
                  previewing ||
                  !projectId
                }
                onClick={() => void buildPreview()}
              >
                <Icon name="search" />
                {previewing
                  ? pl
                    ? "Budowanie kontekstu…"
                    : "Building context…"
                  : pl
                    ? "Sprawdź kontekst"
                    : "Inspect context"}
              </button>
              {dirty && (
                <p className="harness-help">
                  {pl
                    ? "Najpierw zapisz instrukcję, aby podgląd odpowiadał kontekstowi agentów."
                    : "Save instructions first so the preview matches the agents' context."}
                </p>
              )}
            </>
          )}
          {previewError && <ErrorNote value={previewError} pl={pl} />}
          {preview && (
            <div className="harness-preview" aria-live="polite">
              <div className="harness-budget">
                <strong>
                  {preview.characters.toLocaleString(language)} /{" "}
                  {preview.limit.toLocaleString(language)}
                </strong>
                <span>
                  {pl ? "znaków" : "characters"} · v{preview.harnessRevision}
                </span>
              </div>
              <progress
                value={preview.characters}
                max={preview.limit}
                aria-label={
                  pl
                    ? "Wykorzystanie budżetu kontekstu"
                    : "Context budget usage"
                }
              />
              <ul className="harness-manifest">
                {preview.manifest?.map((entry) => (
                  <li key={`${entry.kind}:${entry.id}`}>
                    <span>
                      <strong>{entry.label}</strong>
                      <small>
                        {entry.source}
                        {entry.truncated
                          ? pl
                            ? " · skrócono"
                            : " · truncated"
                          : ""}
                      </small>
                    </span>
                    <span>
                      {reason(entry.reason)}
                      <small>
                        {entry.characters.toLocaleString(language)}{" "}
                        {pl ? "zn." : "chars"}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              {!!preview.recallSkipped && (
                <p className="harness-help">
                  {pl
                    ? `Pominięto ${preview.recallSkipped} dopasowań: duplikaty lub limit kontekstu.`
                    : `${preview.recallSkipped} matches skipped: duplicates or context limits.`}
                </p>
              )}
              <details className="harness-disclosure">
                <summary>
                  {pl
                    ? "Pełny kontekst i odcisk SHA-256"
                    : "Full context and SHA-256 fingerprint"}
                </summary>
                <code className="harness-hash">{preview.fingerprint}</code>
                <pre>{preview.body}</pre>
                <button
                  onClick={() => {
                    void copyText(preview.body).catch((e) =>
                      setPreviewError(String(e)),
                    );
                  }}
                >
                  <Icon name="copy" />
                  {pl ? "Kopiuj kontekst" : "Copy context"}
                </button>
              </details>
            </div>
          )}
        </section>
      </div>
      <section className="harness-section" aria-labelledby="harness-team-title">
        <div className="harness-section-title">
          <div>
            <h2 id="harness-team-title">
              {pl
                ? "Modele i połączenia zespołu"
                : "Team models and connections"}
            </h2>
            <p className="harness-help">
              {pl
                ? "Logowanie i rozliczenia należą do dostawcy. Zapisana konfiguracja nie potwierdza dostępności ani salda subskrypcji."
                : "Authentication and billing belong to each provider. Saved settings do not confirm availability or subscription balance."}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => onNavigate("connections")}
          >
            {pl ? "Zarządzaj połączeniami" : "Manage connections"}
          </button>
        </div>
        {providersLoading ? (
          <p role="status">
            {pl ? "Wczytywanie połączeń…" : "Loading connections…"}
          </p>
        ) : providerError ? (
          <p role="alert">
            {pl
              ? "Nie udało się wczytać połączeń. Otwórz ich ustawienia, aby spróbować ponownie."
              : "Could not load connections. Open connection settings to retry."}
          </p>
        ) : (
          <ul className="harness-providers">
            {AVAILABLE_AGENTS.map((id) => {
              const provider = providers.find((p) => p.id === id);
              return (
                <li key={id}>
                  <ProviderIcon provider={id} />
                  <span>
                    <strong>{agentName(id)}</strong>
                    <small>
                      {provider?.model ||
                        (pl
                          ? "Model z ustawień dostawcy"
                          : "Provider default model")}
                    </small>
                  </span>
                  <span>
                    {connectionLabel(connectionState(provider), pl)}
                    <small>
                      {provider?.lastCheck
                        ? new Date(
                            provider.lastCheck.observedAt,
                          ).toLocaleString(language)
                        : pl
                          ? "Brak potwierdzonego sprawdzenia"
                          : "No recorded check"}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section
        className="harness-section"
        aria-labelledby="harness-tools-title"
      >
        <h2 id="harness-tools-title">
          {pl ? "Narzędzia workspace" : "Workspace tools"}
        </h2>
        <div className="harness-tools">
          {(
            [
              ["terminal", "terminal", "Terminal", "Terminal"],
              ["skills", "skill", "Biblioteka skilli", "Skill library"],
              [
                "shared-memory",
                "memory",
                "Pamięć i źródła",
                "Memory and sources",
              ],
              ["quota", "tokens", "Limity i koszty", "Limits and usage"],
            ] as const
          ).map(([view, icon, a, b]) => (
            <button key={view} onClick={() => onNavigate(view)}>
              <Icon name={icon} />
              <span>{pl ? a : b}</span>
              <Icon name="arrow" />
            </button>
          ))}
          <button
            disabled={!projectId}
            onClick={() => onProjectTools(projectId)}
          >
            <Icon name="connections" />
            <span>
              {pl
                ? "MCP i rozszerzenia projektu"
                : "Project MCP and extensions"}
            </span>
            <Icon name="arrow" />
          </button>
        </div>
      </section>
    </section>
  );
}

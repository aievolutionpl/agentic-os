import React, { useEffect, useRef, useState } from "react";
import {
  AVAILABLE_AGENTS as AGENTS,
  READ_ONLY_AGENTS,
  type Agent,
  type Extension,
  type Memory,
  type Mission,
  type Project,
  type ProviderSetting,
  type Task,
} from "../shared";
import {
  Icon,
  SelectField,
  agentName,
  connectionLabel,
  connectionState,
} from "./ui";
import { PaidApproval, policyMessage } from "./PolicyPanel";
import { ProviderIcon } from "./ProviderIcon";

export function MasterPanel({
  project,
  memory,
  tasks,
  language,
  onChanged,
  onTasks,
  onConnections,
  onQuota,
}: {
  project: Project;
  memory: Memory[];
  tasks: Task[];
  language: "pl" | "en";
  onChanged: () => void;
  onTasks: () => void;
  onConnections: () => void;
  onQuota: () => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [missions, setMissions] = useState<Mission[]>([]),
    [selected, setSelected] = useState("");
  const [providers, setProviders] = useState<ProviderSetting[]>([]),
    [skills, setSkills] = useState<Extension[]>([]);
  const [master, setMaster] = useState<Agent>(
    project.master !== "gemini" && READ_ONLY_AGENTS.includes(project.master)
      ? project.master
      : "codex",
  );
  const [workers, setWorkers] = useState<Agent[]>([]),
    [goal, setGoal] = useState("");
  const [contextIds, setContextIds] = useState<string[]>([]),
    [skillIds, setSkillIds] = useState<string[]>(["builtin:teamwork"]);
  const [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState(""),
    [draft, setDraft] = useState(false),
    [scope, setScope] = useState<"project" | "workspace">("project");
  const refreshRef = useRef(onChanged);
  refreshRef.current = onChanged;
  const previous = useRef("");
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.providerSettings(),
      api.extensionList({ projectId: project.id }),
    ])
      .then(([settings, extensions]) => {
        if (!alive) return;
        setProviders(settings);
        setSkills(extensions.filter((e) => e.kind === "skill"));
        setWorkers(
          settings
            .filter((s) => s.configured && s.id !== "gemini")
            .map((s) => s.id),
        );
      })
      .catch(() => {
        if (alive) setError("LOAD_FAILED");
      });
    const update = async () => {
      try {
        const rows = await api.missionList!({ projectId: project.id });
        if (!alive) return;
        setMissions(rows);
        const signature = rows
          .map((m) => `${m.id}:${m.status}:${m.runId}`)
          .join("|");
        if (previous.current && previous.current !== signature)
          refreshRef.current();
        previous.current = signature;
      } catch {
        if (alive) setError("LOAD_FAILED");
      }
    };
    void update();
    const timer = setInterval(() => void update(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project.id]);
  if (!api.missionPlan)
    return (
      <p>
        {pl
          ? "Uruchom aktualną wersję aplikacji."
          : "Launch the current app version."}
      </p>
    );
  const mission = missions.find((m) => m.id === selected) ?? missions[0];
  const active = missions.some((m) =>
    ["planning", "running", "evaluating"].includes(m.status),
  );
  const unresolved = missions.some((m) =>
    ["ready", "blocked", "interrupted"].includes(m.status),
  );
  const composing = draft || !mission;
  const contextCount = new Set([
    ...contextIds,
    ...memory.filter((m) => m.pinned).map((m) => m.id),
  ]).size;
  const statuses: Record<Mission["status"], string> = pl
    ? {
        planning: "Master przygotowuje plan",
        ready: "Plan do uruchomienia",
        running: "Zespół pracuje",
        evaluating: "Master ocenia wyniki",
        blocked: "Potrzebna decyzja",
        completed: "Cel zrealizowany",
        needs_changes: "Potrzebne poprawki",
        failed: "Praca nie powiodła się",
        stopped: "Zatrzymano",
        interrupted: "Przerwano po restarcie",
      }
    : {
        planning: "Master is planning",
        ready: "Plan ready to launch",
        running: "Team is working",
        evaluating: "Master is evaluating",
        blocked: "Decision needed",
        completed: "Goal completed",
        needs_changes: "Changes needed",
        failed: "Mission failed",
        stopped: "Stopped",
        interrupted: "Interrupted on restart",
      };
  const reason = (code: string) =>
    policyMessage(code, pl) ??
    (
      {
        HUMAN_APPROVAL_REQUIRED: pl
          ? "Otwórz wynik zadania, przejrzyj zmiany i zdecyduj o zastosowaniu. Następnie kontynuuj misję."
          : "Open the task result, review and apply the changes, then continue the mission.",
        REVIEW_FAILED: pl
          ? "Recenzja nie została ukończona. Otwórz wynik zadania i ponów przegląd przed kontynuowaniem misji."
          : "The review did not complete. Open the task result and explicitly retry review before continuing.",
        REVIEW_CHANGES_REQUESTED: pl
          ? "Recenzent poprosił o poprawki. Otwórz wynik zadania i zdecyduj o poprawce, zanim misja ruszy dalej."
          : "The reviewer requested changes. Open the task result and decide on a revision before the mission continues.",
        INSPECT_TASK_RESULT: pl
          ? "Sprawdź nieukończony wynik w zadaniach. Możesz jawnie wznowić przebieg, a potem kontynuować misję."
          : "Inspect the unfinished task. Explicitly resume its run, then continue this mission.",
        PROVIDER_QUOTA_EXHAUSTED: pl
          ? "Dostawca zgłasza wyczerpany limit. Sprawdź Quota Monitor i kontynuuj po odnowieniu limitu."
          : "The provider reports an exhausted quota. Check Quota Monitor and continue after reset.",
        PROVIDER_NOT_CONFIGURED: pl
          ? "Najpierw zapisz połączenia wybranych agentów."
          : "Save connections for the selected agents first.",
        STOP_PREVIOUS_MISSION: pl
          ? "Zakończ lub zatrzymaj poprzednią misję przed rozpoczęciem nowej."
          : "Finish or stop the previous mission before starting another.",
        REPOSITORY_NOT_CLEAN: pl
          ? "Projekt ma niezapisane zmiany Git. Zapisz je w commicie przed uruchomieniem."
          : "The repository has uncommitted changes. Commit them before starting.",
        APP_INTERRUPTED: pl
          ? "Stan zachowano. Żadna operacja nie została automatycznie powtórzona."
          : "State was saved. No operation was replayed automatically.",
        INVALID_MASTER_PLAN: pl
          ? "Master zwrócił nieprawidłowy plan. Zadania nie zostały uruchomione; przygotuj nowy plan."
          : "Master returned an invalid plan. No tasks were launched; create a new plan.",
      } as Record<string, string>
    )[code] ??
    (pl ? `Szczegóły: ${code}` : `Details: ${code}`);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setMissions(await api.missionList!({ projectId: project.id }));
      refreshRef.current();
    } catch (e) {
      const raw = String(e);
      setError(raw.match(/\b[A-Z][A-Z_]{3,}\b/g)?.at(-1) ?? "ACTION_FAILED");
    } finally {
      setBusy(false);
    }
  }
  const toggle = <T,>(values: T[], value: T) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  return (
    <section className="master-panel" aria-labelledby="master-title">
      <header className="master-heading">
        <div>
          <div className="section-eyebrow">
            AI EVOLUTION POLSKA / MASTER AGENT
          </div>
          <h2 id="master-title">
            {pl ? "Jeden cel. Cały zespół." : "One goal. Your whole team."}
          </h2>
          <p className="helper">
            {pl
              ? "Wybierz lidera. Opisz rezultat. Master zaplanuje pracę, dobierze wykonawców i oceni efekty."
              : "Choose a lead. Describe the result. Master plans, assigns workers and evaluates outcomes."}
          </p>
        </div>
        {mission && !composing && (
          <button
            className="secondary"
            disabled={busy || active || unresolved}
            onClick={() => {
              setDraft(true);
              setConsent(false);
              setNotice("");
            }}
          >
            {pl ? "Nowy cel" : "New goal"}
          </button>
        )}
      </header>
      <div
        className="master-topology"
        aria-label={pl ? "Architektura zespołu" : "Team architecture"}
      >
        <div className="master-lead">
          <ProviderIcon provider={composing ? master : mission.master} />
          <div>
            <span>MASTER AGENT</span>
            <strong>{agentName(composing ? master : mission.master)}</strong>
            <small>
              {pl
                ? "Planuje → deleguje → ocenia"
                : "Plans → delegates → evaluates"}
            </small>
          </div>
        </div>
        <div className="master-workers">
          {AGENTS.map((id) => {
            const state = connectionState(providers.find((p) => p.id === id)),
              assigned = (composing ? workers : mission.workers).includes(id);
            return (
              <span
                className={`state-${state}${assigned ? " assigned" : ""}`}
                key={id}
              >
                <span className="picker-glyph">
                  <ProviderIcon provider={id} />
                  {state !== "none" && (
                    <i className="connection-dot" aria-hidden="true" />
                  )}
                </span>
                <strong>{agentName(id)}</strong>
                <small>
                  {state === "none"
                    ? pl
                      ? "Do podłączenia"
                      : "Connect to use"
                    : connectionLabel(state, pl)}
                </small>
              </span>
            );
          })}
        </div>
        <div className="master-foundation">
          <span>
            <Icon name="memory" />
            <strong>Shared Memory</strong>
            <small>
              {composing ? contextCount : mission.contextIds.length}{" "}
              {pl ? "wybranych wpisów" : "selected entries"}
            </small>
          </span>
          <button className="secondary" onClick={onQuota}>
            <Icon name="tokens" />
            Quota Monitor
            <small>
              {pl
                ? "Kontrola przed każdym krokiem"
                : "Checked before each step"}
            </small>
          </button>
        </div>
      </div>
      {error && (
        <p className="master-alert" role="alert">
          {reason(error)}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {composing ? (
        <form
          className="mission-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const result = await api.missionPlan!({
                projectId: project.id,
                goal,
                master,
                workers,
                contextIds,
                skillIds,
                consent: true,
              });
              setSelected(result.id);
              setDraft(false);
            });
          }}
        >
          <label>
            {pl ? "Co ma osiągnąć zespół?" : "What should the team achieve?"}
            <textarea
              rows={4}
              maxLength={4000}
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={
                pl
                  ? "Np. dodaj logowanie do mojego projektu, sprawdź testy i przygotuj zmiany do przeglądu…"
                  : "For example: add sign-in to my project, verify tests and prepare changes for review…"
              }
              disabled={busy || active}
            />
          </label>
          <div className="mission-roles">
            <SelectField
              label="Master Agent"
              value={master}
              onChange={(v) => setMaster(v as Agent)}
              options={READ_ONLY_AGENTS.filter((id) => id !== "gemini").map(
                (id) => ({
                  value: id,
                  label:
                    agentName(id) +
                    (providers.some((p) => p.id === id && p.configured)
                      ? ""
                      : pl
                        ? " · do podłączenia"
                        : " · connect first"),
                }),
              )}
              disabled={busy || active}
            />
            <button type="button" className="secondary" onClick={onConnections}>
              {pl ? "Zarządzaj połączeniami" : "Manage connections"}
            </button>
          </div>
          <fieldset className="mission-roster">
            <legend>
              {pl ? "Zespół dostępny dla Mastera" : "Available team"}
            </legend>
            {providers
              .filter((p) => p.id !== "gemini")
              .map((p) => (
                <label className="dependency-choice" key={p.id}>
                  <input
                    type="checkbox"
                    disabled={!p.configured || busy || active}
                    checked={workers.includes(p.id)}
                    onChange={() => setWorkers(toggle(workers, p.id))}
                  />
                  <span>
                    {agentName(p.id)}
                    {!READ_ONLY_AGENTS.includes(p.id) && (
                      <small>
                        {pl ? "Tylko wykonawca" : "Implementation only"}
                      </small>
                    )}
                  </span>
                </label>
              ))}
          </fieldset>
          <p className="helper">
            {pl
              ? "Wybierz co najmniej dwóch agentów, aby wykonawca i recenzent byli niezależni. Hermes i Antigravity są dostępni jako wykonawcy."
              : "Select at least two agents for independent implementation and review. Hermes and Antigravity are workers only."}
          </p>
          <details className="mission-context">
            <summary>
              {pl ? "Wspólna pamięć i skille" : "Shared memory and skills"} ·{" "}
              {contextCount} / {skillIds.length}
            </summary>
            <fieldset>
              <legend>Shared Memory</legend>
              {!memory.length && (
                <p className="helper">
                  {pl
                    ? "Dodaj decyzje i konwencje w zakładce Pamięć."
                    : "Add decisions and conventions in Memory."}
                </p>
              )}
              {memory.map((m) => (
                <label key={m.id} className="dependency-choice">
                  <input
                    type="checkbox"
                    disabled={
                      busy ||
                      !!m.pinned ||
                      (contextCount >= 20 && !contextIds.includes(m.id))
                    }
                    checked={!!m.pinned || contextIds.includes(m.id)}
                    onChange={() => setContextIds(toggle(contextIds, m.id))}
                  />
                  <span>
                    {m.content.slice(0, 160)}
                    <small>
                      {m.scope === "workspace" ? "Workspace" : project.name} ·{" "}
                      {m.source}
                      {m.pinned
                        ? pl
                          ? " · Przypięta automatycznie"
                          : " · Automatically pinned"
                        : ""}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>
                {pl ? "Skille dla całego zespołu" : "Skills for the whole team"}
              </legend>
              {skills.map((s) => (
                <label key={s.id} className="dependency-choice">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={skillIds.includes(s.id)}
                    onChange={() => setSkillIds(toggle(skillIds, s.id))}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </fieldset>
          </details>
          <label className="dependency-choice consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy || active}
            />
            <span>
              {pl
                ? "Uruchom Mastera z wybraną pamięcią i skillami. Planowanie korzysta z limitów dostawcy. Wykonanie planu uruchomię osobno."
                : "Run Master with the selected memory and skills. Planning uses provider quota. I will launch execution separately."}
            </span>
          </label>
          <div className="mission-actions">
            <button
              disabled={
                !consent ||
                !goal.trim() ||
                workers.length < 2 ||
                busy ||
                active ||
                !providers.some((p) => p.id === master && p.configured)
              }
            >
              <Icon name="spark" />
              {busy
                ? pl
                  ? "Uruchamiam…"
                  : "Starting…"
                : pl
                  ? "Przygotuj plan"
                  : "Prepare plan"}
            </button>
            {mission && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setDraft(false)}
              >
                {pl ? "Wróć do misji" : "Back to mission"}
              </button>
            )}
          </div>
          <p className="helper">
            {pl
              ? "Limity nieudostępniane przez dostawcę pozostają nieznane. Brak licznika nie oznacza nielimitowanego dostępu."
              : "Quotas unavailable from a provider remain unknown. Missing counters do not mean unlimited access."}
          </p>
        </form>
      ) : (
        <div className="mission-result">
          {missions.length > 1 && (
            <SelectField
              label={pl ? "Historia celów" : "Goal history"}
              value={mission.id}
              options={missions.map((m) => ({
                value: m.id,
                label: m.goal.slice(0, 70),
              }))}
              onChange={setSelected}
              disabled={busy}
            />
          )}
          <div className="mission-state" role="status">
            <span className={`mission-dot state-${mission.status}`} />
            <strong>{statuses[mission.status]}</strong>
            <span>
              {new Date(mission.createdAt).toLocaleString(
                pl ? "pl-PL" : "en-GB",
              )}
            </span>
          </div>
          <h3>{mission.goal}</h3>
          {mission.summary && (
            <p className="mission-summary">{mission.summary}</p>
          )}
          {mission.reason && (
            <p className="master-alert">
              {reason(mission.reason)}
              {/* Only OpenCode via OpenRouter is paid per token today. */}
              {mission.reason === "POLICY_APPROVAL_REQUIRED" && (
                <PaidApproval agent="opencode" pl={pl} />
              )}
            </p>
          )}
          <ol className="mission-steps">
            {mission.steps.map((step, index) => {
              const task = tasks.find((t) => t.id === step.taskId);
              return (
                <li key={step.key}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <div className="step-title">
                      <h4>{step.title}</h4>
                      <span className="badge">
                        {step.workflow === "research"
                          ? pl
                            ? "Analiza"
                            : "Research"
                          : pl
                            ? "Wdrożenie"
                            : "Implementation"}
                      </span>
                    </div>
                    <p>{step.acceptance}</p>
                    <div className="step-assignment">
                      <ProviderIcon provider={step.implementer} />
                      {agentName(step.implementer)}
                      <span>→</span>
                      <ProviderIcon provider={step.reviewer} />
                      {agentName(step.reviewer)}
                      {task && (
                        <button className="secondary" onClick={onTasks}>
                          {pl ? "Otwórz zadania" : "Open tasks"}
                        </button>
                      )}
                    </div>
                    {step.dependsOn.length > 0 && (
                      <small>
                        {pl ? "Po krokach: " : "After steps: "}
                        {step.dependsOn
                          .map(
                            (key) =>
                              mission.steps.findIndex((s) => s.key === key) + 1,
                          )
                          .join(", ")}
                      </small>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mission-actions">
            {["ready", "blocked", "interrupted", "stopped"].includes(
              mission.status,
            ) &&
              mission.steps.length > 0 && (
                <button
                  disabled={busy || active}
                  onClick={() =>
                    void act(() =>
                      api.missionAction!({
                        projectId: project.id,
                        id: mission.id,
                        action: "execute",
                        consent: true,
                      }),
                    )
                  }
                >
                  <Icon name="play" />
                  {mission.status === "ready"
                    ? pl
                      ? "Uruchom plan"
                      : "Launch plan"
                    : pl
                      ? "Kontynuuj misję"
                      : "Continue mission"}
                </button>
              )}
            {!["completed", "needs_changes", "stopped", "failed"].includes(
              mission.status,
            ) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void act(() =>
                    api.missionAction!({
                      projectId: project.id,
                      id: mission.id,
                      action: "stop",
                      consent: true,
                    }),
                  )
                }
              >
                {pl ? "Zatrzymaj misję" : "Stop mission"}
              </button>
            )}
            {mission.status === "blocked" && (
              <button className="secondary" onClick={onTasks}>
                {pl ? "Przejdź do wyników zadań" : "Open task results"}
              </button>
            )}
          </div>
          {mission.status === "ready" && (
            <p className="helper">
              {pl
                ? "Uruchomienie korzysta z limitów wybranych agentów. Kroki wykonają się kolejno; zmiany plików zatrzymają misję do Twojej decyzji. Master oceni cel po zakończeniu wszystkich kroków."
                : "Launching uses the selected agents' quota. Steps run sequentially; file changes pause for your decision. Master evaluates the goal after all steps finish."}
            </p>
          )}
          {mission.evaluation && (
            <section className="mission-evaluation">
              <h3>
                <Icon name="check" />
                {pl ? "Ocena Master Agenta" : "Master assessment"}
              </h3>
              <p>{mission.evaluation.summary}</p>
              {mission.evaluation.nextSteps && (
                <p>{mission.evaluation.nextSteps}</p>
              )}
              <div className="mission-actions">
                <SelectField
                  label={pl ? "Zapisz w pamięci" : "Remember in"}
                  value={scope}
                  onChange={(v) => setScope(v as typeof scope)}
                  options={[
                    { value: "project", label: project.name },
                    {
                      value: "workspace",
                      label:
                        "Workspace · " +
                        (pl ? "wszystkie projekty" : "all projects"),
                    },
                  ]}
                />
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api.missionRemember!({
                        projectId: project.id,
                        id: mission.id,
                        scope,
                      });
                      setNotice(
                        pl
                          ? "Wynik zapisany w pamięci."
                          : "Result saved to memory.",
                      );
                    })
                  }
                >
                  <Icon name="memory" />
                  {pl ? "Zachowaj wynik" : "Save result"}
                </button>
              </div>
            </section>
          )}
          <details className="mission-journal">
            <summary>
              {pl ? "Dziennik pracy" : "Activity journal"} ·{" "}
              {mission.events.length}
            </summary>
            <ol>
              {mission.events.map((event, i) => (
                <li key={i}>
                  <time>
                    {new Date(event.at).toLocaleTimeString(
                      pl ? "pl-PL" : "en-GB",
                    )}
                  </time>
                  <span>{event.message}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </section>
  );
}

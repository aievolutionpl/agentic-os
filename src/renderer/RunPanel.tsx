import React, { useEffect, useRef, useState } from "react";
import type {
  Agent,
  Task,
  Memory,
  RuntimeView,
  Run,
  Extension,
} from "../shared";
import { Icon, Modal, SelectField } from "./ui";
import { PaidApproval, policyMessage } from "./PolicyPanel";
const copy = {
  en: {
    title: "Execution & review",
    start: "Start isolated run",
    resume: "Resume interrupted run",
    consent:
      "Send this task and selected context to the configured agent. Account limits or charges may apply.",
    setup:
      "Configure this agent in Integrations first. A clean Git repository is required.",
    context: "Project context",
    history: "Run history",
    stop: "Stop run",
    stopAsk: "Stop this run?",
    keep: "Keep running",
    stopHint:
      "The provider process will stop. Its isolated worktree will remain available for inspection.",
    review: "Run independent review",
    reviewHint:
      "The other provider reviews this result in read-only mode. A human decision is still required.",
    activity: "Activity",
    diff: "Captured changes",
    empty: "No execution yet. Queueing alone does not start an agent.",
    error:
      "The request was rejected. Check agent setup, repository state and run status.",
    loading: "Loading run…",
    instruction: "Additional instructions",
    steer: "Send instructions",
    worktree: "Isolated worktree",
    reviewText: "Independent review",
    status: "Run status",
    workflow: "Workflow",
    implementation: "Implementation + review",
    research: "Research (no file changes required)",
    bugfix: "Bug fix with regression evidence",
    audit: "UI audit",
    approve: "Approve artifact",
    reject: "Reject changes",
    apply: "Apply approved changes",
    decisionAsk: "Confirm your decision",
    decisionHint:
      "This decision is bound to the captured artifact and current attempt. Applying requires a clean, unchanged base repository.",
    confirm: "Confirm",
    close: "Close",
    hash: "Artifact SHA-256",
  },
  pl: {
    title: "Wykonanie i review",
    start: "Uruchom w izolacji",
    resume: "Wznów przerwany przebieg",
    consent:
      "Wyślij zadanie i wybrany kontekst do skonfigurowanego agenta. Mogą obowiązywać limity konta lub opłaty.",
    setup:
      "Najpierw skonfiguruj tego agenta w Integracjach. Wymagane jest czyste repozytorium Git.",
    context: "Kontekst projektu",
    history: "Historia przebiegów",
    stop: "Zatrzymaj przebieg",
    stopAsk: "Zatrzymać ten przebieg?",
    keep: "Kontynuuj pracę",
    stopHint:
      "Proces agenta zostanie zakończony. Izolowane worktree pozostanie dostępne do sprawdzenia.",
    review: "Uruchom niezależne review",
    reviewHint:
      "Drugi provider przegląda wynik w trybie tylko do odczytu. Nadal potrzebna jest decyzja człowieka.",
    activity: "Aktywność",
    diff: "Przechwycone zmiany",
    empty: "Brak wykonania. Samo zakolejkowanie nie uruchamia agenta.",
    error:
      "Żądanie odrzucone. Sprawdź konfigurację agenta, stan repozytorium i przebiegu.",
    loading: "Wczytywanie przebiegu…",
    instruction: "Dodatkowe instrukcje",
    steer: "Wyślij instrukcje",
    worktree: "Izolowane worktree",
    reviewText: "Niezależne review",
    status: "Status przebiegu",
    workflow: "Przepływ",
    implementation: "Implementacja i review",
    research: "Research (zmiany plików opcjonalne)",
    bugfix: "Naprawa z dowodem regresji",
    audit: "Audyt UI",
    approve: "Zatwierdź artefakt",
    reject: "Odrzuć zmiany",
    apply: "Zastosuj zatwierdzone zmiany",
    decisionAsk: "Potwierdź decyzję",
    decisionHint:
      "Decyzja dotyczy konkretnego artefaktu i próby. Zastosowanie wymaga czystego repozytorium z niezmienioną bazą.",
    confirm: "Potwierdź",
    close: "Zamknij",
    hash: "SHA-256 artefaktu",
  },
};
const states: Record<string, [string, string]> = {
  preparing: ["Preparing", "Przygotowanie"],
  running: ["Running", "Wykonywanie"],
  reviewing: ["Reviewing", "Review"],
  awaiting_review: ["Needs review", "Wymaga review"],
  completed: ["Completed", "Ukończono"],
  failed: ["Failed", "Błąd"],
  cancelled: ["Cancelled", "Anulowano"],
  interrupted: ["Interrupted", "Przerwano"],
  applied: ["Applied", "Zastosowano"],
  rejected: ["Rejected", "Odrzucono"],
  applying: ["Applying", "Stosowanie zmian"],
  apply_uncertain: [
    "Application needs inspection",
    "Sprawdź zastosowanie zmian",
  ],
};
export function RunPanel({
  task,
  memory = [],
  language,
  onChanged,
}: {
  task: Task;
  memory?: Memory[];
  language: "pl" | "en";
  onChanged: () => void;
}) {
  const api = window.agenting!,
    w = copy[language];
  const [view, setView] = useState<RuntimeView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [policyCode, setPolicyCode] = useState(""),
    [heldByQueue, setHeldByQueue] = useState(false),
    [readOnlyRefused, setReadOnlyRefused] = useState(false),
    // The agent whose start the policy refused: the reviewer for review runs.
    [policyAgent, setPolicyAgent] = useState<Agent>(task.implementer),
    [consent, setConsent] = useState(false),
    [ids, setIds] = useState<string[]>([]),
    [instruction, setInstruction] = useState(""),
    [stopping, setStopping] = useState(false),
    [workflow, setWorkflow] = useState("implementation"),
    [artifact, setArtifact] = useState<{
      diff: string;
      diffHash: string;
    } | null>(null),
    [decision, setDecision] = useState<"approve" | "reject" | "apply" | null>(
      null,
    );
  const alive = useRef(true);
  const [skills, setSkills] = useState<Extension[]>([]),
    [skillIds, setSkillIds] = useState<string[]>([]);
  useEffect(() => {
    let valid = true;
    if (api.extensionList)
      void api
        .extensionList({ projectId: task.projectId })
        .then((items) => {
          if (valid) setSkills(items.filter((item) => item.kind === "skill"));
        })
        .catch(() => {
          if (valid) setContextError(true);
        });
    return () => {
      valid = false;
    };
  }, [task.projectId]);
  const [preview, setPreview] = useState<{
      body: string;
      characters: number;
      limit: number;
    } | null>(null),
    [contextError, setContextError] = useState(false);
  const run = view?.runs[0];
  const active =
    !!run && ["preparing", "running", "reviewing"].includes(run.state);
  const configured = view?.providers.find(
    (provider) => provider.id === task.implementer,
  )?.configured;
  const reviewerReady = view?.providers.find(
    (provider) => provider.id === task.reviewer,
  )?.configured;
  async function refresh() {
    if (!api.runtimeView) return;
    try {
      const next = await api.runtimeView({
        projectId: task.projectId,
        taskId: task.id,
      });
      if (alive.current) {
        setView(next);
        setError(false);
      }
    } catch {
      if (alive.current) setError(true);
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [task.id]);
  useEffect(() => {
    if (run) onChanged();
  }, [run?.state]);
  useEffect(() => {
    setArtifact(null);
  }, [run?.id, run?.artifactId]);
  async function action(
    fn: () => Promise<unknown>,
    agent: Agent = task.implementer,
  ) {
    setBusy(true);
    setError(false);
    setPolicyCode("");
    setHeldByQueue(false);
    setReadOnlyRefused(false);
    try {
      await fn();
      await refresh();
      onChanged();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "TASK_HELD_BY_QUEUE") setHeldByQueue(true);
      else if (code.endsWith("READ_ONLY_UNSUPPORTED")) setReadOnlyRefused(true);
      else if (policyMessage(code, true)) {
        setPolicyAgent(agent);
        setPolicyCode(code);
      } else setError(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const mayStart = ["draft", "queued"].includes(task.status) && !run;
  const mayResume =
    task.implementer !== "antigravity" &&
    ["failed", "queued"].includes(task.status) &&
    !!run &&
    ["failed", "interrupted"].includes(run.state) &&
    run.error !== "STOP_UNCONFIRMED";
  useEffect(() => {
    if (!api.contextPreview) return;
    let valid = true;
    setContextError(false);
    setPreview(null);
    void api
      .contextPreview({
        projectId: task.projectId,
        contextIds: ids,
        workflow,
        skillIds,
      })
      .then((value) => {
        if (valid) setPreview(value);
      })
      .catch(() => {
        if (valid) setContextError(true);
      });
    return () => {
      valid = false;
    };
  }, [task.id, ids.join(","), workflow, skillIds.join(",")]);
  return (
    <section className="run-panel" aria-labelledby="run-section-title">
      <div className="section-heading">
        <h3 id="run-section-title">{w.title}</h3>
        {run && (
          <span className={`badge run-state state-${run.state}`}>
            {states[run.state]?.[language === "pl" ? 1 : 0] ?? run.state}
          </span>
        )}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {w.error}
        </p>
      )}
      {heldByQueue && (
        <p className="inline-error" role="alert">
          {language === "pl"
            ? "To zadanie czeka w kolejce zespołu. Kontynuuj albo porzuć kolejkę w panelu pracy zespołowej."
            : "This task is held by the team queue. Continue or abandon the queue in the teamwork panel."}
        </p>
      )}
      {readOnlyRefused && (
        <p className="inline-error" role="alert">
          {language === "pl"
            ? "Ten agent nie ma trybu tylko do odczytu, więc nie może wykonać tego workflow. Wybierz implementację albo innego wykonawcę."
            : "This agent has no read-only mode, so it can't run this workflow. Choose implementation or a different implementer."}
        </p>
      )}
      {policyCode && (
        <div className="inline-error policy-refusal" role="alert">
          <p>{policyMessage(policyCode, language === "pl")}</p>
          {policyCode.includes("POLICY_APPROVAL_REQUIRED") && (
            <PaidApproval agent={policyAgent} pl={language === "pl"} />
          )}
        </div>
      )}
      {!run && <p className="helper">{w.empty}</p>}
      {(mayStart || mayResume) && (
        <>
          <p className="helper">{w.setup}</p>
          <label className="field-label">{w.workflow}</label>
          <SelectField
            label={w.workflow}
            value={workflow}
            onChange={setWorkflow}
            disabled={busy}
            options={[
              { value: "implementation", label: w.implementation },
              { value: "bugfix", label: w.bugfix },
              { value: "research", label: w.research },
              { value: "audit", label: w.audit },
            ]}
          />
          {!!memory.length && (
            <details className="context-picker">
              <summary>
                {w.context}{" "}
                <span className="count">
                  {
                    new Set([
                      ...ids,
                      ...memory.filter((m) => m.pinned).map((m) => m.id),
                    ]).size
                  }
                </span>
              </summary>
              {memory.map((entry) => (
                <label className="dependency-choice" key={entry.id}>
                  <input
                    type="checkbox"
                    disabled={busy || !!entry.pinned}
                    checked={!!entry.pinned || ids.includes(entry.id)}
                    onChange={(event) =>
                      setIds((current) =>
                        event.target.checked
                          ? [...current, entry.id]
                          : current.filter((id) => id !== entry.id),
                      )
                    }
                  />
                  <span>
                    {entry.content.slice(0, 140)}
                    <small>
                      {entry.source}
                      {entry.pinned
                        ? language === "pl"
                          ? " · Przypięta automatycznie"
                          : " · Automatically pinned"
                        : ""}
                    </small>
                  </span>
                </label>
              ))}
            </details>
          )}
          {!!skills.length && (
            <details className="context-picker">
              <summary>
                {language === "pl" ? "Skille projektu" : "Project skills"}{" "}
                <span className="count">{skillIds.length}</span>
              </summary>
              {skills.map((skill) => (
                <label className="dependency-choice" key={skill.id}>
                  <input
                    type="checkbox"
                    checked={skillIds.includes(skill.id)}
                    disabled={busy}
                    onChange={(event) =>
                      setSkillIds((current) =>
                        event.target.checked
                          ? [...current, skill.id]
                          : current.filter((id) => id !== skill.id),
                      )
                    }
                  />
                  <span>
                    {skill.name}
                    <small>
                      {skill.version} · {skill.license}
                    </small>
                  </span>
                </label>
              ))}
            </details>
          )}
          <label className="dependency-choice consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={busy}
            />
            <span>{w.consent}</span>
          </label>
          {preview && (
            <details className="context-preview">
              <summary>
                {w.context} · {preview.characters}/{preview.limit}
              </summary>
              <pre>{preview.body}</pre>
            </details>
          )}
          {contextError && (
            <p className="inline-error" role="alert">
              {language === "pl"
                ? "Kontekst przekracza limit lub zawiera nieprawidłowy wybór. Zmniejsz zaznaczenie."
                : "Context exceeds the budget or contains an invalid selection. Select fewer entries."}
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !configured ||
              !consent ||
              contextError ||
              !preview ||
              (task.status === "queued" && !task.ready)
            }
            onClick={() =>
              void action(() =>
                api.runtimeStart({
                  projectId: task.projectId,
                  taskId: task.id,
                  consent: true,
                  contextIds: ids,
                  skillIds,
                  workflow,
                  ...(mayResume ? { resumeRunId: run!.id } : {}),
                }),
              )
            }
          >
            {mayResume ? w.resume : w.start}
          </button>
        </>
      )}
      {run && (
        <>
          <p className="helper">
            {w.worktree}
            <code className="run-path">{run.worktree}</code>
          </p>
          {active && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setStopping(true)}
            >
              {w.stop}
            </button>
          )}
          {run.state === "running" && run.provider === "codex" && (
            <form
              className="steer-form"
              onSubmit={(event) => {
                event.preventDefault();
                void action(async () => {
                  await api.runtimeAction({
                    projectId: task.projectId,
                    runId: run.id,
                    action: "steer",
                    instruction,
                  });
                  setInstruction("");
                });
              }}
            >
              <label htmlFor="run-instruction">{w.instruction}</label>
              <textarea
                id="run-instruction"
                rows={2}
                maxLength={4000}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                disabled={busy}
              />
              <button
                className="secondary"
                disabled={busy || !instruction.trim()}
              >
                {w.steer}
              </button>
            </form>
          )}
          {run.summary && (
            <div className="run-output" aria-label={w.activity}>
              <pre>{run.summary}</pre>
            </div>
          )}
          {run.artifactId && (
            <details
              className="artifact-preview"
              onToggle={(event) => {
                if (event.currentTarget.open && !artifact)
                  void action(async () =>
                    setArtifact(
                      await api.runArtifact({
                        projectId: task.projectId,
                        runId: run.id,
                      }),
                    ),
                  );
              }}
            >
              <summary>{w.diff}</summary>
              {artifact ? (
                <>
                  <p className="helper">
                    {w.hash}
                    <code className="run-path">{artifact.diffHash}</code>
                  </p>
                  <pre tabIndex={0}>{artifact.diff}</pre>
                </>
              ) : (
                <p className="helper">{w.loading}</p>
              )}
            </details>
          )}
          {["awaiting_review", "completed"].includes(run.state) && (
            <>
              <p className="helper">{w.reviewHint}</p>
              <button
                className="secondary"
                disabled={
                  busy || !reviewerReady || run.reviewState === "running"
                }
                onClick={() =>
                  void action(
                    () =>
                      api.runtimeReview({
                        projectId: task.projectId,
                        runId: run.id,
                        consent: true,
                      }),
                    run.reviewer,
                  )
                }
              >
                {w.review}
              </button>
            </>
          )}
          {run.reviewText && (
            <details className="review-output" open>
              <summary>{w.reviewText}</summary>
              <pre>{run.reviewText}</pre>
            </details>
          )}
          {run.state === "awaiting_review" && api.runDecision && (
            <div className="panel-actions">
              <button
                className="secondary"
                disabled={busy || run.reviewState !== "completed" || !artifact}
                onClick={() => setDecision("approve")}
              >
                {w.approve}
              </button>
              <button
                className="cancel-action"
                disabled={busy}
                onClick={() => setDecision("reject")}
              >
                {w.reject}
              </button>
              {run.approvalId && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => setDecision("apply")}
                >
                  {w.apply}
                </button>
              )}
            </div>
          )}
          {!!view?.events.length && (
            <details className="run-events">
              <summary>
                {w.activity} <span className="count">{view.events.length}</span>
              </summary>
              <ol>
                {view.events.map((event) => (
                  <li key={event.seq}>
                    <time>
                      {new Date(event.at).toLocaleTimeString(language, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <span>{event.text}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <details className="run-history">
            <summary>{w.history}</summary>
            {view?.runs.map((item) => (
              <p className="helper" key={item.id}>
                {new Date(item.createdAt).toLocaleString(language)} ·{" "}
                {states[item.state]?.[language === "pl" ? 1 : 0]} ·{" "}
                {item.provider} → {item.reviewer}
              </p>
            ))}
          </details>
        </>
      )}
      <Modal
        open={stopping}
        onClose={() => setStopping(false)}
        titleId="stop-run-title"
        className="confirm-dialog"
      >
        <h2 id="stop-run-title">{w.stopAsk}</h2>
        <p>{w.stopHint}</p>
        <div className="dialog-actions">
          <button autoFocus disabled={busy} onClick={() => setStopping(false)}>
            {w.keep}
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api.runtimeAction({
                  projectId: task.projectId,
                  runId: run!.id,
                  action: "cancel",
                });
                setStopping(false);
              })
            }
          >
            {w.stop}
          </button>
        </div>
      </Modal>
      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        titleId="run-decision-title"
        className="confirm-dialog"
      >
        <h2 id="run-decision-title">{w.decisionAsk}</h2>
        <p>{w.decisionHint}</p>
        <div className="dialog-actions">
          <button autoFocus onClick={() => setDecision(null)} disabled={busy}>
            {w.close}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api.runDecision!({
                  projectId: task.projectId,
                  runId: run!.id,
                  action: decision!,
                });
                setDecision(null);
              })
            }
          >
            {w.confirm}
          </button>
        </div>
      </Modal>
    </section>
  );
}

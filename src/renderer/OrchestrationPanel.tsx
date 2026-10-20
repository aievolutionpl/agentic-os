import React, { useEffect, useState } from "react";
import type {
  Task,
  Memory,
  OrchestrationEvent,
  OrchestrationState,
} from "../shared";
import { Icon, Modal, agentName } from "./ui";

export function OrchestrationPanel({
  projectId,
  tasks,
  memory,
  language,
  onChanged,
}: {
  projectId: string;
  tasks: Task[];
  memory: Memory[];
  language: "pl" | "en";
  onChanged: () => void;
}) {
  const pl = language === "pl",
    api = window.agenting!;
  const [state, setState] = useState<OrchestrationState | null>(null),
    [open, setOpen] = useState(false),
    [inspect, setInspect] = useState(false),
    [events, setEvents] = useState<OrchestrationEvent[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [contextIds, setContextIds] = useState<string[]>([]),
    [taskIds, setTaskIds] = useState<string[]>([]),
    [parallel, setParallel] = useState(false);
  useEffect(() => {
    if (!api.orchestrationState) return;
    let alive = true;
    const update = () =>
      api.orchestrationState!({ projectId })
        .then((s) => {
          if (alive)
            setState((previous) => {
              if (previous?.status === "running" && s.status !== "running")
                queueMicrotask(onChanged);
              return s;
            });
        })
        .catch(() => {
          if (alive) setError(true);
        });
    void update();
    const timer = setInterval(() => void update(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectId]);
  if (!api.orchestrationStart) return null;
  const queued = tasks.filter((t) => t.status === "queued");
  const running = state?.status === "running";
  const labels = pl
    ? {
        idle: "Gotowy",
        running: "Pracuje",
        blocked: "Wymaga decyzji",
        completed: "Zakończono",
        stopped: "Zatrzymano",
        failed: "Błąd wykonania",
        interrupted: "Przerwano",
      }
    : {
        idle: "Ready",
        running: "Running",
        blocked: "Decision needed",
        completed: "Completed",
        stopped: "Stopped",
        failed: "Run failed",
        interrupted: "Interrupted",
      };
  return (
    <section
      className="orchestration-panel"
      aria-label={pl ? "Orkiestracja zadań" : "Task orchestration"}
    >
      <Icon name="connections" />
      <div className="orchestration-copy">
        <strong>{pl ? "Praca zespołowa agentów" : "Agent teamwork"}</strong>
        <p>
          {pl
            ? "Wspólny kontekst → wykonawca → niezależny przegląd → Twoja decyzja"
            : "Shared context → implementer → independent review → your decision"}
        </p>
        {state && state.status !== "idle" && (
          <span role="status">
            {labels[state.status]} · {state.finished}/{state.taskIds.length}
            {state.status === "running" &&
              (state.runIds?.length ?? 0) > 1 &&
              (pl
                ? ` · ${state.runIds!.length} zadania równolegle`
                : ` · ${state.runIds!.length} tasks in parallel`)}
            {state.status === "blocked" &&
              state.reason === "FILE_CONFLICT" &&
              (pl
                ? " · Dwa zadania zmieniły te same pliki. Zatwierdź jedno, a drugie uruchom ponownie na nowym stanie."
                : " · Two tasks changed the same files. Approve one, then re-run the other on the new state.")}
            {state.status === "blocked" &&
              state.reason !== "FILE_CONFLICT" &&
              (pl
                ? " · Otwórz wynik zadania, aby przejrzeć i zatwierdzić zmiany."
                : " · Open the task result to review and approve changes.")}
            {state.status === "interrupted" &&
              (pl
                ? " · Aplikacja została zamknięta w trakcie pracy. Nic nie zostało powtórzone."
                : " · The app closed during work. Nothing was replayed.")}
          </span>
        )}
      </div>
      {running ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api.orchestrationStop!({ projectId })
              .then(() => onChanged())
              .catch(() => setError(true))
              .finally(() => setBusy(false));
          }}
        >
          {pl ? "Zatrzymaj" : "Stop"}
        </button>
      ) : (
        <>
          {state?.status === "interrupted" && state.id && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setError(false);
                setInspect(true);
                void api
                  .orchestrationEvents?.({ projectId })
                  .then(setEvents)
                  .catch(() => setError(true));
              }}
            >
              {pl ? "Sprawdź / Kontynuuj" : "Inspect / Continue"}
            </button>
          )}
          <button
            className="secondary"
            disabled={!queued.length || busy}
            onClick={() => {
              setTaskIds(queued.slice(0, 10).map((t) => t.id));
              setContextIds([]);
              setError(false);
              setOpen(true);
            }}
          >
            {pl
              ? `Uruchom kolejkę (${queued.length})`
              : `Run queue (${queued.length})`}
          </button>
        </>
      )}
      {error && !open && !inspect && (
        <p role="alert">
          {pl
            ? "Nie udało się odczytać lub uruchomić kolejki."
            : "Could not read or run the queue."}
        </p>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        titleId="orchestration-title"
        className="batch-dialog"
      >
        <h2 id="orchestration-title">
          {pl ? "Uruchom zespół agentów" : "Run your agent team"}
        </h2>
        <p className="helper">
          {pl
            ? "Maksymalnie 10 zadań, kolejno według zależności. Po zmianach plików uruchomimy skonfigurowanego recenzenta i zatrzymamy kolejkę do Twojej decyzji. Uruchomienie korzysta z limitów i rozliczeń wybranych dostawców."
            : "Up to 10 tasks, sequentially by dependencies. File changes trigger the configured reviewer and pause the queue for your decision. Runs use the selected providers' limits and billing."}
        </p>
        <fieldset>
          <legend>{pl ? "Zadania" : "Tasks"}</legend>
          {queued.slice(0, 10).map((task) => (
            <label className="dependency-choice" key={task.id}>
              <input
                type="checkbox"
                disabled={busy}
                checked={taskIds.includes(task.id)}
                onChange={(e) =>
                  setTaskIds((ids) =>
                    e.target.checked
                      ? [...ids, task.id]
                      : ids.filter((id) => id !== task.id),
                  )
                }
              />
              <span>
                {task.title}
                <small>
                  {agentName(task.implementer)} → {agentName(task.reviewer)}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>
            {pl
              ? "Pamięć dla wszystkich wykonawców i recenzentów"
              : "Memory shared by every implementer and reviewer"}
          </legend>
          {memory.length ? (
            memory.map((entry) => (
              <label className="dependency-choice" key={entry.id}>
                <input
                  type="checkbox"
                  disabled={
                    busy ||
                    !!entry.pinned ||
                    (!contextIds.includes(entry.id) &&
                      new Set([
                        ...contextIds,
                        ...memory.filter((m) => m.pinned).map((m) => m.id),
                      ]).size >= 20)
                  }
                  checked={!!entry.pinned || contextIds.includes(entry.id)}
                  onChange={(e) =>
                    setContextIds((ids) =>
                      e.target.checked
                        ? [...ids, entry.id]
                        : ids.filter((id) => id !== entry.id),
                    )
                  }
                />
                <span>
                  {entry.content}
                  <small>
                    {entry.source} · {entry.scope ?? "project"}
                    {entry.pinned
                      ? pl
                        ? " · Przypięta automatycznie"
                        : " · Automatically pinned"
                      : ""}
                  </small>
                </span>
              </label>
            ))
          ) : (
            <p>{pl ? "Brak wpisów pamięci." : "No memory entries."}</p>
          )}
        </fieldset>
        <label className="dependency-choice parallel-choice">
          <input
            type="checkbox"
            disabled={busy}
            checked={parallel}
            onChange={(e) => setParallel(e.target.checked)}
          />
          <span>
            {pl
              ? "Uruchamiaj do 2 niezależnych zadań naraz"
              : "Run up to 2 independent tasks at once"}
            <small>
              {pl
                ? "Każde we własnym worktree. Zadania zależne czekają na swoje poprzedniki, a dwie zmiany tych samych plików zatrzymują kolejkę przed zatwierdzeniem."
                : "Each in its own worktree. Dependent tasks wait for their prerequisites, and two changes to the same files stop the queue before approval."}
            </small>
          </span>
        </label>
        {error && (
          <p role="alert">
            {pl
              ? "Sprawdź połączenia agentów, kolejkę i rozmiar kontekstu. Nie udało się rozpocząć."
              : "Could not start. Check agent connections, queued tasks and context size."}
          </p>
        )}
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy || !taskIds.length}
            onClick={() => {
              setBusy(true);
              setError(false);
              void api.orchestrationStart!({
                projectId,
                taskIds,
                contextIds,
                consent: true,
                ...(parallel && { parallel: true }),
              })
                .then((s) => {
                  setState(s);
                  setOpen(false);
                  onChanged();
                })
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Uruchom wybrane zadania" : "Start selected tasks"}
          </button>
        </div>
      </Modal>
      <Modal
        open={inspect}
        onClose={() => {
          if (!busy) setInspect(false);
        }}
        titleId="orchestration-inspect-title"
        className="batch-dialog"
      >
        <h2 id="orchestration-inspect-title">
          {pl ? "Przerwana kolejka" : "Interrupted queue"}
        </h2>
        <p className="helper">
          {pl
            ? "Aktywny krok został oznaczony jako przerwany i nie został powtórzony. Jego zapisany workspace sprawdzisz i wznowisz w wyniku zadania. Kontynuacja uruchomi tylko pozostałe zadania, które nadal czekają w kolejce."
            : "The active step was marked interrupted and was not replayed. Inspect and resume its saved workspace from the task result. Continuing only starts remaining tasks that are still queued."}
        </p>
        {state && (
          <ul className="batch-tasks">
            {state.taskIds.map((id) => {
              const task = tasks.find((t) => t.id === id);
              const done = state.completedTaskIds.includes(id);
              return (
                <li key={id}>
                  {task?.title ?? id}
                  <small>
                    {" · "}
                    {done
                      ? pl
                        ? "ukończone"
                        : "completed"
                      : task?.status === "queued"
                        ? pl
                          ? "w kolejce — zostanie uruchomione"
                          : "queued — will run"
                        : pl
                          ? `${task?.status ?? "brak"} — wymaga Twojej decyzji`
                          : `${task?.status ?? "missing"} — needs your decision`}
                  </small>
                </li>
              );
            })}
          </ul>
        )}
        <details>
          <summary>{pl ? "Dziennik zdarzeń" : "Event log"}</summary>
          <ol className="batch-events">
            {events.map((e) => (
              <li key={e.seq}>
                {new Date(e.at).toLocaleString()} · {e.kind}
                {e.reason ? ` · ${e.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
        {error && (
          <p role="alert">
            {pl
              ? "Nie można kontynuować. Sprawdź połączenia agentów i czy zadania nadal są w kolejce."
              : "Could not continue. Check agent connections and that tasks are still queued."}
          </p>
        )}
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setInspect(false)}
          >
            {pl ? "Zamknij" : "Close"}
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !state?.id ||
              !state.taskIds.some(
                (id) =>
                  !state.completedTaskIds.includes(id) &&
                  tasks.find((t) => t.id === id)?.status === "queued",
              )
            }
            onClick={() => {
              if (!state?.id || !api.orchestrationResume) return;
              setBusy(true);
              setError(false);
              void api
                .orchestrationResume({
                  projectId,
                  batchId: state.id,
                  consent: true,
                })
                .then((s) => {
                  setState(s);
                  setInspect(false);
                  onChanged();
                })
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Kontynuuj pozostałe zadania" : "Continue remaining tasks"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

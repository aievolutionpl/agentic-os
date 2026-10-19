import React, { useEffect, useState } from "react";
import type { Task, Memory, OrchestrationState } from "../shared";
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [contextIds, setContextIds] = useState<string[]>([]),
    [taskIds, setTaskIds] = useState<string[]>([]);
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
      }
    : {
        idle: "Ready",
        running: "Running",
        blocked: "Decision needed",
        completed: "Completed",
        stopped: "Stopped",
        failed: "Run failed",
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
            {state.status === "blocked" &&
              (pl
                ? " · Otwórz wynik zadania, aby przejrzeć i zatwierdzić zmiany."
                : " · Open the task result to review and approve changes.")}
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
      )}
      {error && !open && (
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
                    (!contextIds.includes(entry.id) && contextIds.length >= 20)
                  }
                  checked={contextIds.includes(entry.id)}
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
                  </small>
                </span>
              </label>
            ))
          ) : (
            <p>{pl ? "Brak wpisów pamięci." : "No memory entries."}</p>
          )}
        </fieldset>
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
    </section>
  );
}

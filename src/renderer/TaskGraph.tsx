import React from "react";
import type { OrchestrationState, Task } from "../shared";
import { agentName } from "./ui";

const COL = 232,
  ROW = 92,
  NODE_W = 200,
  NODE_H = 68;

const STATUS: Record<Task["status"], [string, string]> = {
  draft: ["Szkic", "Draft"],
  queued: ["W kolejce", "Queued"],
  running: ["Pracuje", "Running"],
  completed: ["Gotowe", "Done"],
  failed: ["Błąd", "Failed"],
  cancelled: ["Anulowane", "Cancelled"],
};

/** Depth of each task in its dependency graph; a cycle never loops forever. */
export function layers(tasks: Task[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (path.has(id)) return 0;
    path.add(id);
    const deps = (byId.get(id)?.dependencies ?? []).filter((d) => byId.has(d));
    const d = deps.length
      ? 1 + Math.max(...deps.map((dep) => visit(dep, path)))
      : 0;
    path.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const t of tasks) visit(t.id, new Set());
  const columns: Task[][] = [];
  for (const t of tasks) (columns[depth.get(t.id)!] ??= []).push(t);
  // Dense through the deepest column: a cycle can leave a lower one empty.
  return Array.from({ length: columns.length }, (_, i) => columns[i] ?? []);
}

/**
 * The project's tasks as a dependency graph: what runs first, what waits for
 * what, and where the current team batch is. Read-only; actions stay on the
 * task cards.
 */
export function TaskGraph({
  tasks,
  batch,
  language,
}: {
  tasks: Task[];
  batch: OrchestrationState | null;
  language: "pl" | "en";
}) {
  const pl = language === "pl";
  // Only tasks that take part in a dependency: unrelated ones stay on the
  // task board. A cancelled prerequisite still blocks, so it stays visible.
  const live = tasks.filter((t) => t.status !== "cancelled");
  const linked = new Set(
    live.flatMap((t) =>
      t.dependencies.length ? [t.id, ...t.dependencies] : [],
    ),
  );
  const shown = tasks.filter((t) => linked.has(t.id));
  if (!shown.length) return null;
  const columns = layers(shown);
  const at = new Map<string, { x: number; y: number }>();
  columns.forEach((col, c) =>
    col.forEach((t, r) => at.set(t.id, { x: c * COL, y: r * ROW })),
  );
  const width = (columns.length - 1) * COL + NODE_W,
    height = Math.max(...columns.map((c) => c.length)) * ROW - (ROW - NODE_H);
  // Only a batch that is working or waiting on the operator is current. A
  // batch stopped on unmet dependencies can never continue, so it is not.
  const current =
    !!batch &&
    ["running", "blocked", "interrupted"].includes(batch.status) &&
    batch.reason !== "DEPENDENCIES_OR_APPROVAL";
  const inBatch = new Set(current ? batch!.taskIds : []);
  // The batch reports progress before the task list is reloaded.
  const done = new Set(current ? batch!.completedTaskIds : []);
  // In the current batch only the batch's own progress counts: a task marked
  // completed with its result still awaiting review or approval does not yet
  // let its dependents run.
  const finished = (t: Task) =>
    inBatch.has(t.id) ? done.has(t.id) : t.status === "completed";
  const awaiting = (t: Task) =>
    inBatch.has(t.id) && !done.has(t.id) && t.status === "completed";
  const label = (t: Task) =>
    awaiting(t)
      ? pl
        ? "Czeka na zatwierdzenie"
        : "Awaiting approval"
      : STATUS[finished(t) ? "completed" : t.status][pl ? 0 : 1];
  return (
    <section
      className="task-graph"
      aria-label={pl ? "Graf zależności zadań" : "Task dependency graph"}
    >
      <header>
        <strong>{pl ? "Graf zadań" : "Task graph"}</strong>
        <span>
          {pl
            ? "Kolumny od lewej: co może ruszyć od razu, a co czeka na wcześniejsze zadania."
            : "Columns from the left: what can start now and what waits for earlier tasks."}
        </span>
      </header>
      <div className="task-graph-scroll">
        <div className="task-graph-canvas" style={{ width, height }}>
          <svg width={width} height={height} aria-hidden="true">
            {shown.flatMap((t) =>
              t.dependencies
                .filter((d) => at.has(d))
                .map((d) => {
                  const from = at.get(d)!,
                    to = at.get(t.id)!;
                  const x1 = from.x + NODE_W,
                    y1 = from.y + NODE_H / 2,
                    x2 = to.x,
                    y2 = to.y + NODE_H / 2;
                  const mid = (x1 + x2) / 2;
                  return (
                    <path
                      key={`${d}-${t.id}`}
                      className={`task-graph-edge ${
                        finished(shown.find((x) => x.id === d)!)
                          ? "satisfied"
                          : ""
                      }`}
                      d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                    />
                  );
                }),
            )}
          </svg>
          <ol>
            {columns.flat().map((t) => {
              const p = at.get(t.id)!;
              return (
                <li
                  key={t.id}
                  className={`task-node status-${
                    awaiting(t)
                      ? "awaiting"
                      : finished(t)
                        ? "completed"
                        : t.status
                  } ${inBatch.has(t.id) ? "in-batch" : ""}`}
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                  data-task-node={t.id}
                >
                  <strong title={t.title}>{t.title}</strong>
                  <span>
                    {agentName(t.implementer)} → {agentName(t.reviewer)}
                  </span>
                  <small>
                    {label(t)}
                    {inBatch.has(t.id) &&
                      (done.has(t.id)
                        ? pl
                          ? " · ukończone w kolejce"
                          : " · finished in queue"
                        : pl
                          ? " · w kolejce zespołu"
                          : " · in the team queue")}
                    {!!t.blockedBy.length &&
                      (pl ? " · zablokowane" : " · blocked")}
                  </small>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="sr-only">
        {shown
          .filter((t) => t.dependencies.length)
          .map((t) => {
            const name = (d: string) =>
              shown.find((x) => x.id === d)?.title ?? d;
            const prereqs = t.dependencies.filter((d) =>
              shown.some((x) => x.id === d),
            );
            const waiting = prereqs.filter(
              (d) => !finished(shown.find((x) => x.id === d)!),
            );
            const met = prereqs.filter((d) => !waiting.includes(d));
            return [
              waiting.length &&
                `${t.title} ${pl ? "czeka na" : "waits for"} ${waiting.map(name).join(", ")}`,
              met.length &&
                `${t.title}: ${pl ? "spełnione" : "satisfied"} ${met.map(name).join(", ")}`,
            ]
              .filter(Boolean)
              .join(". ");
          })
          .join(". ")}
      </p>
    </section>
  );
}

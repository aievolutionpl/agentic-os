import type { Store } from "./store.js";
import type { WorkBoard } from "../shared.js";

/** A projection of durable tasks and actual runs. Moving a card never starts a process. */
export function workBoard(store: Store): WorkBoard {
  const latest = new Map(
    store.runs.latestPerTask(100000).map((run) => [run.taskId, run]),
  );
  const cards: WorkBoard["cards"] = [];
  for (const project of store.projects())
    for (const task of store.tasks(project.id)) {
      const run = latest.get(task.id);
      const active =
        !!run &&
        ["preparing", "running", "reviewing", "applying"].includes(run.state);
      const queued = !active && ["draft", "queued"].includes(task.status);
      const stage = active
        ? "working"
        : queued
          ? "queue"
          : run &&
              [
                "awaiting_review",
                "interrupted",
                "apply_uncertain",
                "failed",
              ].includes(run.state)
            ? "waiting"
            : task.status === "failed"
              ? "waiting"
              : task.status === "completed" ||
                  task.status === "cancelled" ||
                  (run &&
                    ["completed", "applied", "rejected", "cancelled"].includes(
                      run.state,
                    ))
                ? "done"
                : "waiting";
      const event = run
        ? store.runs.events(project.id, run.id).at(-1)
        : undefined;
      cards.push({
        id: task.id,
        projectId: project.id,
        projectName: project.name,
        title: task.title,
        agent: run?.state === "reviewing" ? task.reviewer : task.implementer,
        stage,
        state: queued ? task.status : (run?.state ?? task.status),
        activity: queued ? "" : (event?.text.slice(0, 240) ?? ""),
        blockedBy: task.blockedBy.length,
        at: event?.at ?? run?.updatedAt ?? Date.parse(task.createdAt),
      });
    }
  return {
    observedAt: new Date().toISOString(),
    cards: cards.sort((a, b) => b.at - a.at),
    conversations: store.chats
      .list()
      .filter((c) => c.status === "running")
      .map((c) => ({
        id: c.id,
        title: c.title,
        agent: c.agent,
        projectId: c.projectId,
        activity: c.activity.at(-1)?.slice(0, 240) ?? "",
      })),
  };
}

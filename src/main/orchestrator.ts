import type { Store } from "./store.js";
import type { Supervisor } from "./supervisor.js";
import type { OrchestrationState } from "../shared.js";
import { exact, text } from "./validate.js";

/** A finite, explicitly launched queue. No replay, automatic approvals, or hidden retries. */
export class Orchestrator {
  private batches = new Map<string, OrchestrationState>();
  private closed = false;
  constructor(
    private store: Store,
    private supervisor: Supervisor,
  ) {}
  state(input: unknown): OrchestrationState {
    const p = exact(input, ["projectId"]),
      projectId = text(p.projectId);
    this.store.tasks(projectId);
    return {
      ...(this.batches.get(projectId) ?? {
        projectId,
        status: "idle",
        taskIds: [],
        finished: 0,
        runId: null,
        reason: null,
      }),
    };
  }
  start(input: unknown): OrchestrationState {
    const p = exact(input, ["projectId", "taskIds", "contextIds", "consent"]),
      projectId = text(p.projectId);
    if (p.consent !== true || this.closed)
      throw Error("EXPLICIT_CONSENT_REQUIRED");
    if (this.batches.get(projectId)?.status === "running")
      throw Error("BATCH_ALREADY_RUNNING");
    if (
      this.store.missions
        .list(projectId)
        .some((m) => ["planning", "running", "evaluating"].includes(m.status))
    )
      throw Error("MISSION_ALREADY_ACTIVE");
    if (
      !Array.isArray(p.taskIds) ||
      !p.taskIds.length ||
      p.taskIds.length > 10 ||
      new Set(p.taskIds).size !== p.taskIds.length
    )
      throw Error("INVALID_TASK_SELECTION");
    const taskIds = p.taskIds.map((id) => text(id)),
      tasks = this.store.tasks(projectId);
    for (const id of taskIds) {
      const task = tasks.find((t) => t.id === id);
      if (!task || task.status !== "queued") throw Error("TASK_NOT_QUEUED");
      if (
        !this.supervisor.settings().find((s) => s.id === task.implementer)
          ?.configured
      )
        throw Error("PROVIDER_NOT_CONFIGURED");
    }
    const context = this.store.knowledge.build(
      projectId,
      p.contextIds ?? [],
      "implementation",
      this.store.extensions.skills(projectId, ["builtin:teamwork"]),
    );
    const batch: OrchestrationState = {
      projectId,
      status: "running",
      taskIds,
      finished: 0,
      runId: null,
      reason: null,
    };
    this.batches.set(projectId, batch);
    void this.execute(batch, context);
    return { ...batch };
  }
  private async execute(
    batch: OrchestrationState,
    context: ReturnType<Store["knowledge"]["build"]>,
  ) {
    const pending = new Set(batch.taskIds);
    try {
      while (pending.size && batch.status === "running" && !this.closed) {
        const tasks = this.store.tasks(batch.projectId);
        const next = tasks.find(
          (t) =>
            pending.has(t.id) &&
            t.status === "queued" &&
            !t.blockedBy.length &&
            t.dependencies.every((id) => {
              const run = this.store.runs.list(batch.projectId, id)[0];
              return !run || ["completed", "applied"].includes(run.state);
            }),
        );
        if (!next) {
          batch.status = "blocked";
          batch.reason = "DEPENDENCIES_OR_APPROVAL";
          break;
        }
        const run = await this.supervisor.start(
          {
            projectId: batch.projectId,
            taskId: next.id,
            contextIds: context.memoryIds,
            consent: true,
          },
          context,
        );
        batch.runId = run.id;
        if (batch.status !== "running" || this.closed)
          await this.supervisor.action({
            projectId: batch.projectId,
            runId: run.id,
            action: "cancel",
          });
        await this.supervisor.waitForRun(run.id);
        if (batch.status !== "running" || this.closed) break;
        let result = this.store.runs.get(batch.projectId, run.id)!;
        if (result.state === "awaiting_review") {
          if (
            this.supervisor.settings().find((s) => s.id === result.reviewer)
              ?.configured
          ) {
            await this.supervisor.review({
              projectId: batch.projectId,
              runId: run.id,
              consent: true,
            });
            await this.supervisor.waitForRun(run.id);
          }
          if (batch.status !== "running" || this.closed) break;
          batch.finished++;
          batch.status = "blocked";
          batch.reason = "HUMAN_APPROVAL_REQUIRED";
          break;
        }
        if (result.state !== "completed") {
          batch.status = "failed";
          batch.reason = "RUN_FAILED";
          break;
        }
        pending.delete(next.id);
        batch.finished++;
        batch.runId = null;
      }
      if (batch.status === "running")
        batch.status = this.closed ? "stopped" : "completed";
    } catch {
      if (batch.status === "running") {
        batch.status = "failed";
        batch.reason = "DISPATCH_FAILED";
      }
    }
  }
  async stop(input: unknown) {
    const state = this.state(input),
      batch = this.batches.get(state.projectId);
    if (!batch || batch.status !== "running") return;
    batch.status = "stopped";
    if (batch.runId) {
      const run = this.store.runs.get(batch.projectId, batch.runId);
      if (run && ["preparing", "running", "reviewing"].includes(run.state))
        await this.supervisor.action({
          projectId: batch.projectId,
          runId: batch.runId,
          action: "cancel",
        });
    }
  }
  close() {
    this.closed = true;
    for (const batch of this.batches.values())
      if (batch.status === "running") batch.status = "stopped";
  }
}

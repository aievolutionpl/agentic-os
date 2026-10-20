import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type { Supervisor } from "./supervisor.js";
import type { BatchContext } from "./batches.js";
import type { OrchestrationEvent, OrchestrationState } from "../shared.js";
import { exact, text } from "./validate.js";

/** A finite, explicitly launched queue. No replay, automatic approvals, or hidden retries. */
export class Orchestrator {
  /** Live references for batches this process is executing; SQLite is the source of truth. */
  private live = new Map<string, OrchestrationState>();
  private closed = false;
  constructor(
    private store: Store,
    private supervisor: Supervisor,
  ) {
    // Runs were already marked interrupted by the supervisor; batches follow without replay.
    store.batches.recover();
  }
  state(input: unknown): OrchestrationState {
    const p = exact(input, ["projectId"]),
      projectId = text(p.projectId);
    this.store.tasks(projectId);
    return {
      ...(this.live.get(projectId) ??
        this.store.batches.latest(projectId) ?? {
          id: null,
          projectId,
          status: "idle",
          taskIds: [],
          completedTaskIds: [],
          finished: 0,
          runId: null,
          reason: null,
          createdAt: null,
          updatedAt: null,
        }),
    };
  }
  events(input: unknown): OrchestrationEvent[] {
    const state = this.state(input);
    return state.id ? this.store.batches.events(state.projectId, state.id) : [];
  }
  private guard(projectId: string) {
    if (this.live.get(projectId)?.status === "running")
      throw Error("BATCH_ALREADY_RUNNING");
    if (
      this.store.missions
        .list(projectId)
        .some((m) => ["planning", "running", "evaluating"].includes(m.status))
    )
      throw Error("MISSION_ALREADY_ACTIVE");
  }
  private providers(taskIds: string[], projectId: string) {
    const tasks = this.store.tasks(projectId);
    for (const id of taskIds) {
      const task = tasks.find((t) => t.id === id);
      if (!task || task.status !== "queued") throw Error("TASK_NOT_QUEUED");
      if (
        !this.supervisor.settings().find((s) => s.id === task.implementer)
          ?.configured
      )
        throw Error("PROVIDER_NOT_CONFIGURED");
    }
  }
  start(input: unknown): OrchestrationState {
    const p = exact(input, [
        "projectId",
        "taskIds",
        "contextIds",
        "consent",
        "parallel",
      ]),
      projectId = text(p.projectId);
    if (p.consent !== true || this.closed)
      throw Error("EXPLICIT_CONSENT_REQUIRED");
    this.guard(projectId);
    if (
      !Array.isArray(p.taskIds) ||
      !p.taskIds.length ||
      p.taskIds.length > 10 ||
      new Set(p.taskIds).size !== p.taskIds.length
    )
      throw Error("INVALID_TASK_SELECTION");
    if (p.parallel !== undefined && typeof p.parallel !== "boolean")
      throw Error("INVALID_INPUT");
    const taskIds = p.taskIds.map((id) => text(id));
    this.providers(taskIds, projectId);
    const context = this.store.knowledge.build(
      projectId,
      p.contextIds ?? [],
      "implementation",
      this.store.extensions.skills(projectId, ["builtin:teamwork"]),
    );
    const now = Date.now();
    const batch: OrchestrationState = {
      id: randomUUID(),
      projectId,
      status: "running",
      taskIds,
      completedTaskIds: [],
      finished: 0,
      runId: null,
      ...(p.parallel === true && { parallel: true, runIds: [] }),
      reason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.batches.create(batch, context);
    this.live.set(projectId, batch);
    void this.execute(batch, context);
    return { ...batch };
  }
  /** Explicit continuation of an interrupted batch. Only still-queued, unfinished tasks run. */
  resume(input: unknown): OrchestrationState {
    const p = exact(input, ["projectId", "batchId", "consent"]),
      projectId = text(p.projectId),
      batchId = text(p.batchId);
    if (p.consent !== true || this.closed)
      throw Error("EXPLICIT_CONSENT_REQUIRED");
    this.guard(projectId);
    const batch = this.store.batches.latest(projectId);
    if (!batch || batch.id !== batchId) throw Error("BATCH_NOT_FOUND");
    if (batch.status !== "interrupted") throw Error("BATCH_NOT_INTERRUPTED");
    const tasks = this.store.tasks(projectId),
      remaining = batch.taskIds.filter(
        (id) =>
          !batch.completedTaskIds.includes(id) &&
          tasks.find((t) => t.id === id)?.status === "queued",
      );
    if (!remaining.length) throw Error("NOTHING_TO_RESUME");
    this.providers(remaining, projectId);
    const context = this.store.batches.context(projectId, batchId);
    batch.status = "running";
    batch.reason = null;
    batch.runId = null;
    if (batch.parallel) batch.runIds = [];
    this.store.batches.save(batch, "resumed");
    this.live.set(projectId, batch);
    void this.execute(batch, context, remaining);
    return { ...batch };
  }
  private save(
    batch: OrchestrationState,
    kind: OrchestrationEvent["kind"],
    taskId: string | null = null,
  ) {
    // After close() the database may already be shut; the journal keeps the last durable state.
    if (!this.closed) this.store.batches.save(batch, kind, taskId);
  }
  /** Files a captured diff touches, from its `diff --git a/... b/...` headers. */
  private changedFiles(projectId: string, taskId: string, runId: string) {
    const run = this.store.runs.get(projectId, runId);
    if (!run?.artifactId) return new Set<string>();
    const artifact = this.store.artifacts.get(
      projectId,
      taskId,
      run.artifactId,
    );
    const files = new Set<string>();
    for (const m of (artifact?.diff.toString("utf8") ?? "").matchAll(
      /^diff --git a\/(.+?) b\/(.+)$/gm,
    ))
      files.add(m[1]!).add(m[2]!);
    return files;
  }
  /** One task from dispatch to its outcome; reviews run as before. */
  private async follow(
    batch: OrchestrationState,
    taskId: string,
    runId: string,
  ): Promise<"completed" | "approval" | "failed" | "halted"> {
    await this.supervisor.waitForRun(runId);
    if (batch.status !== "running" || this.closed) return "halted";
    const result = this.store.runs.get(batch.projectId, runId)!;
    if (result.state === "awaiting_review") {
      if (
        this.supervisor.settings().find((s) => s.id === result.reviewer)
          ?.configured
      ) {
        this.save(batch, "reviewing", taskId);
        await this.supervisor.review({
          projectId: batch.projectId,
          runId,
          consent: true,
        });
        await this.supervisor.waitForRun(runId);
      }
      if (batch.status !== "running" || this.closed) return "halted";
      return "approval";
    }
    return result.state === "completed" ? "completed" : "failed";
  }
  private async execute(
    batch: OrchestrationState,
    context: BatchContext,
    taskIds = batch.taskIds,
  ) {
    const pending = new Set(taskIds);
    // Independent tasks may run side by side, each in its own worktree. A
    // sequential batch (the default) keeps the original one-at-a-time order.
    const limit = batch.parallel ? 2 : 1;
    const active = new Map<
      string,
      Promise<[string, string, Awaited<ReturnType<Orchestrator["follow"]>>]>
    >();
    const awaitingApproval = new Map<string, Set<string>>();
    let hold: {
      status: "blocked" | "failed";
      reason: string;
      taskId: string;
    } | null = null;
    try {
      while (batch.status === "running" && !this.closed) {
        while (!hold && active.size < limit) {
          const tasks = this.store.tasks(batch.projectId);
          const next = tasks.find(
            (t) =>
              pending.has(t.id) &&
              !active.has(t.id) &&
              t.status === "queued" &&
              !t.blockedBy.length &&
              t.dependencies.every((id) => {
                const run = this.store.runs.list(batch.projectId, id)[0];
                return !run || ["completed", "applied"].includes(run.state);
              }),
          );
          if (!next) break;
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
          batch.runIds = [...(batch.runIds ?? []), run.id];
          this.save(batch, "dispatched", next.id);
          if (batch.status !== "running" || this.closed)
            await this.supervisor.action({
              projectId: batch.projectId,
              runId: run.id,
              action: "cancel",
            });
          active.set(
            next.id,
            this.follow(batch, next.id, run.id).then((o) => [
              next.id,
              run.id,
              o,
            ]),
          );
        }
        if (!active.size) {
          if (!hold && pending.size) {
            batch.status = "blocked";
            batch.reason = "DEPENDENCIES_OR_APPROVAL";
            this.save(batch, "blocked");
          }
          break;
        }
        const [taskId, runId, outcome] = await Promise.race(active.values());
        active.delete(taskId);
        batch.runIds = (batch.runIds ?? []).filter((id) => id !== runId);
        if (outcome === "halted") continue;
        if (outcome === "completed") {
          pending.delete(taskId);
          batch.completedTaskIds.push(taskId);
          batch.finished++;
          if (!batch.runIds.length) batch.runId = null;
          this.save(batch, "task_completed", taskId);
          continue;
        }
        if (outcome === "approval") {
          batch.finished++;
          // Two changes waiting for approval must not touch the same file:
          // the second would overwrite or conflict with the first.
          const files = this.changedFiles(batch.projectId, taskId, runId);
          const clash = [...awaitingApproval.values()].some((other) =>
            [...files].some((f) => other.has(f)),
          );
          awaitingApproval.set(taskId, files);
          if (clash)
            hold = { status: "blocked", reason: "FILE_CONFLICT", taskId };
          else
            hold ??= {
              status: "blocked",
              reason: "HUMAN_APPROVAL_REQUIRED",
              taskId,
            };
          continue;
        }
        hold = { status: "failed", reason: "RUN_FAILED", taskId };
      }
      if (hold && batch.status === "running" && !this.closed) {
        batch.status = hold.status;
        batch.reason = hold.reason;
        this.save(batch, hold.status, hold.taskId);
      } else if (batch.status === "running" && !this.closed) {
        batch.status = "completed";
        this.save(batch, "completed");
      }
    } catch {
      if (batch.status === "running" && !this.closed) {
        batch.status = "failed";
        batch.reason = "DISPATCH_FAILED";
        this.save(batch, "failed");
      }
    } finally {
      if (this.live.get(batch.projectId) === batch && !this.closed)
        this.live.delete(batch.projectId);
    }
  }
  async stop(input: unknown) {
    const state = this.state(input),
      batch = this.live.get(state.projectId);
    if (!batch || batch.status !== "running") return;
    batch.status = "stopped";
    batch.reason = "USER_STOPPED";
    this.save(batch, "stopped");
    for (const runId of new Set(
      [batch.runId, ...(batch.runIds ?? [])].filter(Boolean) as string[],
    )) {
      const run = this.store.runs.get(batch.projectId, runId);
      if (run && ["preparing", "running", "reviewing"].includes(run.state))
        await this.supervisor.action({
          projectId: batch.projectId,
          runId,
          action: "cancel",
        });
    }
  }
  /** App shutdown: persist running batches as interrupted so the operator can inspect them. */
  close() {
    if (this.closed) return;
    for (const batch of this.live.values())
      if (batch.status === "running") {
        batch.status = "interrupted";
        batch.reason = "APP_CLOSED";
        this.store.batches.save(batch, "interrupted");
      }
    this.closed = true;
  }
}

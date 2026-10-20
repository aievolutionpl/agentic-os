import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type { Supervisor } from "./supervisor.js";
import type { BatchContext } from "./batches.js";
import type {
  Agent,
  OrchestrationEvent,
  OrchestrationState,
} from "../shared.js";
import { exact, text } from "./validate.js";
import { diffFiles } from "./diff-files.js";

type PolicyStep = { taskId: string; agent: Agent; runId?: string };
/** How one task's run ended for the queue. */
type Outcome =
  | {
      kind:
        | "completed"
        | "approval"
        | "review_failed"
        | "failed"
        | "halted"
        | "error";
    }
  | { kind: "policy"; code: string; step: PolicyStep };
/** A reason the queue stops dispatching; the most serious one wins. */
type Hold = {
  status: "blocked" | "failed";
  reason: string;
  taskId: string | null;
  runId: string | null;
  agent?: Agent;
  rank: number;
};
/** Run states a resumed batch settles before dispatching more work; a
 * completed run of an open task (finished by hand) is counted, not lost. */
const UNSETTLED = [
  "preparing",
  "running",
  "reviewing",
  "awaiting_review",
  "completed",
];

/** Blocked batches the operator can continue: a policy refusal or a review
 * that did not finish. */
function onHold(batch: OrchestrationState) {
  return (
    batch.status === "blocked" &&
    (!!batch.reason?.startsWith("POLICY_") || batch.reason === "REVIEW_FAILED")
  );
}

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
  /** While a batch runs or is held (policy refusal or failed review), its
   * open tasks belong to it: starting, reviewing, deciding or changing one by
   * hand would race the queue. They move through the queue, Stop, Continue or
   * Abandon. The queue's own calls go straight to the supervisor. */
  held(projectId: string, taskId: string) {
    const live = this.live.get(projectId);
    const batch =
      live?.status === "running" ? live : this.store.batches.latest(projectId);
    return (
      !!batch &&
      (batch === live || onHold(batch)) &&
      batch.taskIds.includes(taskId) &&
      !batch.completedTaskIds.includes(taskId)
    );
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
    if (p.parallel !== undefined && typeof p.parallel !== "boolean")
      throw Error("INVALID_INPUT");
    this.guard(projectId);
    const latest = this.store.batches.latest(projectId);
    // A held batch keeps its progress until it is resumed or abandoned.
    if (latest && onHold(latest)) throw Error("BATCH_ON_HOLD");
    if (
      !Array.isArray(p.taskIds) ||
      !p.taskIds.length ||
      p.taskIds.length > 10 ||
      new Set(p.taskIds).size !== p.taskIds.length
    )
      throw Error("INVALID_TASK_SELECTION");
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
      reason: null,
      createdAt: now,
      updatedAt: now,
      ...(p.parallel === true && { parallel: true, runIds: [] }),
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
    if (batch.status !== "interrupted" && !onHold(batch))
      throw Error("BATCH_NOT_INTERRUPTED");
    // The run the queue itself had in flight (persisted in runId) is settled
    // first from its stored state: reviewed, or handed to a human decision.
    // An interrupted implementation is never replayed.
    const open = batch.taskIds.filter(
      (id) => !batch.completedTaskIds.includes(id),
    );
    // A parallel batch can have several runs in flight (runIds).
    const held = [
      ...new Set(
        [batch.runId, ...(batch.runIds ?? [])].filter(Boolean) as string[],
      ),
    ]
      .map((id) => this.store.runs.get(projectId, id))
      .filter(
        (run) =>
          !!run && open.includes(run.taskId) && UNSETTLED.includes(run.state),
      ) as NonNullable<ReturnType<Store["runs"]["get"]>>[];
    const tasks = this.store.tasks(projectId),
      remaining = open.filter(
        (id) =>
          !held.some((run) => run.taskId === id) &&
          tasks.find((t) => t.id === id)?.status === "queued",
      );
    if (!remaining.length && !held.length) throw Error("NOTHING_TO_RESUME");
    this.providers(remaining, projectId);
    const context = this.store.batches.context(projectId, batchId);
    batch.status = "running";
    batch.reason = null;
    batch.runId = null;
    if (batch.parallel) batch.runIds = [];
    delete batch.policyAgent;
    this.store.batches.save(batch, "resumed");
    this.live.set(projectId, batch);
    void this.execute(
      batch,
      context,
      remaining,
      held.map((run) => run.id),
    );
    return { ...batch };
  }
  private save(
    batch: OrchestrationState,
    kind: OrchestrationEvent["kind"],
    taskId: string | null = null,
    runId: string | null = batch.runId,
  ) {
    // After close() the database may already be shut; the journal keeps the last durable state.
    if (!this.closed) this.store.batches.save(batch, kind, taskId, runId);
  }
  /** Files a captured diff touches. */
  private changedFiles(projectId: string, taskId: string, runId: string) {
    const run = this.store.runs.get(projectId, runId);
    if (!run?.artifactId) return new Set<string>();
    const artifact = this.store.artifacts.get(
      projectId,
      taskId,
      run.artifactId,
    );
    return diffFiles(artifact?.diff.toString("utf8") ?? "");
  }
  private async execute(
    batch: OrchestrationState,
    context: BatchContext,
    taskIds = batch.taskIds,
    heldRunIds: string[] = [],
  ) {
    const pending = new Set(taskIds);
    const running = () => batch.status === "running" && !this.closed;
    // Independent tasks may run side by side, each in its own worktree. A
    // sequential batch (the default) keeps the one-at-a-time order.
    const limit = batch.parallel ? 2 : 1;
    const active = new Map<string, Promise<[string, string, Outcome]>>();
    const awaitingApproval = new Map<string, Set<string>>();
    let hold: Hold | null = null;
    const halt = (next: Omit<Hold, "rank">) => {
      const rank =
        {
          HUMAN_APPROVAL_REQUIRED: 0,
          FILE_CONFLICT: 1,
          RUN_FAILED: 3,
          DISPATCH_FAILED: 4,
        }[next.reason] ?? 2;
      if (!hold || rank > hold.rank) hold = { ...next, rank };
    };
    const track = (taskId: string, runId: string) => {
      batch.runId = runId;
      if (batch.parallel)
        batch.runIds = [
          ...(batch.runIds ?? []).filter((id) => id !== runId),
          runId,
        ];
      active.set(
        taskId,
        // A failure is an outcome, never a rejection left unobserved while
        // another run is still being raced.
        this.settle(batch, taskId, runId).then(
          (o): [string, string, Outcome] => [taskId, runId, o],
          (): [string, string, Outcome] => [taskId, runId, { kind: "error" }],
        ),
      );
    };
    try {
      for (const id of heldRunIds) {
        const held = this.store.runs.get(batch.projectId, id)!;
        pending.delete(held.taskId);
        track(held.taskId, held.id);
      }
      // Results of this batch still waiting for a human decision keep
      // counting for file conflicts after Continue.
      if (batch.parallel)
        for (const id of batch.taskIds) {
          const run = this.store.runs.list(batch.projectId, id)[0];
          if (
            run?.state === "awaiting_review" &&
            !heldRunIds.includes(run.id) &&
            !batch.completedTaskIds.includes(id)
          )
            awaitingApproval.set(
              id,
              this.changedFiles(batch.projectId, id, run.id),
            );
        }
      while (running()) {
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
          let run;
          try {
            run = await this.supervisor.start(
              {
                projectId: batch.projectId,
                taskId: next.id,
                contextIds: context.memoryIds,
                consent: true,
              },
              context,
            );
          } catch (e) {
            const code = e instanceof Error ? e.message : "";
            // A refusal is a decision for the operator, any other error
            // fails the batch; either way runs already in flight finish
            // (and stay stoppable) before the batch is finalized.
            halt(
              code.startsWith("POLICY_")
                ? {
                    status: "blocked",
                    reason: code,
                    taskId: next.id,
                    runId: null,
                    agent: next.implementer,
                  }
                : {
                    status: "failed",
                    reason: "DISPATCH_FAILED",
                    taskId: next.id,
                    runId: null,
                  },
            );
            break;
          }
          pending.delete(next.id);
          track(next.id, run.id);
          this.save(batch, "dispatched", next.id, run.id);
          if (!running())
            await this.supervisor.action({
              projectId: batch.projectId,
              runId: run.id,
              action: "cancel",
            });
        }
        if (!active.size) {
          if (!hold && pending.size && running()) {
            batch.status = "blocked";
            batch.reason = "DEPENDENCIES_OR_APPROVAL";
            this.save(batch, "blocked");
          }
          break;
        }
        const [taskId, runId, outcome] = await Promise.race(active.values());
        active.delete(taskId);
        if (batch.parallel)
          batch.runIds = (batch.runIds ?? []).filter((id) => id !== runId);
        switch (outcome.kind) {
          case "halted":
            break;
          case "completed":
            batch.completedTaskIds.push(taskId);
            batch.finished++;
            if (batch.runId === runId) batch.runId = null;
            this.save(batch, "task_completed", taskId, runId);
            break;
          case "approval": {
            batch.finished++;
            // Two changes waiting for approval must not touch the same file:
            // the second would overwrite or conflict with the first.
            const files = this.changedFiles(batch.projectId, taskId, runId);
            const clash = [...awaitingApproval.values()].some((other) =>
              [...files].some((f) => other.has(f)),
            );
            awaitingApproval.set(taskId, files);
            halt({
              status: "blocked",
              reason: clash ? "FILE_CONFLICT" : "HUMAN_APPROVAL_REQUIRED",
              taskId,
              runId,
            });
            break;
          }
          case "review_failed":
            halt({ status: "blocked", reason: "REVIEW_FAILED", taskId, runId });
            break;
          case "policy":
            // A refused review keeps its run so resume can settle it.
            halt({
              status: "blocked",
              reason: outcome.code,
              taskId,
              runId: outcome.step.runId ?? null,
              agent: outcome.step.agent,
            });
            break;
          case "failed":
            halt({ status: "failed", reason: "RUN_FAILED", taskId, runId });
            break;
          case "error":
            halt({
              status: "failed",
              reason: "DISPATCH_FAILED",
              taskId,
              runId: null,
            });
        }
      }
      const final = hold as Hold | null;
      if (final && running()) {
        batch.status = final.status;
        batch.reason = final.reason;
        batch.runId = final.runId;
        if (final.agent) batch.policyAgent = final.agent;
        this.save(batch, final.status, final.taskId);
      } else if (running()) {
        batch.status = "completed";
        this.save(batch, "completed");
      }
    } catch {
      if (running()) {
        batch.status = "failed";
        batch.reason = "DISPATCH_FAILED";
        this.save(batch, "failed");
      }
    } finally {
      if (this.live.get(batch.projectId) === batch && !this.closed)
        this.live.delete(batch.projectId);
    }
  }
  /** Takes one task's run to its outcome from the stored state: waits for it
   * and reviews a result that has no completed review. The caller decides
   * what the outcome means for the batch. */
  private async settle(
    batch: OrchestrationState,
    taskId: string,
    runId: string,
  ): Promise<Outcome> {
    const running = () => batch.status === "running" && !this.closed;
    const wasReviewing =
      this.store.runs.get(batch.projectId, runId)?.state === "reviewing";
    await this.supervisor.waitForRun(runId);
    if (!running()) return { kind: "halted" };
    let result = this.store.runs.get(batch.projectId, runId)!;
    if (result.state === "awaiting_review") {
      const reviewer = this.supervisor
        .settings()
        .find((s) => s.id === result.reviewer)?.configured;
      if (reviewer && result.reviewState !== "completed") {
        // A review that just failed under our watch is not retried silently.
        if (!wasReviewing) {
          this.save(batch, "reviewing", taskId);
          try {
            await this.supervisor.review({
              projectId: batch.projectId,
              runId,
              consent: true,
            });
          } catch (e) {
            const code = e instanceof Error ? e.message : "";
            if (!code.startsWith("POLICY_")) throw e;
            return {
              kind: "policy",
              code,
              step: { taskId, agent: result.reviewer, runId },
            };
          }
          if (!running()) {
            // Stop arrived while the policy gate was being checked.
            await this.supervisor
              .action({ projectId: batch.projectId, runId, action: "cancel" })
              .catch(() => {});
            return { kind: "halted" };
          }
          await this.supervisor.waitForRun(runId);
          if (!running()) return { kind: "halted" };
          result = this.store.runs.get(batch.projectId, runId)!;
        }
        if (result.reviewState !== "completed")
          return { kind: "review_failed" };
      }
      return { kind: "approval" };
    }
    return { kind: result.state === "completed" ? "completed" : "failed" };
  }
  async stop(input: unknown) {
    const state = this.state(input),
      batch = this.live.get(state.projectId);
    if (!batch && state.id && onHold(state)) {
      // Explicitly abandoning a held batch, so a new batch can start.
      const held = this.store.batches.latest(state.projectId)!;
      held.status = "stopped";
      held.reason = "USER_STOPPED";
      delete held.policyAgent;
      this.save(held, "stopped");
      return;
    }
    if (!batch || batch.status !== "running") return;
    batch.status = "stopped";
    batch.reason = "USER_STOPPED";
    this.save(batch, "stopped");
    // Every active run is signalled at once; one slow or failing
    // cancellation must not keep another provider running.
    const results = await Promise.allSettled(
      [
        ...new Set(
          [batch.runId, ...(batch.runIds ?? [])].filter(Boolean) as string[],
        ),
      ].map((runId) => {
        const run = this.store.runs.get(batch.projectId, runId);
        return run && ["preparing", "running", "reviewing"].includes(run.state)
          ? this.supervisor.action({
              projectId: batch.projectId,
              runId,
              action: "cancel",
            })
          : undefined;
      }),
    );
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw (failed as PromiseRejectedResult).reason;
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

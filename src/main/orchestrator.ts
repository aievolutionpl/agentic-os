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

type PolicyStep = { taskId: string; agent: Agent; runId?: string };
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
  /** While a batch is held (policy refusal or failed review), its open tasks
   * move only through Continue or Abandon: starting, reviewing or deciding
   * one by hand would race the queue's own reconciliation. */
  held(projectId: string, taskId: string) {
    if (this.live.get(projectId)) return false;
    const batch = this.store.batches.latest(projectId);
    return (
      !!batch &&
      onHold(batch) &&
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
    const p = exact(input, ["projectId", "taskIds", "contextIds", "consent"]),
      projectId = text(p.projectId);
    if (p.consent !== true || this.closed)
      throw Error("EXPLICIT_CONSENT_REQUIRED");
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
    const inFlight = batch.runId
      ? this.store.runs.get(projectId, batch.runId)
      : null;
    const held =
      inFlight &&
      open.includes(inFlight.taskId) &&
      UNSETTLED.includes(inFlight.state)
        ? inFlight
        : null;
    const tasks = this.store.tasks(projectId),
      remaining = open.filter(
        (id) =>
          id !== held?.taskId &&
          tasks.find((t) => t.id === id)?.status === "queued",
      );
    if (!remaining.length && !held) throw Error("NOTHING_TO_RESUME");
    this.providers(remaining, projectId);
    const context = this.store.batches.context(projectId, batchId);
    batch.status = "running";
    batch.reason = null;
    batch.runId = null;
    delete batch.policyAgent;
    this.store.batches.save(batch, "resumed");
    this.live.set(projectId, batch);
    void this.execute(batch, context, remaining, held?.id);
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
  private async execute(
    batch: OrchestrationState,
    context: BatchContext,
    taskIds = batch.taskIds,
    heldRunId?: string,
  ) {
    const pending = new Set(taskIds);
    // Which agent's start the policy gate may refuse right now.
    const step: { current: PolicyStep | null } = { current: null };
    try {
      let go = true;
      if (heldRunId) {
        const held = this.store.runs.get(batch.projectId, heldRunId)!;
        go = await this.settle(batch, held.taskId, held.id, step);
      }
      while (go && pending.size && batch.status === "running" && !this.closed) {
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
          this.save(batch, "blocked");
          break;
        }
        step.current = { taskId: next.id, agent: next.implementer };
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
        this.save(batch, "dispatched", next.id);
        if (batch.status !== "running" || this.closed)
          await this.supervisor.action({
            projectId: batch.projectId,
            runId: run.id,
            action: "cancel",
          });
        pending.delete(next.id);
        go = await this.settle(batch, next.id, run.id, step);
      }
      if (batch.status === "running" && !this.closed) {
        batch.status = "completed";
        this.save(batch, "completed");
      }
    } catch (e) {
      this.refused(batch, e, step.current);
    } finally {
      if (this.live.get(batch.projectId) === batch && !this.closed)
        this.live.delete(batch.projectId);
    }
  }
  /** Takes one task's run to its outcome from the stored state: waits for it,
   * reviews a result that has no completed review, and returns true only when
   * the task completed and the queue may continue. */
  private async settle(
    batch: OrchestrationState,
    taskId: string,
    runId: string,
    step: { current: PolicyStep | null },
  ) {
    const running = () => batch.status === "running" && !this.closed;
    // Stop must be able to cancel whatever this run is doing.
    batch.runId = runId;
    const wasReviewing =
      this.store.runs.get(batch.projectId, runId)?.state === "reviewing";
    await this.supervisor.waitForRun(runId);
    if (!running()) return false;
    let result = this.store.runs.get(batch.projectId, runId)!;
    if (result.state === "awaiting_review") {
      const reviewer = this.supervisor
        .settings()
        .find((s) => s.id === result.reviewer)?.configured;
      if (reviewer && result.reviewState !== "completed") {
        // A review that just failed under our watch is not retried silently.
        if (!wasReviewing) {
          this.save(batch, "reviewing", taskId);
          step.current = { taskId, agent: result.reviewer, runId };
          await this.supervisor.review({
            projectId: batch.projectId,
            runId,
            consent: true,
          });
          if (!running()) {
            // Stop arrived while the policy gate was being checked.
            await this.supervisor
              .action({ projectId: batch.projectId, runId, action: "cancel" })
              .catch(() => {});
            return false;
          }
          await this.supervisor.waitForRun(runId);
          if (!running()) return false;
          result = this.store.runs.get(batch.projectId, runId)!;
        }
        if (result.reviewState !== "completed") {
          batch.status = "blocked";
          batch.reason = "REVIEW_FAILED";
          this.save(batch, "blocked", taskId);
          return false;
        }
      }
      batch.finished++;
      batch.status = "blocked";
      batch.reason = "HUMAN_APPROVAL_REQUIRED";
      this.save(batch, "blocked", taskId);
      return false;
    }
    if (result.state !== "completed") {
      batch.status = "failed";
      batch.reason = "RUN_FAILED";
      this.save(batch, "failed", taskId);
      return false;
    }
    batch.completedTaskIds.push(taskId);
    batch.finished++;
    batch.runId = null;
    this.save(batch, "task_completed", taskId);
    return true;
  }
  /** A policy refusal is a decision for the operator, not a failure: approve
   * or change the policy, then resume. Anything else fails the batch. */
  private refused(
    batch: OrchestrationState,
    e: unknown,
    step: PolicyStep | null,
  ) {
    if (batch.status !== "running" || this.closed) return;
    const code = e instanceof Error ? e.message : "";
    if (code.startsWith("POLICY_")) {
      batch.status = "blocked";
      batch.reason = code;
      // A refused review keeps its run so resume can settle it.
      batch.runId = step?.runId ?? null;
      if (step) batch.policyAgent = step.agent;
      this.save(batch, "blocked", step?.taskId ?? null);
    } else {
      batch.status = "failed";
      batch.reason = "DISPATCH_FAILED";
      this.save(batch, "failed");
    }
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

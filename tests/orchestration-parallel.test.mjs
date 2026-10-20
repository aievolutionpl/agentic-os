import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../dist/main/store.js";
import { Orchestrator } from "../dist/main/orchestrator.js";

const until = async (fn) => {
  for (let i = 0; i < 250; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("Condition timed out");
};
const settle = () => new Promise((r) => setTimeout(r, 40));

function setup(t, count, deps = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-parallel-"));
  const store = new Store(join(dir, "db.sqlite"));
  t.after(() => {
    try {
      store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({
    name: "Parallel",
    root: "/fixture",
    master: "codex",
  });
  for (let n = 0; n < count; n++)
    store.createTask({
      projectId: project.id,
      title: `Task ${n + 1}`,
      implementer: "codex",
      reviewer: "claude",
    });
  const ids = store.tasks(project.id).map((x) => x.id);
  for (const [task, on] of Object.entries(deps))
    store.taskAction({
      projectId: project.id,
      id: ids[task],
      action: "dependencies",
      dependencyIds: on.map((i) => ids[i]),
    });
  for (const id of ids)
    store.taskAction({ projectId: project.id, id, action: "queue" });
  return { store, projectId: project.id, ids };
}

/** Fake runtime where the test decides when and how each run ends. */
function runtime(store, projectId) {
  const runs = new Map(); // taskId -> { runId, lease, done }
  const fake = {
    calls: [],
    cancelled: [],
    settings: () => [
      { id: "codex", configured: true },
      { id: "claude", configured: true },
    ],
    start: async (p) => {
      fake.calls.push(p.taskId);
      const owner = `run-${randomUUID()}`;
      const lease = store.lifecycle.claim({
        projectId,
        id: p.taskId,
        owner,
        ttlMs: 60000,
      });
      const run = store.runs.create(
        projectId,
        p.taskId,
        lease.attempt,
        "codex",
        "claude",
        { repository: "/fixture", path: "/fixture/w", base: "a", head: "a" },
        "",
      );
      store.runs.update(projectId, run.id, { state: "running" });
      let resolve;
      const done = new Promise((r) => (resolve = r));
      runs.set(p.taskId, { runId: run.id, lease, owner, done, resolve });
      return run;
    },
    waitForRun: (runId) => {
      const entry = [...runs.values()].find((r) => r.runId === runId);
      return store.runs.get(projectId, runId).state === "running"
        ? entry.done
        : Promise.resolve();
    },
    review: async () => {},
    action: async (p) => {
      fake.cancelled.push(p.runId);
      const entry = [...runs.values()].find((r) => r.runId === p.runId);
      store.runs.update(projectId, p.runId, { state: "cancelled" });
      entry?.resolve();
    },
    /** Ends a task's run as completed or waiting for human approval. */
    end(taskId, outcome = "completed") {
      const entry = runs.get(taskId);
      if (outcome === "completed")
        store.lifecycle.finish({
          projectId,
          id: taskId,
          owner: entry.owner,
          token: entry.lease.token,
          outcome: "completed",
        });
      store.runs.update(projectId, entry.runId, { state: outcome });
      entry.resolve();
    },
  };
  return fake;
}

test("parallel batches run two independent tasks at once and fill the freed slot", async (t) => {
  const { store, projectId, ids } = setup(t, 3);
  const fake = runtime(store, projectId);
  const queue = new Orchestrator(store, fake);
  queue.start({
    projectId,
    taskIds: ids,
    contextIds: [],
    consent: true,
    parallel: true,
  });
  await until(() => fake.calls.length === 2);
  await settle();
  assert.deepEqual(fake.calls, [ids[0], ids[1]], "third task waits for a slot");
  assert.equal(queue.state({ projectId }).runIds.length, 2);
  fake.end(ids[1]);
  await until(() => fake.calls.length === 3);
  fake.end(ids[0]);
  fake.end(ids[2]);
  await until(() => queue.state({ projectId }).status !== "running");
  const done = queue.state({ projectId });
  assert.equal(done.status, "completed");
  assert.deepEqual([...done.completedTaskIds].sort(), [...ids].sort());
  assert.equal(done.finished, 3);
});

test("a dependent task waits for its dependency even when a slot is free", async (t) => {
  // Task 3 depends on task 1.
  const { store, projectId, ids } = setup(t, 3, { 2: [0] });
  const fake = runtime(store, projectId);
  const queue = new Orchestrator(store, fake);
  queue.start({
    projectId,
    taskIds: ids,
    contextIds: [],
    consent: true,
    parallel: true,
  });
  await until(() => fake.calls.length === 2);
  fake.end(ids[1]);
  await settle();
  assert.deepEqual(fake.calls, [ids[0], ids[1]], "task 3 is still blocked");
  fake.end(ids[0]);
  await until(() => fake.calls.length === 3);
  assert.equal(fake.calls[2], ids[2]);
  fake.end(ids[2]);
  await until(() => queue.state({ projectId }).status !== "running");
  assert.equal(queue.state({ projectId }).status, "completed");
});

test("two results waiting for approval that touch the same file hold the batch as FILE_CONFLICT", async (t) => {
  const { store, projectId, ids } = setup(t, 2);
  const fake = runtime(store, projectId);
  const queue = new Orchestrator(store, fake);
  queue.changedFiles = () => new Set(["src/app.ts"]);
  queue.start({
    projectId,
    taskIds: ids,
    contextIds: [],
    consent: true,
    parallel: true,
  });
  await until(() => fake.calls.length === 2);
  fake.end(ids[0], "awaiting_review");
  fake.end(ids[1], "awaiting_review");
  await until(() => queue.state({ projectId }).status !== "running");
  const held = queue.state({ projectId });
  assert.equal(held.status, "blocked");
  assert.equal(held.reason, "FILE_CONFLICT");
  assert.equal(held.finished, 2);
});

test("separate files waiting for approval hold the batch for a human decision", async (t) => {
  const { store, projectId, ids } = setup(t, 2);
  const fake = runtime(store, projectId);
  const queue = new Orchestrator(store, fake);
  let n = 0;
  queue.changedFiles = () => new Set([`src/file-${n++}.ts`]);
  queue.start({
    projectId,
    taskIds: ids,
    contextIds: [],
    consent: true,
    parallel: true,
  });
  await until(() => fake.calls.length === 2);
  fake.end(ids[0], "awaiting_review");
  fake.end(ids[1], "awaiting_review");
  await until(() => queue.state({ projectId }).status !== "running");
  assert.equal(queue.state({ projectId }).reason, "HUMAN_APPROVAL_REQUIRED");
});

test("stop cancels every active run of a parallel batch", async (t) => {
  const { store, projectId, ids } = setup(t, 2);
  const fake = runtime(store, projectId);
  const queue = new Orchestrator(store, fake);
  queue.start({
    projectId,
    taskIds: ids,
    contextIds: [],
    consent: true,
    parallel: true,
  });
  await until(() => fake.calls.length === 2);
  const { runIds } = queue.state({ projectId });
  await queue.stop({ projectId });
  assert.deepEqual([...fake.cancelled].sort(), [...runIds].sort());
  assert.equal(queue.state({ projectId }).status, "stopped");
});

test("a sequential batch still runs one task at a time", async (t) => {
  const { store, projectId, ids } = setup(t, 2);
  const fake = runtime(store, projectId);
  const queue = new Orchestrator(store, fake);
  queue.start({ projectId, taskIds: ids, contextIds: [], consent: true });
  await until(() => fake.calls.length === 1);
  await settle();
  assert.deepEqual(fake.calls, [ids[0]]);
  assert.equal(queue.state({ projectId }).parallel, undefined);
  fake.end(ids[0]);
  await until(() => fake.calls.length === 2);
  fake.end(ids[1]);
  await until(() => queue.state({ projectId }).status !== "running");
  assert.equal(queue.state({ projectId }).status, "completed");
});

test("parallel must be a boolean", (t) => {
  const { store, projectId, ids } = setup(t, 1);
  const queue = new Orchestrator(store, runtime(store, projectId));
  assert.throws(
    () =>
      queue.start({
        projectId,
        taskIds: ids,
        contextIds: [],
        consent: true,
        parallel: "yes",
      }),
    /INVALID_INPUT/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { Store } from "../dist/main/store.js";
import { Supervisor } from "../dist/main/supervisor.js";
import { Orchestrator } from "../dist/main/orchestrator.js";

const settle = () => new Promise((r) => setTimeout(r, 30));
const until = async (fn) => {
  for (let i = 0; i < 250; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Condition timed out");
};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-journal-"));
  const opened = [];
  t.after(() => {
    for (const s of opened)
      try {
        s.close();
      } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  const open = () => {
    const store = new Store(join(dir, "db.sqlite"));
    opened.push(store);
    return store;
  };
  return { dir, open };
}
function seed(store, count) {
  const project = store.createProject({
    name: "Journal",
    root: "/fixture",
    master: "codex",
  });
  const tasks = Array.from({ length: count }, (_, n) =>
    store.createTask({
      projectId: project.id,
      title: `Task ${n + 1}`,
      implementer: "codex",
      reviewer: "claude",
    }),
  );
  for (const task of tasks)
    store.taskAction({ projectId: project.id, id: task.id, action: "queue" });
  return { project, tasks };
}
/** Fake provider runtime: claims the task like the supervisor, then completes or hangs. */
function runtime(store, projectId, outcome) {
  const calls = [];
  return {
    calls,
    settings: () => [
      { id: "codex", configured: true },
      { id: "claude", configured: true },
    ],
    start: async (p) => {
      calls.push(p.taskId);
      const lease = store.lifecycle.claim({
        projectId,
        id: p.taskId,
        owner: `run-${randomUUID()}`,
        ttlMs: 60000,
      });
      return store.runs.create(
        projectId,
        p.taskId,
        lease.attempt,
        "codex",
        "claude",
        { repository: "/fixture", path: "/fixture/w", base: "a", head: "a" },
        "",
      );
    },
    waitForRun: (runId) => {
      const run = store.runs.get(projectId, runId);
      if (outcome(run.taskId) === "hang") return new Promise(() => {});
      store.runs.update(projectId, runId, { state: "completed" });
      return Promise.resolve();
    },
    review: async () => {},
    action: async () => {},
  };
}

test("a crash mid-batch is journaled as interrupted, never replayed, and continues only on explicit consent", async (t) => {
  const f = fixture(t);
  let store = f.open();
  const { project, tasks } = seed(store, 3);
  const [a, b, c] = tasks.map((x) => x.id);
  const first = runtime(store, project.id, (id) => (id === b ? "hang" : "ok"));
  const queue = new Orchestrator(store, first);
  const started = queue.start({
    projectId: project.id,
    taskIds: [a, b, c],
    contextIds: [],
    consent: true,
  });
  assert.ok(started.id);
  await until(() => first.calls.length === 2);
  assert.deepEqual(first.calls, [a, b]);
  const running = queue.state({ projectId: project.id });
  assert.equal(running.status, "running");
  assert.deepEqual(running.completedTaskIds, [a]);

  // Abrupt process loss: no orchestrator.close(), the database is simply reopened.
  store.close();
  store = f.open();
  new Supervisor(store, join(f.dir, "app")); // real run recovery
  const second = runtime(store, project.id, () => "ok");
  const recovered = new Orchestrator(store, second);
  const state = recovered.state({ projectId: project.id });
  assert.equal(state.id, started.id);
  assert.equal(state.status, "interrupted");
  assert.equal(state.reason, "APP_INTERRUPTED");
  assert.deepEqual(state.completedTaskIds, [a]);
  await settle();
  assert.deepEqual(second.calls, [], "restart must not replay any step");
  const run = store.runs.list(project.id, b)[0];
  assert.equal(run.state, "interrupted");
  assert.equal(
    store.tasks(project.id).find((x) => x.id === b).status,
    "failed",
  );
  assert.deepEqual(
    recovered
      .events({ projectId: project.id })
      .map((e) => e.kind)
      .reverse(),
    ["created", "dispatched", "task_completed", "dispatched", "interrupted"],
  );

  assert.throws(
    () => recovered.resume({ projectId: project.id, batchId: started.id }),
    /CONSENT/,
  );
  assert.throws(
    () =>
      recovered.resume({
        projectId: project.id,
        batchId: randomUUID(),
        consent: true,
      }),
    /BATCH_NOT_FOUND/,
  );
  const resumed = recovered.resume({
    projectId: project.id,
    batchId: started.id,
    consent: true,
  });
  assert.equal(resumed.status, "running");
  await until(
    () => recovered.state({ projectId: project.id }).status !== "running",
  );
  assert.deepEqual(second.calls, [c], "only the still-queued task runs");
  const done = recovered.state({ projectId: project.id });
  assert.equal(done.status, "completed");
  assert.deepEqual(done.completedTaskIds, [a, c]);
  assert.equal(store.runs.list(project.id, b).length, 1, "no second run of b");
  assert.throws(
    () =>
      recovered.resume({
        projectId: project.id,
        batchId: started.id,
        consent: true,
      }),
    /BATCH_NOT_INTERRUPTED/,
  );
});

test("graceful shutdown persists a running batch as interrupted and keeps finished batches intact", async (t) => {
  const f = fixture(t);
  let store = f.open();
  const { project, tasks } = seed(store, 2);
  const fake = runtime(store, project.id, () => "hang");
  const queue = new Orchestrator(store, fake);
  const { id } = queue.start({
    projectId: project.id,
    taskIds: tasks.map((x) => x.id),
    contextIds: [],
    consent: true,
  });
  await until(() => fake.calls.length === 1);
  queue.close();
  assert.throws(
    () =>
      queue.start({
        projectId: project.id,
        taskIds: [tasks[1].id],
        contextIds: [],
        consent: true,
      }),
    /CONSENT/,
  );
  store.close();
  store = f.open();
  const state = new Orchestrator(
    store,
    runtime(store, project.id, () => "ok"),
  ).state({ projectId: project.id });
  assert.equal(state.id, id);
  assert.equal(state.status, "interrupted");
  assert.equal(state.reason, "APP_CLOSED");
});

test("resume refuses when no queued work remains", async (t) => {
  const f = fixture(t);
  const store = f.open();
  const { project, tasks } = seed(store, 1);
  const hanging = runtime(store, project.id, () => "hang");
  const queue = new Orchestrator(store, hanging);
  const { id } = queue.start({
    projectId: project.id,
    taskIds: [tasks[0].id],
    contextIds: [],
    consent: true,
  });
  await until(() => hanging.calls.length === 1);
  queue.close();
  new Supervisor(store, join(f.dir, "app"));
  const next = new Orchestrator(
    store,
    runtime(store, project.id, () => "ok"),
  );
  assert.throws(
    () => next.resume({ projectId: project.id, batchId: id, consent: true }),
    /NOTHING_TO_RESUME/,
  );
});

test("a failed v13 migration rolls back and leaves v12 data untouched", (t) => {
  const f = fixture(t);
  let store = f.open();
  const { project } = seed(store, 1);
  store.close();
  let db = new DatabaseSync(join(f.dir, "db.sqlite"));
  db.exec(
    "DROP TABLE batch_events; DROP TABLE batches; CREATE TABLE batch_events(x); PRAGMA user_version=12",
  );
  db.close();
  assert.throws(() => f.open(), /ERR_SQLITE_ERROR|no such column/);
  db = new DatabaseSync(join(f.dir, "db.sqlite"));
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 12);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM sqlite_master WHERE name='batches'")
      .get().n,
    0,
  );
  db.exec("DROP TABLE batch_events");
  db.close();
  store = f.open();
  assert.equal(store.projects()[0].id, project.id);
});

test("schema v12 migrates to v13 without losing data and rejects newer schemas", (t) => {
  const f = fixture(t);
  let store = f.open();
  const { project } = seed(store, 1);
  store.close();
  let db = new DatabaseSync(join(f.dir, "db.sqlite"));
  db.exec(
    "DROP TABLE batch_events; DROP TABLE batches; PRAGMA user_version=12",
  );
  db.close();
  store = f.open();
  assert.equal(store.projects()[0].id, project.id);
  assert.equal(store.tasks(project.id).length, 1);
  assert.equal(store.batches.latest(project.id), null);
  store.close();
  db = new DatabaseSync(join(f.dir, "db.sqlite"));
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 13);
  db.exec("PRAGMA user_version=14");
  db.close();
  assert.throws(() => f.open(), /UNSUPPORTED_SCHEMA/);
});

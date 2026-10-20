import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { Store, SCHEMA_VERSION } from "../dist/main/store.js";
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
  const { project } = seed(store, 3);
  // Same-millisecond tasks are ordered by id, so take the queue's real order.
  const [a, b, c] = store.tasks(project.id).map((x) => x.id);
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
    "DROP TABLE capability_checks; DROP TABLE batch_events; DROP TABLE batches; CREATE TABLE batch_events(x); PRAGMA user_version=12",
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

test("schema v12 migrates to the current schema without losing data and rejects newer schemas", (t) => {
  const f = fixture(t);
  let store = f.open();
  const { project } = seed(store, 1);
  store.close();
  let db = new DatabaseSync(join(f.dir, "db.sqlite"));
  db.exec(
    "DROP TABLE capability_checks; DROP TABLE batch_events; DROP TABLE batches; PRAGMA user_version=12",
  );
  db.close();
  store = f.open();
  assert.equal(store.projects()[0].id, project.id);
  assert.equal(store.tasks(project.id).length, 1);
  assert.equal(store.batches.latest(project.id), null);
  store.close();
  db = new DatabaseSync(join(f.dir, "db.sqlite"));
  assert.equal(
    db.prepare("PRAGMA user_version").get().user_version,
    SCHEMA_VERSION,
  );
  db.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`);
  db.close();
  assert.throws(() => f.open(), /UNSUPPORTED_SCHEMA/);
});

test("a policy refusal holds the batch as blocked and resumes after approval", async (t) => {
  const f = fixture(t);
  const store = f.open();
  const { project } = seed(store, 2);
  const [a, b] = store.tasks(project.id).map((x) => x.id);
  const fake = runtime(store, project.id, () => "ok");
  let approved = false;
  const start = fake.start;
  fake.start = async (p, c) => {
    if (p.taskId === b && !approved) throw Error("POLICY_APPROVAL_REQUIRED");
    return start(p, c);
  };
  const queue = new Orchestrator(store, fake);
  const started = queue.start({
    projectId: project.id,
    taskIds: [a, b],
    contextIds: [],
    consent: true,
  });
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  const held = queue.state({ projectId: project.id });
  assert.equal(held.status, "blocked");
  assert.equal(held.reason, "POLICY_APPROVAL_REQUIRED");
  assert.equal(held.policyAgent, "codex");
  assert.deepEqual(held.completedTaskIds, [a]);
  const last = queue.events({ projectId: project.id })[0];
  assert.equal(last.kind, "blocked");
  assert.equal(last.taskId, b);

  approved = true;
  const resumed = queue.resume({
    projectId: project.id,
    batchId: started.id,
    consent: true,
  });
  assert.equal(resumed.status, "running");
  assert.equal(resumed.policyAgent, undefined);
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  const done = queue.state({ projectId: project.id });
  assert.equal(done.status, "completed");
  assert.deepEqual(done.completedTaskIds, [a, b]);
});

test("resume retries a review the policy refused, then waits for a human decision", async (t) => {
  const f = fixture(t);
  const store = f.open();
  const { project } = seed(store, 1);
  const [a] = store.tasks(project.id).map((x) => x.id);
  const fake = runtime(store, project.id, () => "ok");
  fake.waitForRun = (runId) => {
    if (store.runs.get(project.id, runId).state !== "awaiting_review")
      store.runs.update(project.id, runId, { state: "awaiting_review" });
    return Promise.resolve();
  };
  let approved = false;
  const reviews = [];
  fake.review = async (p) => {
    reviews.push(p.runId);
    if (!approved) throw Error("POLICY_APPROVAL_REQUIRED");
  };
  const queue = new Orchestrator(store, fake);
  const started = queue.start({
    projectId: project.id,
    taskIds: [a],
    contextIds: [],
    consent: true,
  });
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  const held = queue.state({ projectId: project.id });
  assert.equal(held.status, "blocked");
  assert.equal(held.reason, "POLICY_APPROVAL_REQUIRED");
  assert.equal(held.policyAgent, "claude", "the reviewer needs the approval");
  const runId = store.runs.list(project.id, a)[0].id;
  assert.equal(held.policyRunId, runId);
  assert.equal(held.finished, 0);

  approved = true;
  queue.resume({ projectId: project.id, batchId: started.id, consent: true });
  assert.equal(
    queue.state({ projectId: project.id }).runId,
    runId,
    "stop can cancel the retried review",
  );
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  const done = queue.state({ projectId: project.id });
  assert.deepEqual(reviews, [runId, runId], "the same review is retried");
  assert.deepEqual(fake.calls, [a], "the task is not dispatched again");
  assert.equal(done.status, "blocked");
  assert.equal(done.reason, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(done.finished, 1);
  assert.equal(done.policyRunId, undefined);
});

test("a review the operator already ran is accepted, and a policy hold blocks new batches", async (t) => {
  const f = fixture(t);
  const store = f.open();
  const { project } = seed(store, 2);
  const [a, b] = store.tasks(project.id).map((x) => x.id);
  const fake = runtime(store, project.id, () => "ok");
  fake.waitForRun = (runId) => {
    if (store.runs.get(project.id, runId).state !== "awaiting_review")
      store.runs.update(project.id, runId, { state: "awaiting_review" });
    return Promise.resolve();
  };
  const reviews = [];
  fake.review = async (p) => {
    reviews.push(p.runId);
    throw Error("POLICY_APPROVAL_REQUIRED");
  };
  const queue = new Orchestrator(store, fake);
  const started = queue.start({
    projectId: project.id,
    taskIds: [a],
    contextIds: [],
    consent: true,
  });
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  assert.throws(
    () =>
      queue.start({
        projectId: project.id,
        taskIds: [b],
        contextIds: [],
        consent: true,
      }),
    /BATCH_HELD_BY_POLICY/,
  );
  // The operator approves and runs the review from the task itself.
  const runId = store.runs.list(project.id, a)[0].id;
  store.runs.update(project.id, runId, { reviewState: "completed" });
  queue.resume({ projectId: project.id, batchId: started.id, consent: true });
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  assert.deepEqual(reviews, [runId], "no duplicate review");
  assert.equal(
    queue.state({ projectId: project.id }).reason,
    "HUMAN_APPROVAL_REQUIRED",
  );
});

test("abandoning a policy hold frees the queue for a new batch", async (t) => {
  const f = fixture(t);
  const store = f.open();
  const { project } = seed(store, 2);
  const [a, b] = store.tasks(project.id).map((x) => x.id);
  const fake = runtime(store, project.id, () => "ok");
  const start = fake.start;
  fake.start = async (p, c) => {
    if (p.taskId === a) throw Error("POLICY_APPROVAL_REQUIRED");
    return start(p, c);
  };
  const queue = new Orchestrator(store, fake);
  queue.start({
    projectId: project.id,
    taskIds: [a],
    contextIds: [],
    consent: true,
  });
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  assert.equal(queue.state({ projectId: project.id }).status, "blocked");
  await queue.stop({ projectId: project.id });
  const abandoned = queue.state({ projectId: project.id });
  assert.equal(abandoned.status, "stopped");
  assert.equal(abandoned.reason, "USER_STOPPED");
  const next = queue.start({
    projectId: project.id,
    taskIds: [b],
    contextIds: [],
    consent: true,
  });
  assert.equal(next.status, "running");
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  assert.equal(queue.state({ projectId: project.id }).status, "completed");
});

test("a review cut short by a crash returns the result to review, and a held retry runs it again", async (t) => {
  const f = fixture(t);
  let store = f.open();
  const { project } = seed(store, 1);
  const [a] = store.tasks(project.id).map((x) => x.id);
  const fake = runtime(store, project.id, () => "ok");
  fake.waitForRun = (runId) => {
    if (store.runs.get(project.id, runId).state !== "awaiting_review")
      store.runs.update(project.id, runId, { state: "awaiting_review" });
    return Promise.resolve();
  };
  fake.review = async () => {
    throw Error("POLICY_APPROVAL_REQUIRED");
  };
  const queue = new Orchestrator(store, fake);
  const started = queue.start({
    projectId: project.id,
    taskIds: [a],
    contextIds: [],
    consent: true,
  });
  await until(
    () => queue.state({ projectId: project.id }).status !== "running",
  );
  const runId = store.runs.list(project.id, a)[0].id;
  // The operator started the review by hand, then the app crashed.
  store.runs.update(project.id, runId, {
    state: "reviewing",
    reviewState: "running",
    artifactId: "artifact-fixture",
  });
  store.close();
  store = f.open();
  new Supervisor(store, join(f.dir, "app"));
  const recovered = store.runs.get(project.id, runId);
  assert.equal(recovered.state, "awaiting_review");
  assert.equal(recovered.reviewState, "failed");
  assert.equal(recovered.error, "REVIEW_INTERRUPTED");

  const second = runtime(store, project.id, () => "ok");
  const reviews = [];
  second.review = async (p) => reviews.push(p.runId);
  second.waitForRun = () => Promise.resolve();
  const resumedQueue = new Orchestrator(store, second);
  resumedQueue.resume({
    projectId: project.id,
    batchId: started.id,
    consent: true,
  });
  await until(
    () => resumedQueue.state({ projectId: project.id }).status !== "running",
  );
  assert.deepEqual(reviews, [runId], "the interrupted review runs again");
  assert.equal(
    resumedQueue.state({ projectId: project.id }).reason,
    "HUMAN_APPROVAL_REQUIRED",
  );
});

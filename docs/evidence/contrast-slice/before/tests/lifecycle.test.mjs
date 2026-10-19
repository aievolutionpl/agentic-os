import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/main/store.js";
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-")),
    file = join(dir, "app.db");
  let now = 1000;
  const s = new Store(file, () => now),
    other = new Store(file, () => now);
  t.after(() => {
    s.close();
    other.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const p = s.createProject({ name: "A", root: "", master: "codex" });
  const task = () =>
    s.createTask({
      projectId: p.id,
      title: "Work",
      implementer: "codex",
      reviewer: "claude",
    });
  return {
    s,
    other,
    file,
    p,
    task,
    advance: () => {
      now += 1000;
    },
  };
}
test("lifecycle persists, fences two claimants and journals failures/retries atomically", (t) => {
  const { s, other, p, task, file } = setup(t),
    a = task(),
    ref = { projectId: p.id, id: a.id };
  s.taskAction({ ...ref, action: "queue" });
  const lease = s.lifecycle.claim({ ...ref, owner: "worker-a", ttlMs: 1000 });
  assert.throws(() =>
    other.lifecycle.claim({ ...ref, owner: "worker-b", ttlMs: 1000 }),
  );
  assert.throws(() =>
    s.lifecycle.heartbeat({
      ...ref,
      owner: "worker-b",
      token: lease.token,
      ttlMs: 1000,
    }),
  );
  s.lifecycle.finish({
    ...ref,
    owner: "worker-a",
    token: lease.token,
    outcome: "failed",
    failure: "worker_error",
  });
  s.taskAction({ ...ref, action: "retry" });
  const next = other.lifecycle.claim({
    ...ref,
    owner: "worker-a",
    ttlMs: 1000,
  });
  assert.notEqual(next.token, lease.token);
  assert.throws(() =>
    s.lifecycle.finish({
      ...ref,
      owner: "worker-a",
      token: lease.token,
      outcome: "completed",
    }),
  );
  s.lifecycle.finish({
    ...ref,
    owner: "worker-a",
    token: next.token,
    outcome: "completed",
  });
  const reopened = new Store(file, () => 1000);
  try {
    assert.equal(reopened.tasks(p.id)[0].status, "completed");
    assert.equal(reopened.tasks(p.id)[0].attempt, 2);
    assert.deepEqual(
      reopened.events(p.id).map((e) => e.kind),
      [
        "created",
        "queued",
        "claimed",
        "failed",
        "retried",
        "claimed",
        "completed",
      ],
    );
    assert.equal(
      reopened.events(p.id).find((e) => e.kind === "failed").failure,
      "worker_error",
    );
  } finally {
    reopened.close();
  }
});
test("expired lease cannot heartbeat or finish; explicit recovery and retry required", (t) => {
  const { s, p, task, advance } = setup(t),
    ref = { projectId: p.id, id: task().id };
  s.taskAction({ ...ref, action: "queue" });
  const lease = s.lifecycle.claim({ ...ref, owner: "a", ttlMs: 1000 });
  advance();
  assert.throws(() =>
    s.lifecycle.heartbeat({
      ...ref,
      owner: "a",
      token: lease.token,
      ttlMs: 1000,
    }),
  );
  assert.throws(() =>
    s.lifecycle.finish({
      ...ref,
      owner: "a",
      token: lease.token,
      outcome: "completed",
    }),
  );
  assert.equal(s.lifecycle.recover(p.id), 1);
  assert.equal(s.lifecycle.recover(p.id), 0);
  assert.equal(s.tasks(p.id)[0].failure, "lease_expired");
  assert.throws(() => s.lifecycle.claim({ ...ref, owner: "b", ttlMs: 1000 }));
  s.taskAction({ ...ref, action: "retry" });
  assert.equal(
    s.lifecycle.claim({ ...ref, owner: "b", ttlMs: 1000 }).attempt,
    2,
  );
});
test("dependencies, cycles, invalid transitions and workspace separation fail closed", (t) => {
  const { s, p, task } = setup(t),
    a = task(),
    b = task(),
    ra = { projectId: p.id, id: a.id },
    rb = { projectId: p.id, id: b.id };
  const other = s.createProject({ name: "B", root: "", master: "claude" });
  s.taskAction({ ...rb, action: "dependencies", dependencyIds: [a.id] });
  assert.throws(() =>
    s.taskAction({ ...ra, action: "dependencies", dependencyIds: [b.id] }),
  );
  assert.throws(() =>
    s.taskAction({ ...ra, projectId: other.id, action: "queue" }),
  );
  assert.deepEqual(s.events(other.id), []);
  s.taskAction({ ...rb, action: "queue" });
  assert.equal(s.tasks(p.id).find((x) => x.id === b.id).ready, false);
  assert.throws(() => s.lifecycle.claim({ ...rb, owner: "a", ttlMs: 1000 }));
  assert.throws(() => s.taskAction({ ...rb, action: "completed" }));
  assert.throws(() =>
    s.taskAction({ ...rb, action: "dependencies", dependencyIds: [] }),
  );
  s.taskAction({ ...ra, action: "queue" });
  const lease = s.lifecycle.claim({ ...ra, owner: "a", ttlMs: 1000 });
  s.lifecycle.finish({
    ...ra,
    owner: "a",
    token: lease.token,
    outcome: "completed",
  });
  assert.equal(s.tasks(p.id).find((x) => x.id === b.id).ready, true);
  assert.ok(s.lifecycle.claim({ ...rb, owner: "b", ttlMs: 1000 }));
});

test("heartbeat extends ownership, retry is bounded and invalid requests leave no events", (t) => {
  const { s, p, task, advance } = setup(t),
    ref = { projectId: p.id, id: task().id };
  s.taskAction({ ...ref, action: "queue" });
  let lease = s.lifecycle.claim({ ...ref, owner: "a", ttlMs: 2000 });
  advance();
  assert.equal(
    s.lifecycle.heartbeat({
      ...ref,
      owner: "a",
      token: lease.token,
      ttlMs: 2000,
    }),
    4000,
  );
  advance();
  assert.equal(s.lifecycle.recover(p.id), 0);
  const count = s.events(p.id).length;
  for (const ttlMs of [0, -1, 1.5, Infinity, 300001, "2000"])
    assert.throws(() =>
      s.lifecycle.heartbeat({ ...ref, owner: "a", token: lease.token, ttlMs }),
    );
  assert.throws(() =>
    s.lifecycle.finish({
      ...ref,
      owner: "a",
      token: lease.token,
      outcome: "failed",
      failure: "raw secret text",
    }),
  );
  assert.equal(s.events(p.id).length, count);
  for (let attempt = 1; attempt <= 3; attempt++) {
    s.lifecycle.finish({
      ...ref,
      owner: "a",
      token: lease.token,
      outcome: "failed",
      failure: "validation_failed",
    });
    if (attempt < 3) {
      s.taskAction({ ...ref, action: "retry" });
      lease = s.lifecycle.claim({ ...ref, owner: "a", ttlMs: 2000 });
    }
  }
  assert.throws(() => s.taskAction({ ...ref, action: "retry" }));
  assert.equal(s.tasks(p.id)[0].attempt, 3);
  assert.equal(s.events(p.id).filter((e) => e.kind === "failed").length, 3);
  s.taskAction({ ...ref, action: "cancel" });
  assert.throws(() => s.taskAction({ ...ref, action: "queue" }));
});

test("migration preserves original v1 data and events are atomic with task mutations", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "migration-")),
    file = join(dir, "v1.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,root TEXT,master TEXT,createdAt TEXT);
 CREATE TABLE tasks(id TEXT PRIMARY KEY,projectId TEXT REFERENCES projects(id),title TEXT,implementer TEXT,reviewer TEXT,status TEXT CHECK(status='draft'),createdAt TEXT);
 CREATE INDEX task_scope ON tasks(projectId);
 CREATE TABLE memory(id TEXT PRIMARY KEY,projectId TEXT,content TEXT,source TEXT,createdAt TEXT);
 CREATE TABLE preferences(id INTEGER PRIMARY KEY,language TEXT,theme TEXT);
 INSERT INTO projects VALUES('p','Legacy','C:/legacy','codex','2026-01-01');
 INSERT INTO tasks VALUES('t','p','Keep me','codex','claude','draft','2026-01-01');
 INSERT INTO memory VALUES('m','p','Keep knowledge','user','2026-01-01');
 INSERT INTO preferences VALUES(1,'en','light');PRAGMA user_version=1;`);
  const s = new Store(file);
  try {
    assert.equal(s.tasks("p")[0].title, "Keep me");
    assert.equal(s.memory("p")[0].content, "Keep knowledge");
    assert.equal(s.projects()[0].root, "C:/legacy");
    assert.equal(s.preferences().theme, "light");
    assert.deepEqual(
      s.events("p").map((e) => e.kind),
      ["imported"],
    );
    db.exec(
      "CREATE TRIGGER reject_event BEFORE INSERT ON task_events BEGIN SELECT RAISE(ABORT,'test disk failure'); END;",
    );
    assert.throws(() =>
      s.taskAction({ projectId: "p", id: "t", action: "queue" }),
    );
    assert.equal(s.tasks("p")[0].status, "draft");
    assert.equal(s.events("p").length, 1);
    assert.throws(() =>
      s.createTask({
        projectId: "p",
        title: "No orphan",
        implementer: "codex",
        reviewer: "claude",
      }),
    );
    assert.equal(s.tasks("p").length, 1);
    db.exec("DROP TRIGGER reject_event");
    s.taskAction({ projectId: "p", id: "t", action: "queue" });
  } finally {
    s.close();
    db.close();
  }
  const again = new Store(file);
  try {
    assert.equal(again.events("p").length, 2);
  } finally {
    again.close();
  }
});

test("two simultaneous worker connections produce exactly one claim", async (t) => {
  const { Worker } = await import("node:worker_threads");
  const { s, p, task, file } = setup(t),
    ref = { projectId: p.id, id: task().id };
  s.taskAction({ ...ref, action: "queue" });
  const moduleUrl = new URL("../dist/main/store.js", import.meta.url).href;
  const source = `const {parentPort,workerData}=require('node:worker_threads');
 import(workerData.moduleUrl).then(({Store})=>{const s=new Store(workerData.file,()=>1000);parentPort.postMessage('ready');parentPort.once('message',()=>{try{s.lifecycle.claim({...workerData.ref,owner:workerData.owner,ttlMs:1000});parentPort.postMessage('won');}catch{parentPort.postMessage('lost');}finally{s.close();parentPort.close();}});});`;
  const workers = ["one", "two"].map(
    (owner) =>
      new Worker(source, {
        eval: true,
        workerData: { moduleUrl, file, ref, owner },
      }),
  );
  t.after(() => Promise.all(workers.map((w) => w.terminate())));
  await Promise.all(
    workers.map(
      (w) =>
        new Promise((resolve, reject) => {
          w.once("message", resolve);
          w.once("error", reject);
        }),
    ),
  );
  const results = workers.map(
    (w) =>
      new Promise((resolve, reject) => {
        w.once("message", resolve);
        w.once("error", reject);
      }),
  );
  workers.forEach((w) => w.postMessage("go"));
  assert.deepEqual((await Promise.all(results)).sort(), ["lost", "won"]);
  assert.equal(s.events(p.id).filter((e) => e.kind === "claimed").length, 1);
  assert.equal(s.tasks(p.id)[0].attempt, 1);
});

test("cross-project dependency edges and worker writes are rejected", (t) => {
  const { s, p, task } = setup(t),
    a = task(),
    ref = { projectId: p.id, id: a.id };
  const b = s.createProject({ name: "B", root: "", master: "claude" });
  const foreign = s.createTask({
    projectId: b.id,
    title: "Private B",
    implementer: "codex",
    reviewer: "claude",
  });
  assert.throws(() =>
    s.taskAction({
      ...ref,
      action: "dependencies",
      dependencyIds: [foreign.id],
    }),
  );
  assert.throws(() =>
    s.taskAction({ ...ref, action: "dependencies", dependencyIds: [a.id] }),
  );
  s.taskAction({ ...ref, action: "queue" });
  const lease = s.lifecycle.claim({ ...ref, owner: "a", ttlMs: 1000 });
  assert.throws(() =>
    s.lifecycle.heartbeat({
      ...ref,
      projectId: b.id,
      owner: "a",
      token: lease.token,
      ttlMs: 1000,
    }),
  );
  assert.throws(() =>
    s.lifecycle.finish({
      ...ref,
      projectId: b.id,
      owner: "a",
      token: lease.token,
      outcome: "completed",
    }),
  );
  assert.equal(s.events(b.id).length, 1);
  assert.equal(s.tasks(p.id)[0].status, "running");
});

test("all connections close before restart; expired attempt is preserved and recovered once", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "restart-lifecycle-")),
    file = join(dir, "app.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let s = new Store(file, () => 1000);
  const p = s.createProject({ name: "A", root: "", master: "codex" });
  const task = s.createTask({
      projectId: p.id,
      title: "Survive restart",
      implementer: "codex",
      reviewer: "claude",
    }),
    ref = { projectId: p.id, id: task.id };
  s.taskAction({ ...ref, action: "queue" });
  s.lifecycle.claim({ ...ref, owner: "worker", ttlMs: 1000 });
  s.close();
  s = new Store(file, () => 2000);
  try {
    assert.equal(s.tasks(p.id)[0].status, "running");
    assert.equal(s.lifecycle.recover(p.id), 1);
    assert.equal(s.tasks(p.id)[0].attempt, 1);
    assert.equal(s.tasks(p.id)[0].owner, null);
    assert.deepEqual(
      s.events(p.id).map((e) => e.kind),
      ["created", "queued", "claimed", "failed"],
    );
  } finally {
    s.close();
  }
  s = new Store(file, () => 2000);
  try {
    assert.equal(s.lifecycle.recover(p.id), 0);
    assert.equal(s.events(p.id).length, 4);
  } finally {
    s.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/main/store.js";
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-test-"));
  const s = new Store(join(dir, "test.db"));
  t.after(() => {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return s;
}
test("empty launch, persisted projects, tasks, memory and preferences survive reopen", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-restart-"));
  const file = join(dir, "test.db");
  let s = new Store(file);
  assert.deepEqual(s.projects(), []);
  const p = s.createProject({
    name: "Client A",
    root: "C:\\Client A",
    master: "codex",
  });
  const task = s.createTask({
    projectId: p.id,
    title: "Review API",
    implementer: "claude",
    reviewer: "codex",
  });
  s.createMemory({
    projectId: p.id,
    content: "Use strict TS",
    source: "User decision",
  });
  s.setPreferences({ language: "en", theme: "light" });
  s.close();
  s = new Store(file);
  assert.equal(s.projects()[0].root, "C:\\Client A");
  assert.equal(s.tasks(p.id)[0].id, task.id);
  assert.equal(s.memory(p.id)[0].source, "User decision");
  assert.equal(s.tasks(p.id)[0].status, "draft");
  assert.deepEqual(s.preferences(), { language: "en", theme: "light" });
  s.close();
  rmSync(dir, { recursive: true, force: true });
});
test("memory and tasks are isolated and deletion is project scoped", (t) => {
  const s = fixture(t),
    a = s.createProject({ name: "A", root: "", master: "codex" }),
    b = s.createProject({ name: "B", root: "", master: "claude" });
  const m = s.createMemory({
    projectId: a.id,
    content: "private A",
    source: "user",
  });
  s.createTask({
    projectId: a.id,
    title: "Only A",
    implementer: "codex",
    reviewer: "claude",
  });
  assert.deepEqual(s.memory(b.id), []);
  assert.deepEqual(s.tasks(b.id), []);
  assert.throws(() => s.deleteMemory({ projectId: b.id, id: m.id }));
  assert.equal(s.memory(a.id).length, 1);
  s.deleteMemory({ projectId: a.id, id: m.id });
  assert.deepEqual(s.memory(a.id), []);
});
test("invalid and oversized input, unknown projects, invalid roles fail closed", (t) => {
  const s = fixture(t);
  assert.throws(() =>
    s.createProject({ name: " ", master: "codex", root: "" }),
  );
  assert.throws(() =>
    s.createProject({ name: "x", master: "shell", root: "" }),
  );
  assert.throws(() =>
    s.createTask({
      projectId: "missing",
      title: "x",
      implementer: "codex",
      reviewer: "claude",
    }),
  );
  const p = s.createProject({
    name: "'; DROP TABLE projects; --",
    master: "codex",
    root: "",
  });
  assert.equal(s.projects().length, 1);
  assert.throws(() =>
    s.createMemory({
      projectId: p.id,
      content: "x".repeat(20001),
      source: "u",
    }),
  );
  assert.throws(() => s.setPreferences({ language: "xx", theme: "dark" }));
  assert.throws(() =>
    s.createTask({
      projectId: p.id,
      title: "x",
      implementer: "codex",
      reviewer: "codex",
    }),
  );
});
test("unconfigured integrations never report quota values or observed provenance", (t) => {
  const s = fixture(t);
  for (const p of s.integrations()) {
    assert.equal(p.status, "not_configured");
    assert.deepEqual(p.quota, {
      state: "unknown",
      remaining: null,
      unit: null,
      source: null,
      observedAt: null,
      resetAt: null,
    });
  }
});

test("exact diff approval records persist and fail closed on scope, bytes, expiry and input", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "approval-"));
  const file = join(dir, "app.db");
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  let s = new Store(file, () => 1000);
  const p = s.createProject({name:"A", root:"", master:"codex"});
  const task = s.createTask({projectId:p.id, title:"Review", implementer:"codex", reviewer:"claude"});
  const input = {projectId:p.id, taskId:task.id, attempt:0, diff:Buffer.from("diff\n"), decision:"approved", approver:"local-user", expiresAt:2000};
  const record = s.approvals.record(input);
  assert.match(record.diffHash, /^[a-f0-9]{64}$/);
  assert.ok(s.approvals.matches({...input, id:record.id}));
  assert.equal(s.approvals.matches({...input, id:record.id, diff:Buffer.from("diff\r\n")}), false);
  assert.equal(s.approvals.matches({...input, id:record.id, attempt:1}), false);
  const b = s.createProject({name:"B", root:"", master:"claude"});
  assert.throws(() => s.approvals.record({...input, projectId:b.id}));
  assert.equal(s.approvals.matches({...input, id:record.id, projectId:b.id}), false);
  for (const change of [{diff:"diff"}, {diff:Buffer.alloc(0)}, {decision:"yes"}, {approver:" "}, {attempt:-1}, {attempt:1}, {expiresAt:1000}, {expiresAt:Infinity}, {diffHash:"a".repeat(64)}])
    assert.throws(() => s.approvals.record({...input,...change}));
  const rejected = s.approvals.record({...input,decision:"rejected"});
  assert.equal(s.approvals.matches({...input,id:rejected.id}), false);
  assert.equal(s.tasks(p.id)[0].status,"draft");
  assert.deepEqual(Object.keys(s.projectData(p.id)).sort(), ["events","memory","tasks"]);
  s.close();
  s = new Store(file, () => 1999);
  assert.deepEqual(s.approvals.list(p.id,task.id)[0],record);
  assert.ok(s.approvals.matches({...input,id:record.id}));
  s.close();
  s = new Store(file, () => 2000);
  assert.equal(s.approvals.matches({...input,id:record.id}), false);
  s.close();
});

test("approval v2 migration preserves data; SQLite rejects mutation and malformed hashes", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "approval-migration-"));
  const file = join(dir,"app.db");
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  let s = new Store(file,()=>1000);
  const p = s.createProject({name:"Keep",root:"",master:"codex"});
  const task = s.createTask({projectId:p.id,title:"Keep task",implementer:"codex",reviewer:"claude"});
  s.createMemory({projectId:p.id,content:"Keep memory",source:"user"});
  s.close();
  const db = new DatabaseSync(file);
  // Reconstruct the previous schema by removing only this slice's objects.
  db.exec("DROP TABLE approval_records; PRAGMA user_version=2");
  s = new Store(file,()=>1000);
  t.after(()=>{s.close();db.close();});
  assert.equal(db.prepare("PRAGMA user_version").get().user_version,3);
  assert.equal(s.tasks(p.id)[0].title,"Keep task");
  assert.equal(s.memory(p.id)[0].content,"Keep memory");
  const input = {projectId:p.id,taskId:task.id,attempt:0,diff:Buffer.from("bytes"),decision:"approved",approver:"user",expiresAt:3000};
  const record = s.approvals.record(input);
  assert.throws(()=>db.prepare("UPDATE approval_records SET decision='rejected' WHERE id=?").run(record.id), /IMMUTABLE_APPROVAL/);
  assert.throws(()=>db.prepare("DELETE FROM approval_records WHERE id=?").run(record.id), /IMMUTABLE_APPROVAL/);
  assert.throws(()=>db.prepare("INSERT INTO approval_records VALUES(?,?,?,?,?,?,?,?,?)").run("bad",p.id,task.id,0,"z".repeat(64),"approved","user",1000,3000));
  s.taskAction({projectId:p.id,id:task.id,action:"queue"});
  s.lifecycle.claim({projectId:p.id,id:task.id,owner:"worker",ttlMs:1000});
  assert.equal(s.approvals.matches({...input,id:record.id}),false);
  assert.equal(s.approvals.list(p.id,task.id).length,1);
});

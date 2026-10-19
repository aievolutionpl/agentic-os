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

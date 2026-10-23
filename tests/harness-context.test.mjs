import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { Store } from "../dist/main/store.js";
import { inspectBackup } from "../dist/main/backup.js";
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-context-"));
  let store = new Store(join(dir, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return {
    get store() {
      return store;
    },
    dir,
    reopen() {
      store.close();
      store = new Store(join(dir, "db.sqlite"));
      return store;
    },
  };
}
const settings = (overrides = {}) => ({
  instructions: "Report test evidence.",
  autoRecall: true,
  recallLimit: 4,
  revision: 0,
  ...overrides,
});
const project = (s, name = "Project A") =>
  s.createProject({ name, root: "", master: "codex" });
const note = (s, p, content, extra = {}) =>
  s.createMemory({
    projectId: p.id,
    content,
    source: "user:decision",
    ...extra,
  });
test("harness settings survive restart, redact credentials and reject stale concurrent saves", (t) => {
  const f = setup(t);
  f.store.harness.set(
    settings({ instructions: "key sk-secret-abcdefghijklmnop" }),
  );
  const saved = f.reopen().harness.get();
  assert.equal(saved.revision, 1);
  assert.ok(!saved.instructions.includes("sk-secret"));
  assert.throws(
    () => f.store.harness.set(settings()),
    /HARNESS_SETTINGS_CONFLICT/,
  );
  assert.equal(f.store.harness.get().revision, 1);
  assert.equal(f.store.harness.set(settings({ revision: 1 })).revision, 2);
});
test("harness rejects invalid limits, unknown fields and oversized instructions without mutating settings", (t) => {
  const { store } = setup(t);
  for (const input of [
    settings({ recallLimit: -1 }),
    settings({ recallLimit: 9 }),
    settings({ recallLimit: 1.5 }),
    settings({ autoRecall: "true" }),
    settings({ instructions: "x".repeat(6001) }),
    settings({ extra: true }),
    settings({ revision: -1 }),
  ])
    assert.throws(() => store.harness.set(input), /INVALID_INPUT/);
  assert.equal(store.harness.get().revision, 0);
});
test("all workflows get the same versioned core, scoped recall, sources and reproducible fingerprint", (t) => {
  const { store } = setup(t),
    a = project(store),
    b = project(store, "Private B");
  const pinned = note(store, a, "Use accessible controls");
  store.updateMemory({
    projectId: a.id,
    id: pinned.id,
    content: pinned.content,
    scope: "project",
    pinned: true,
  });
  const selected = note(store, a, "Explicit design decision");
  const recalled = note(store, a, "Retries require idempotency");
  note(store, b, "Retries PRIVATE OTHER PROJECT");
  const shared = note(store, b, "Retries share trace IDs", {
    scope: "workspace",
  });
  store.harness.set(settings());
  for (const workflow of ["implementation", "bugfix", "research", "audit"]) {
    const result = store.knowledge.build(
      a.id,
      [selected.id],
      workflow,
      [],
      "Retries",
    );
    assert.match(result.body, new RegExp(`^Workflow: ${workflow}\\n`));
    assert.match(result.body, /AI Evolution Polska/);
    assert.match(result.body, /Report test evidence/);
    assert.ok(!result.body.includes("PRIVATE OTHER PROJECT"));
    assert.equal(
      result.manifest.find((e) => e.id === pinned.id).reason,
      "pinned",
    );
    assert.equal(
      result.manifest.find((e) => e.id === selected.id).reason,
      "selected",
    );
    for (const id of [recalled.id, shared.id])
      assert.equal(result.manifest.find((e) => e.id === id).reason, "recalled");
    assert.equal(result.harnessRevision, 1);
    assert.equal(
      result.characters,
      result.manifest.reduce((n, e) => n + e.characters, 0) +
        (result.manifest.length - 1) * 2,
    );
    assert.equal(
      result.fingerprint,
      createHash("sha256").update(result.body).digest("hex"),
    );
    assert.equal(result.readOnly, ["research", "audit"].includes(workflow));
  }
  assert.throws(
    () => store.knowledge.build(a.id, [shared.id, "missing"]),
    /INVALID_CONTEXT/,
  );
});
test("automatic recall deduplicates notes, honors the limit/off switch and leaves pins intact", (t) => {
  const { store } = setup(t),
    a = project(store);
  const n = note(store, a, "Retries use exponential backoff");
  note(store, a, "Retries   use exponential backoff");
  note(store, a, "Retries require cancellation");
  store.harness.set(settings({ recallLimit: 1 }));
  let result = store.knowledge.build(a.id, [], "research", [], "Retries");
  assert.equal(result.memoryIds.length, 1);
  assert.ok(result.recallSkipped >= 1);
  store.harness.set(settings({ revision: 1, recallLimit: 8 }));
  result = store.knowledge.build(a.id, [], "research", [], "Retries");
  assert.equal(result.memoryIds.length, 2);
  store.updateMemory({
    projectId: a.id,
    id: n.id,
    content: n.content,
    pinned: true,
    scope: "project",
  });
  store.harness.set(settings({ revision: 2, autoRecall: false }));
  assert.deepEqual(
    store.knowledge.build(a.id, [], "research", [], "Retries").memoryIds,
    [n.id],
  );
});
test("memory budget cannot silently truncate selected instructions; recalled content reports truncation", (t) => {
  const { store } = setup(t),
    p = project(store);
  const large = note(store, p, "Retries " + "x".repeat(15000));
  const result = store.knowledge.build(p.id, [], "research", [], "Retries");
  assert.equal(result.manifest.find((e) => e.id === large.id).truncated, true);
  assert.ok(result.characters <= result.limit);
  const other = note(store, p, "y".repeat(15000));
  assert.throws(
    () => store.knowledge.build(p.id, [large.id, other.id]),
    /CONTEXT_BUDGET_EXCEEDED/,
  );
});
test("project export never combines private notes from other projects or elevates pins into rules", (t) => {
  const { store } = setup(t),
    a = project(store),
    b = project(store, "B");
  note(store, a, "VISIBLE key sk-secret-abcdefghijklmnop");
  note(store, b, "PRIVATE CLIENT B");
  note(store, b, "SHARED STANDARD", { scope: "workspace" });
  const body = store.knowledge.export(a.id);
  assert.match(body, /VISIBLE/);
  assert.match(body, /SHARED STANDARD/);
  assert.ok(!body.includes("PRIVATE CLIENT B"));
  assert.ok(!body.includes("sk-secret"));
  assert.match(body, /attributed reference data/);
  assert.throws(() => store.knowledge.export("missing"), /PROJECT_NOT_FOUND/);
});
test("v16 database upgrades without losing notes and backup validation requires the new table", (t) => {
  const f = setup(t),
    p = project(f.store);
  note(f.store, p, "Keep the decision");
  const db = new DatabaseSync(join(f.dir, "db.sqlite"));
  db.exec("DROP TABLE harness_settings; PRAGMA user_version=16");
  db.close();
  assert.equal(f.reopen().memory(p.id)[0].content, "Keep the decision");
  assert.equal(f.store.harness.get().revision, 0);
  const target = join(f.dir, "backup.sqlite");
  f.store.snapshot(target);
  assert.equal(inspectBackup(target).schema, 17);
  const broken = new DatabaseSync(target);
  broken.exec("DROP TABLE harness_settings");
  broken.close();
  assert.throws(() => inspectBackup(target), /BACKUP_INCOMPLETE/);
});

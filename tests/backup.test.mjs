import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../dist/main/store.js";
import {
  DATABASE,
  applyPendingRestore,
  createBackup,
  diagnostics,
  inspectBackup,
  stageRestore,
} from "../dist/main/backup.js";

function dirs(t) {
  const root = mkdtempSync(join(tmpdir(), "agenting-backup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function seed(store, name) {
  const project = store.createProject({ name, root: "", master: "codex" });
  store.createMemory({
    projectId: project.id,
    content: `memory of ${name}`,
    source: "test",
  });
  store.createTask({
    projectId: project.id,
    title: `task of ${name}`,
    implementer: "codex",
    reviewer: "claude",
  });
  return project;
}

test("backup snapshots the live database and restore replaces it only at the next start, keeping the old one", (t) => {
  const root = dirs(t);
  // Source machine: two projects.
  const source = new Store(join(root, "source.sqlite"));
  seed(source, "Alpha");
  seed(source, "Beta");
  const backup = join(root, "backup.sqlite");
  const summary = createBackup(source, backup);
  source.close();
  assert.deepEqual(
    [summary.projects, summary.tasks, summary.memory, summary.schema],
    [2, 2, 2, 14],
  );
  // Target machine: different data, open while the restore is staged.
  const target = join(root, "target");
  mkdirSync(target);
  let store = new Store(join(target, DATABASE));
  seed(store, "Local");
  assert.equal(stageRestore(target, backup).projects, 2);
  assert.deepEqual(
    store.projects().map((p) => p.name),
    ["Local"],
    "staging never touches the live database",
  );
  store.close();
  assert.equal(
    applyPendingRestore(target, () => 42),
    "restored",
  );
  store = new Store(join(target, DATABASE));
  assert.deepEqual(
    store
      .projects()
      .map((p) => p.name)
      .sort(),
    ["Alpha", "Beta"],
  );
  store.close();
  const previous = new Store(join(target, `${DATABASE}.before-restore-42`));
  assert.deepEqual(
    previous.projects().map((p) => p.name),
    ["Local"],
    "the replaced database is kept so the restore can be undone",
  );
  previous.close();
  assert.equal(applyPendingRestore(target), "none", "applied exactly once");
});

test("invalid files are refused before staging and a corrupted pending restore is set aside", (t) => {
  const root = dirs(t);
  const junk = join(root, "junk.sqlite");
  writeFileSync(junk, "not a database at all");
  assert.throws(() => inspectBackup(junk), /BACKUP_CORRUPT/);
  assert.throws(
    () => inspectBackup(join(root, "missing.sqlite")),
    /BACKUP_NOT_FOUND/,
  );
  const other = join(root, "other.sqlite");
  const db = new DatabaseSync(other);
  db.exec("CREATE TABLE notes(x); PRAGMA user_version=3");
  db.close();
  assert.throws(() => inspectBackup(other), /BACKUP_NOT_AGENTING/);
  const newer = join(root, "newer.sqlite");
  const store = new Store(newer);
  store.close();
  const raw = new DatabaseSync(newer);
  raw.exec("PRAGMA user_version=99");
  raw.close();
  assert.throws(() => inspectBackup(newer), /BACKUP_UNSUPPORTED_SCHEMA/);
  assert.throws(() => stageRestore(root, junk), /BACKUP_CORRUPT/);
  assert.equal(existsSync(join(root, `${DATABASE}.restore`)), false);
  // A pending file damaged after staging is rejected at start-up.
  const current = new Store(join(root, DATABASE));
  seed(current, "Keep");
  current.close();
  writeFileSync(join(root, `${DATABASE}.restore`), "damaged later");
  assert.equal(
    applyPendingRestore(root, () => 7),
    "rejected",
  );
  assert.ok(existsSync(join(root, `${DATABASE}.restore-rejected-7`)));
  const kept = new Store(join(root, DATABASE));
  assert.deepEqual(
    kept.projects().map((p) => p.name),
    ["Keep"],
  );
  kept.close();
});

test("an older-schema backup restores and migrates forward", (t) => {
  const root = dirs(t);
  const old = join(root, "old.sqlite");
  const store = new Store(old);
  seed(store, "Legacy");
  store.close();
  const raw = new DatabaseSync(old);
  raw.exec(
    "DROP TABLE capability_checks; DROP TABLE batch_events; DROP TABLE batches; PRAGMA user_version=12",
  );
  raw.close();
  assert.equal(inspectBackup(old).schema, 12);
  stageRestore(root, old);
  assert.equal(applyPendingRestore(root), "restored");
  const restored = new Store(join(root, DATABASE));
  assert.deepEqual(
    restored.projects().map((p) => p.name),
    ["Legacy"],
  );
  assert.deepEqual(restored.capabilities.list(), []);
  restored.close();
});

test("diagnostics carry counts and states but no content, paths or credentials", (t) => {
  const root = dirs(t);
  const store = new Store(join(root, DATABASE));
  t.after(() => store.close());
  const project = seed(store, "Client Secret Project");
  store.createMemory({
    projectId: project.id,
    content: "TOP-SECRET client roadmap",
    source: "notes",
  });
  const task = store.tasks(project.id)[0];
  const run = store.runs.create(
    project.id,
    task.id,
    1,
    "codex",
    "claude",
    { repository: "/r", path: "/r/w", base: "a", head: "a" },
    "private context body",
  );
  store.runs.update(project.id, run.id, {
    state: "failed",
    error: `crash in ${homedir()}/work with api_key=sk-abcdefghijklmnop1234 at ${root}/x`,
  });
  const bundle = diagnostics(store, {
    version: "0.4.0",
    platform: "linux",
    arch: "x64",
    versions: { electron: "43", node: "22" },
    dataDir: root,
    capabilities: [],
  });
  const text = JSON.stringify(bundle);
  for (const secret of [
    "TOP-SECRET",
    "Client Secret Project",
    "task of",
    "private context body",
    "sk-abcdefghijklmnop1234",
    homedir() + "/work",
    root,
  ])
    assert.ok(!text.includes(secret), `diagnostics leaked ${secret}`);
  assert.equal(bundle.counts.projects, 1);
  assert.equal(bundle.counts.memory, 2);
  assert.equal(bundle.runStates.failed, 1);
  assert.match(bundle.recentErrors[0].error, /\[REDACTED\]/);
  assert.match(bundle.recentErrors[0].error, /~\/work/);
});

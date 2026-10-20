import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  copyFileSync,
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
  writeDiagnostics,
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
  // Close before the directory hook runs: Windows cannot delete an open database.
  store.close();
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

test("the live database is refused as a backup target or restore source and stays intact", (t) => {
  const root = dirs(t);
  const live = join(root, DATABASE);
  const store = new Store(live);
  seed(store, "Live");
  assert.throws(() => createBackup(store, live), /BACKUP_TARGET_IS_LIVE/);
  assert.throws(
    () => createBackup(store, `${live}-wal`),
    /BACKUP_TARGET_IS_LIVE/,
  );
  assert.throws(() => stageRestore(root, live), /BACKUP_SOURCE_IS_LIVE/);
  seed(store, "Still writable");
  assert.equal(store.projects().length, 2);
  // An existing backup file is replaced only after a valid snapshot exists.
  const target = join(root, "backup.sqlite");
  writeFileSync(target, "old");
  assert.equal(createBackup(store, target).projects, 2);
  store.close();
  const reopened = new Store(live);
  assert.deepEqual(
    reopened
      .projects()
      .map((p) => p.name)
      .sort(),
    ["Live", "Still writable"],
  );
  reopened.close();
});

test("staging a restore from a database that is still open keeps rows that live only in its WAL", (t) => {
  const root = dirs(t);
  const sourceFile = join(root, "source.sqlite");
  const source = new Store(sourceFile);
  seed(source, "Committed but not checkpointed");
  assert.ok(existsSync(`${sourceFile}-wal`));
  const target = join(root, "target");
  mkdirSync(target);
  assert.equal(stageRestore(target, sourceFile).projects, 1);
  source.close();
  assert.equal(applyPendingRestore(target), "restored");
  const restored = new Store(join(target, DATABASE));
  assert.deepEqual(
    restored.projects().map((p) => p.name),
    ["Committed but not checkpointed"],
  );
  restored.close();
});

test("a backup missing tables or columns its schema requires is refused", (t) => {
  const root = dirs(t);
  const make = (name, sql) => {
    const file = join(root, name);
    const store = new Store(file);
    seed(store, name);
    store.close();
    const raw = new DatabaseSync(file);
    raw.exec(sql);
    raw.close();
    return file;
  };
  assert.throws(
    () =>
      inspectBackup(
        make("no-runs.sqlite", "DROP TABLE run_events; DROP TABLE runs"),
      ),
    /BACKUP_INCOMPLETE/,
  );
  assert.throws(
    () =>
      inspectBackup(
        make("no-pinned.sqlite", "ALTER TABLE memory DROP COLUMN pinned"),
      ),
    /BACKUP_INCOMPLETE/,
  );
  assert.throws(
    () => stageRestore(root, join(root, "no-runs.sqlite")),
    /BACKUP_INCOMPLETE/,
  );
  assert.equal(existsSync(join(root, `${DATABASE}.restore`)), false);
});

test("diagnostics keep only the executable name even for another platform's path", (t) => {
  const root = dirs(t);
  const file = join(root, DATABASE);
  const store = new Store(file);
  const raw = new DatabaseSync(file);
  raw
    .prepare(
      "INSERT INTO provider_settings(id,command,args,protocol,consent,profile,model) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      "codex",
      "C:\\Users\\Alice\\bin\\codex.cmd",
      "[]",
      "codex",
      1,
      "existing",
      null,
    );
  raw.close();
  const bundle = diagnostics(store, {
    version: "0.4.0",
    platform: "linux",
    arch: "x64",
    versions: {},
    dataDir: root,
    capabilities: [],
  });
  store.close();
  assert.equal(bundle.providers[0].command, "codex.cmd");
  assert.ok(!JSON.stringify(bundle).includes("Alice"));
});

test("diagnostics never overwrite the live database and are written owner-only", (t) => {
  const root = dirs(t);
  const live = join(root, DATABASE);
  const store = new Store(live);
  seed(store, "Live");
  for (const target of [live, `${live}-wal`, `${live}-shm`])
    assert.throws(
      () => writeDiagnostics(target, live, { kind: "x" }),
      /BACKUP_TARGET_IS_LIVE/,
    );
  const file = join(root, "diag.json");
  writeDiagnostics(file, live, { kind: "agenting-os-diagnostics" });
  assert.equal(
    JSON.parse(readFileSync(file, "utf8")).kind,
    "agenting-os-diagnostics",
  );
  if (process.platform !== "win32")
    assert.equal(statSync(file).mode & 0o077, 0);
  assert.deepEqual(
    store.projects().map((p) => p.name),
    ["Live"],
  );
  store.close();
});

test("backups are owner-only and a failed second staging keeps the earlier staged restore", (t) => {
  const root = dirs(t);
  const source = new Store(join(root, "source.sqlite"));
  seed(source, "First choice");
  const backup = join(root, "backup.sqlite");
  createBackup(source, backup);
  source.close();
  if (process.platform !== "win32")
    assert.equal(statSync(backup).mode & 0o077, 0);
  const target = join(root, "target");
  mkdirSync(target);
  stageRestore(target, backup);
  const junk = join(root, "junk.sqlite");
  writeFileSync(junk, "not sqlite");
  assert.throws(() => stageRestore(target, junk), /BACKUP_CORRUPT/);
  assert.equal(
    inspectBackup(join(target, `${DATABASE}.restore`)).projects,
    1,
    "the earlier staged restore survives",
  );
  assert.deepEqual(
    readdirSync(target).filter((f) => f.includes("partial")),
    [],
  );
  assert.equal(applyPendingRestore(target), "restored");
  const restored = new Store(join(target, DATABASE));
  assert.deepEqual(
    restored.projects().map((p) => p.name),
    ["First choice"],
  );
  restored.close();
});

test("a backup with orphaned rows is refused", (t) => {
  const root = dirs(t);
  const file = join(root, "orphans.sqlite");
  const store = new Store(file);
  seed(store, "Parent");
  store.close();
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA foreign_keys=OFF; DELETE FROM projects;");
  raw.close();
  assert.throws(() => inspectBackup(file), /BACKUP_INCONSISTENT/);
});

test("applying a restore keeps the old database as one self-contained file, WAL included", (t) => {
  const root = dirs(t);
  const source = new Store(join(root, "source.sqlite"));
  seed(source, "From backup");
  const backup = join(root, "backup.sqlite");
  createBackup(source, backup);
  source.close();
  const target = join(root, "target");
  mkdirSync(target);
  // Simulate an unclean stop: the old database's newest commits exist only in its WAL.
  // Copy the open pair instead of keeping it open, which Windows would not let us remove.
  const crashed = join(root, "crashed.sqlite");
  const old = new Store(crashed);
  seed(old, "Only in WAL");
  copyFileSync(crashed, join(target, DATABASE));
  copyFileSync(`${crashed}-wal`, join(target, `${DATABASE}-wal`));
  old.close();
  stageRestore(target, backup);
  assert.equal(
    applyPendingRestore(target, () => 9),
    "restored",
  );
  const kept = `${DATABASE}.before-restore-9`;
  assert.deepEqual(
    readdirSync(target)
      .filter((f) => f.startsWith(kept))
      .sort(),
    [kept],
    "no separate -wal/-shm companions for the kept copy",
  );
  const previous = new Store(join(target, kept));
  assert.deepEqual(
    previous.projects().map((p) => p.name),
    ["Only in WAL"],
  );
  previous.close();
  const restored = new Store(join(target, DATABASE));
  assert.deepEqual(
    restored.projects().map((p) => p.name),
    ["From backup"],
  );
  restored.close();
});

test("temporary files are never left behind and use unpredictable names", (t) => {
  const root = dirs(t);
  const store = new Store(join(root, DATABASE));
  seed(store, "P");
  createBackup(store, join(root, "a.sqlite"));
  writeDiagnostics(join(root, "d.json"), store.file, { ok: true });
  stageRestore(join(root), join(root, "a.sqlite"));
  store.close();
  assert.deepEqual(
    readdirSync(root).filter((f) => f.includes("partial")),
    [],
  );
});

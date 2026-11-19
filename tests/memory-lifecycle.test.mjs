import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, SCHEMA_VERSION } from "../dist/main/store.js";

const HOUR = 3_600_000;
function fixture(t, now = { value: Date.now() }) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-memlife-"));
  const file = join(dir, "test.db");
  const s = new Store(file, () => now.value);
  const p = s.createProject({ name: "A", root: "", master: "codex" });
  t.after(() => {
    try {
      s.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return { s, p, now, dir, file };
}
const iso = (ms) => new Date(ms).toISOString();

test("expiry must be a real future time and is stored as ISO", (t) => {
  const { s, p, now } = fixture(t);
  for (const bad of ["tomorrow", "2001-01-01T00:00:00Z", 5, "x".repeat(50)])
    assert.throws(
      () => s.createMemory({ projectId: p.id, content: "n", source: "u", expiresAt: bad }),
      /INVALID_EXPIRY/,
    );
  const m = s.createMemory({
    projectId: p.id,
    content: "Release freeze until Friday",
    source: "user",
    expiresAt: iso(now.value + HOUR),
  });
  assert.equal(m.expiresAt, iso(now.value + HOUR));
  assert.equal(s.memory(p.id)[0].expiresAt, m.expiresAt);
  const none = s.createMemory({ projectId: p.id, content: "No expiry", source: "u" });
  assert.equal(none.expiresAt, null);
});

test("expired notes leave search, pinned context, explicit selection and export", (t) => {
  const { s, p, now } = fixture(t);
  const keep = s.createMemory({ projectId: p.id, content: "alpha stays", source: "u" });
  const temp = s.createMemory({
    projectId: p.id,
    content: "alpha temporary",
    source: "u",
    expiresAt: iso(now.value + HOUR),
  });
  s.updateMemory({ projectId: p.id, id: temp.id, content: "alpha temporary", scope: "project", pinned: true });
  assert.equal(s.knowledge.search(p.id, "alpha").length, 2);
  assert.ok(s.knowledge.build(p.id, [], "research").memoryIds.includes(temp.id));
  assert.match(s.knowledge.export(p.id), /alpha temporary/);

  now.value += 2 * HOUR; // the clock passes the expiry
  assert.deepEqual(s.knowledge.search(p.id, "alpha").map((m) => m.id), [keep.id]);
  assert.deepEqual(s.knowledge.search(p.id, "").map((m) => m.id), [keep.id]);
  assert.equal(s.knowledge.build(p.id, [], "research").memoryIds.includes(temp.id), false);
  assert.throws(() => s.knowledge.build(p.id, [temp.id], "research"), /INVALID_CONTEXT/);
  assert.doesNotMatch(s.knowledge.export(p.id), /alpha temporary/);
  // Nothing was deleted: the Memory screen still lists it.
  assert.equal(s.memory(p.id).length, 2);
});

test("supersede keeps history, moves the pin and hides the old note from context", (t) => {
  const { s, p } = fixture(t);
  const old = s.createMemory({ projectId: p.id, content: "beta uses port 80", source: "audit", scope: "workspace" });
  s.updateMemory({ projectId: p.id, id: old.id, content: old.content, scope: "workspace", pinned: true });
  const next = s.supersedeMemory({ projectId: p.id, id: old.id, content: "beta uses port 8080" });
  assert.equal(next.scope, "workspace");
  assert.equal(next.pinned, 1);
  assert.equal(next.source, "audit");
  const rows = s.memory(p.id);
  const oldRow = rows.find((m) => m.id === old.id);
  assert.equal(oldRow.supersededBy, next.id);
  assert.equal(oldRow.pinned, 0);
  const found = s.knowledge.search(p.id, "beta").map((m) => m.id);
  assert.deepEqual(found, [next.id]);
  const ctx = s.knowledge.build(p.id, [], "research");
  assert.deepEqual(ctx.memoryIds, [next.id]);
  assert.doesNotMatch(ctx.body, /port 80\b(?!80)/);
  assert.throws(() => s.knowledge.build(p.id, [old.id], "research"), /INVALID_CONTEXT/);
  assert.throws(
    () => s.supersedeMemory({ projectId: p.id, id: old.id, content: "again" }),
    /MEMORY_ALREADY_SUPERSEDED/,
  );
  assert.equal(s.memory(p.id).length, 2);
});

test("supersede is scoped to the project, validated and atomic", (t) => {
  const { s, p } = fixture(t);
  const other = s.createProject({ name: "B", root: "", master: "codex" });
  const m = s.createMemory({ projectId: p.id, content: "gamma", source: "u" });
  assert.throws(
    () => s.supersedeMemory({ projectId: other.id, id: m.id, content: "x" }),
    /MEMORY_NOT_FOUND/,
  );
  assert.throws(() => s.supersedeMemory({ projectId: p.id, id: m.id, content: " " }), /INVALID_INPUT/);
  assert.throws(
    () => s.supersedeMemory({ projectId: p.id, id: m.id, content: "x", expiresAt: "2001-01-01T00:00:00Z" }),
    /INVALID_EXPIRY/,
  );
  assert.throws(() => s.supersedeMemory("nope"), /INVALID_INPUT/);
  // A refused call changed nothing and left no half-written replacement.
  assert.equal(s.memory(p.id).length, 1);
  assert.equal(s.memory(p.id)[0].supersededBy, null);
  // The transaction was closed: later writes still work.
  s.createMemory({ projectId: p.id, content: "after", source: "u" });
  assert.equal(s.memory(p.id).length, 2);
});

test("schema v18 migrates to v19 without losing notes and rejects newer schemas", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const { s, p, file } = fixture(t);
  s.createMemory({ projectId: p.id, content: "keep me", source: "u" });
  s.close();
  const db = new DatabaseSync(file);
  db.exec("ALTER TABLE memory DROP COLUMN expiresAt; ALTER TABLE memory DROP COLUMN supersededBy; PRAGMA user_version=18");
  db.close();
  const again = new Store(file);
  const check = new DatabaseSync(file);
  assert.equal(check.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
  assert.equal(again.memory(p.id)[0].content, "keep me");
  assert.equal(again.memory(p.id)[0].supersededBy, null);
  again.close();
  check.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`);
  assert.throws(() => new Store(file), /UNSUPPORTED_SCHEMA/);
  check.close();
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../dist/main/store.js";
import { capabilityMatrix } from "../dist/main/capabilities.js";

const connector = (id, patch = {}) => ({
  id,
  name: id,
  kind: "cli",
  state: "ready",
  reason: "ok",
  installed: true,
  path: `/bin/${id}`,
  version: "1.0.0",
  auth: "authenticated",
  account: null,
  authMethod: null,
  plan: null,
  adapter: "available",
  models: [],
  installHint: null,
  quota: { state: "unknown" },
  observedAt: "2026-10-20T00:00:00.000Z",
  ...patch,
});
const setting = (id) => ({ id, configured: true, command: `/bin/${id}` });
const row = (matrix, agent) => matrix.find((c) => c.agent === agent);

test("capability matrix keeps detection, sign-in, handshake and real inference as separate facts", () => {
  const matrix = capabilityMatrix(
    [
      connector("codex"),
      connector("claude", { auth: "unauthenticated" }),
      connector("gemini", { auth: "unknown" }),
      connector("hermes"),
      connector("antigravity", { installed: false, auth: "not-applicable" }),
    ],
    ["codex", "claude", "gemini", "hermes"].map(setting),
    {
      checks: [
        {
          agent: "codex",
          state: "connected",
          detail: "CLI_SIGN_IN_VERIFIED",
          models: 0,
          observedAt: "2026-10-20T00:00:00.000Z",
        },
        {
          agent: "gemini",
          state: "connected",
          detail: "ACP_READY",
          models: 3,
          observedAt: "2026-10-20T00:00:00.000Z",
        },
      ],
      runs: [
        { provider: "codex", successes: 2, lastSuccessAt: 5, lastFailureAt: 1 },
        {
          provider: "hermes",
          successes: 0,
          lastSuccessAt: null,
          lastFailureAt: 9,
        },
      ],
    },
  );
  assert.equal(matrix.length, 7, "every supported agent is listed");
  const codex = row(matrix, "codex");
  assert.deepEqual(
    [
      codex.auth,
      codex.handshake,
      codex.live,
      codex.verdict,
      codex.successfulRuns,
    ],
    ["verified", "passed", "passed", "verified", 2],
  );
  assert.equal(row(matrix, "claude").verdict, "needs-auth");
  const gemini = row(matrix, "gemini");
  assert.deepEqual(
    [gemini.auth, gemini.handshake, gemini.live, gemini.verdict, gemini.models],
    ["verified", "passed", "not_tested", "unverified", 3],
    "a handshake without a real finished run is not verified",
  );
  const hermes = row(matrix, "hermes");
  assert.deepEqual(
    [hermes.auth, hermes.handshake, hermes.live, hermes.verdict],
    ["reported", "not_tested", "failed", "unverified"],
    "CLI-reported sign-in is not the same as a verified one",
  );
  assert.deepEqual(
    hermes.roles,
    ["implementer"],
    "Hermes has no read-only role",
  );
  assert.deepEqual(codex.roles, ["implementer", "reviewer", "master"]);
  assert.equal(row(matrix, "antigravity").verdict, "needs-install");
  const stale = capabilityMatrix([connector("codex")], [], {
    checks: [
      {
        agent: "codex",
        state: "connected",
        detail: "CLI_SIGN_IN_VERIFIED",
        models: 0,
        observedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    runs: [],
  });
  assert.deepEqual(
    [row(stale, "codex").auth, row(stale, "codex").handshake],
    ["reported", "not_tested"],
    "a check of a removed profile is not current evidence",
  );
  assert.equal(row(matrix, "opencode").verdict, "needs-install");
  assert.equal(row(matrix, "local").verdict, "needs-install");
});

test("connection checks persist and real-run evidence ignores interrupted and cancelled runs", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-cap-"));
  let store = new Store(join(dir, "db.sqlite"));
  t.after(() => {
    try {
      store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  store.capabilities.record({
    agent: "codex",
    state: "needs-auth",
    detail: "SIGN_IN_REQUIRED",
    models: [],
    observedAt: "2026-10-20T00:00:00.000Z",
  });
  store.capabilities.record({
    agent: "codex",
    state: "connected",
    detail: "CLI_SIGN_IN_VERIFIED",
    models: [{ id: "m", name: "M" }],
    observedAt: "2026-10-20T01:00:00.000Z",
  });
  const project = store.createProject({
    name: "P",
    root: "/r",
    master: "codex",
  });
  const states = [
    "interrupted",
    "cancelled",
    "failed",
    "completed",
    "rejected",
  ];
  for (const [i, state] of states.entries()) {
    const task = store.createTask({
      projectId: project.id,
      title: `T${i}`,
      implementer: "codex",
      reviewer: "claude",
    });
    const run = store.runs.create(
      project.id,
      task.id,
      1,
      "codex",
      "claude",
      { repository: "/r", path: "/r/w", base: "a", head: "a" },
      "",
    );
    store.runs.update(project.id, run.id, {
      state,
      ...(i === 3 && { reviewState: "completed" }),
      ...(i === 4 && { reviewState: "failed" }),
    });
    if (i === 3) store.runs.event(run.id, "review_outcome", "completed");
    if (i === 4) store.runs.event(run.id, "review_outcome", "failed");
  }
  store.close();
  store = new Store(join(dir, "db.sqlite"));
  assert.deepEqual(store.capabilities.list(), [
    {
      agent: "codex",
      state: "connected",
      detail: "CLI_SIGN_IN_VERIFIED",
      models: 1,
      observedAt: "2026-10-20T01:00:00.000Z",
    },
  ]);
  const [codex] = store.runs.evidence();
  assert.equal(codex.provider, "codex");
  assert.equal(codex.successes, 2);
  assert.ok(codex.lastSuccessAt);
  assert.ok(codex.lastFailureAt);
  // Reviewer history counts only the reviews an agent actually did.
  const reviews = store.runs.evidence("reviewer");
  assert.deepEqual(
    reviews.map((r) => [r.provider, r.successes]),
    [["claude", 1]],
  );
  assert.ok(reviews[0].lastSuccessAt);
  assert.ok(reviews[0].lastFailureAt);
  // A later run update (approval, apply) does not move the review outcome.
  const before = reviews[0].lastSuccessAt;
  const reviewed = store
    .tasks(project.id)
    .map((t) => store.runs.list(project.id, t.id)[0])
    .find((r) => r?.reviewState === "completed");
  await new Promise((r) => setTimeout(r, 5));
  store.runs.update(project.id, reviewed.id, { state: "applied" });
  assert.equal(store.runs.evidence("reviewer")[0].lastSuccessAt, before);
  const failedAt = store.runs.evidence("reviewer")[0].lastFailureAt;
  // A review aborted by a stop or shutdown is not the reviewer's failure;
  // a review from before outcome events still counts by its last update.
  const extra = (title) => {
    const task = store.createTask({
      projectId: project.id,
      title,
      implementer: "codex",
      reviewer: "claude",
    });
    return store.runs.create(
      project.id,
      task.id,
      1,
      "codex",
      "claude",
      { repository: "/r", path: "/r/w", base: "a", head: "a" },
      "",
    );
  };
  await new Promise((r) => setTimeout(r, 5));
  const aborted = extra("aborted");
  store.runs.update(project.id, aborted.id, { reviewState: "failed" });
  store.runs.event(aborted.id, "review_outcome", "interrupted");
  assert.equal(store.runs.evidence("reviewer")[0].lastFailureAt, failedAt);
  const legacy = extra("legacy");
  store.runs.update(project.id, legacy.id, { reviewState: "failed" });
  assert.equal(
    store.runs.evidence("reviewer")[0].lastFailureAt,
    store.runs.get(project.id, legacy.id).updatedAt,
  );
  // A late, older probe never replaces newer evidence.
  store.capabilities.record({
    agent: "codex",
    state: "needs-auth",
    detail: "SIGN_IN_REQUIRED",
    models: [],
    observedAt: "2026-10-20T00:00:00.000Z",
  });
  assert.equal(store.capabilities.list()[0].state, "connected");
  // Reconfiguring an agent drops its check so old evidence never lights a new setup.
  store.capabilities.clear("codex");
  assert.deepEqual(store.capabilities.list(), []);
});

test("schema v13 migrates to v14 and keeps the orchestration journal", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-cap-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let store = new Store(join(dir, "db.sqlite"));
  const project = store.createProject({
    name: "P",
    root: "/r",
    master: "codex",
  });
  store.close();
  const db = new DatabaseSync(join(dir, "db.sqlite"));
  db.exec("DROP TABLE capability_checks; PRAGMA user_version=13");
  db.close();
  store = new Store(join(dir, "db.sqlite"));
  assert.deepEqual(store.capabilities.list(), []);
  assert.equal(store.projects()[0].id, project.id);
  assert.equal(store.batches.latest(project.id), null);
  store.close();
});

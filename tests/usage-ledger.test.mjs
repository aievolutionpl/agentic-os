import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store, SCHEMA_VERSION } from "../dist/main/store.js";
import { tokenMeter } from "../dist/main/usage-ledger.js";
import { Supervisor } from "../dist/main/supervisor.js";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-usage-"));
  let store = new Store(join(dir, "store.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return {
    dir,
    get store() {
      return store;
    },
    reopen: () => (store = new Store(join(dir, "store.sqlite"))),
  };
}
const entry = (over = {}) => ({
  agent: "claude",
  role: "chat",
  projectId: null,
  runId: null,
  outcome: "completed",
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  paid: false,
  ...over,
});

test("token meter sums reports and never turns silence or junk into zero", () => {
  const m = tokenMeter();
  assert.deepEqual(m.read(), {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  });
  m.observe("message", JSON.stringify({ input: 9 }));
  m.observe("tokens", "not json");
  m.observe("tokens", JSON.stringify({ input: -5, output: "7" }));
  assert.deepEqual(m.read(), {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  });
  m.observe("tokens", JSON.stringify({ input: 100, output: 20 }));
  m.observe("tokens", JSON.stringify({ input: 50, output: 5, total: 60 }));
  assert.deepEqual(m.read(), {
    inputTokens: 150,
    outputTokens: 25,
    totalTokens: 60,
  });
});

test("ledger keeps unknown usage unknown in entries and summaries", (t) => {
  const f = setup(t);
  f.store.usage.record(entry());
  f.store.usage.record(entry({ inputTokens: 100, outputTokens: 40 }));
  f.store.usage.record(entry({ agent: "codex", outcome: "failed" }));
  const recent = f.store.usage.recent();
  assert.equal(recent.length, 3);
  assert.equal(recent[0].agent, "codex");
  assert.equal(recent[0].source, "unknown");
  assert.equal(recent[0].inputTokens, null);
  assert.equal(recent[1].source, "cli-stream");
  const summary = f.store.usage.summary(0);
  const claude = summary.find((s) => s.agent === "claude");
  assert.deepEqual(
    [
      claude.invocations,
      claude.measured,
      claude.unmeasured,
      claude.inputTokens,
      claude.totalTokens,
    ],
    [2, 1, 1, 100, 140],
  );
  // An agent with no measured invocation has unknown totals, not zero.
  const codex = summary.find((s) => s.agent === "codex");
  assert.deepEqual(
    [codex.unmeasured, codex.inputTokens, codex.totalTokens],
    [1, null, null],
  );
  // The database refuses impossible values.
  assert.throws(() => f.store.usage.record(entry({ inputTokens: -1 })));
  assert.throws(() => f.store.usage.record(entry({ role: "owner" })));
});

test("ledger migrates v15 to v16 without losing data", (t) => {
  const f = setup(t);
  const project = f.store.createProject({
    name: "Kept",
    root: f.dir,
    master: "codex",
  });
  f.store.close();
  const db = new DatabaseSync(join(f.dir, "store.sqlite"));
  db.exec("DROP TABLE usage_ledger; PRAGMA user_version=15");
  db.close();
  const store = f.reopen();
  assert.deepEqual(store.usage.recent(), []);
  assert.ok(store.projects().some((p) => p.id === project.id));
  const check = new DatabaseSync(join(f.dir, "store.sqlite"));
  assert.equal(
    check.prepare("PRAGMA user_version").get().user_version,
    SCHEMA_VERSION,
  );
  check.close();
});

test("every chat invocation writes one ledger row, measured or not, success or failure", async (t) => {
  const f = setup(t);
  let reports = [];
  const supervisor = new Supervisor(f.store, join(f.dir, "app"), () => ({
    async run(input) {
      for (const r of reports) input.activity("tokens", JSON.stringify(r));
      if (input.prompt === "fail") throw Error("PROVIDER_TURN_FAILED");
      return { threadId: "t", turnId: "u", summary: "ok" };
    },
    close() {},
    async stopped() {
      return true;
    },
  }));
  supervisor.paid = (agent) => agent === "opencode";
  const signal = new AbortController().signal;
  reports = [{ input: 10, output: 2 }];
  await supervisor.conversation("claude", f.dir, "hi", true, signal, () => {});
  reports = [];
  await assert.rejects(
    supervisor.conversation("opencode", f.dir, "fail", true, signal, () => {}),
    /PROVIDER_TURN_FAILED/,
  );
  const [failed, ok] = f.store.usage.recent();
  assert.deepEqual(
    [ok.agent, ok.role, ok.outcome, ok.inputTokens, ok.source, ok.paid],
    ["claude", "chat", "completed", 10, "cli-stream", false],
  );
  assert.deepEqual(
    [
      failed.agent,
      failed.outcome,
      failed.inputTokens,
      failed.source,
      failed.paid,
    ],
    ["opencode", "failed", null, "unknown", true],
  );
  await supervisor.close();
});

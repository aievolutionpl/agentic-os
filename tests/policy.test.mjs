import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store, SCHEMA_VERSION } from "../dist/main/store.js";
import {
  evaluatePolicy,
  PaidApprovals,
  DEFAULT_POLICY,
} from "../dist/main/policy.js";
import { Chats } from "../dist/main/chats.js";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-policy-"));
  let store = new Store(join(dir, "store.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return {
    dir,
    store,
    // The caller closes the previous store first.
    reopen: () => (store = new Store(join(dir, "store.sqlite"))),
  };
}
const policy = (over = {}) => ({ ...DEFAULT_POLICY, ...over });
const decide = (req, p, spent = null) =>
  evaluatePolicy(
    { agent: "codex", paid: false, approved: false, ...req },
    p,
    spent,
  );

test("policy decisions: allow-list, paid API modes, budget and unknown spend", () => {
  // Subscription agents run freely unless excluded.
  assert.equal(decide({}, policy()).verdict, "allow");
  assert.deepEqual(
    decide({ agent: "claude" }, policy({ allowedAgents: ["codex"] })),
    {
      verdict: "deny",
      reasons: ["POLICY_AGENT_NOT_ALLOWED"],
    },
  );
  assert.equal(
    decide({}, policy({ allowedAgents: ["codex"] })).verdict,
    "allow",
  );
  // The allow-list applies to paid agents too, before any spend question.
  assert.equal(
    decide(
      { agent: "opencode", paid: true },
      policy({ allowedAgents: ["codex"], paidApi: "allow" }),
    ).reasons[0],
    "POLICY_AGENT_NOT_ALLOWED",
  );
  const paid = { agent: "opencode", paid: true };
  assert.equal(
    decide(paid, policy({ paidApi: "deny" })).reasons[0],
    "POLICY_PAID_API_DISABLED",
  );
  assert.equal(
    decide({ ...paid, approved: true }, policy({ paidApi: "deny" })).verdict,
    "deny",
  );
  assert.deepEqual(decide(paid, policy({ paidApi: "ask" })).reasons, [
    "POLICY_APPROVAL_REQUIRED",
    "POLICY_PAID_API",
  ]);
  assert.equal(
    decide({ ...paid, approved: true }, policy({ paidApi: "ask" })).verdict,
    "allow",
  );
  assert.equal(decide(paid, policy({ paidApi: "allow" })).verdict, "allow");
  // Budget: known spend under the cap passes, at the cap is refused even when approved.
  const capped = policy({ paidApi: "allow", monthlyBudgetUsd: 10 });
  assert.equal(decide(paid, capped, 9.99).verdict, "allow");
  assert.equal(
    decide({ ...paid, approved: true }, capped, 10).reasons[0],
    "POLICY_BUDGET_EXCEEDED",
  );
  // Unknown spend is not zero: approval is required, and enough once given.
  assert.deepEqual(decide(paid, capped, null).reasons, [
    "POLICY_APPROVAL_REQUIRED",
    "POLICY_SPEND_UNKNOWN",
  ]);
  assert.equal(
    decide({ ...paid, approved: true }, capped, null).verdict,
    "allow",
  );
  // A zero budget blocks every paid run with a known spend.
  assert.equal(
    decide(paid, policy({ paidApi: "allow", monthlyBudgetUsd: 0 }), 0).verdict,
    "deny",
  );
});

test("paid approvals expire and are cleared on rule changes", () => {
  let now = 1000;
  const approvals = new PaidApprovals(60_000, () => now);
  assert.equal(approvals.has("opencode"), false);
  approvals.grant("opencode");
  assert.equal(approvals.has("opencode"), true);
  assert.equal(approvals.has("codex"), false);
  now += 60_001;
  assert.equal(approvals.has("opencode"), false);
  approvals.grant("opencode");
  approvals.revokeAll();
  assert.equal(approvals.has("opencode"), false);
});

test("workspace policy persists, validates input and migrates v14 to v15 without losing data", (t) => {
  const { dir, store, reopen } = setup(t);
  assert.deepEqual(store.policies.get(), DEFAULT_POLICY);
  const saved = store.policies.set({
    allowedAgents: ["codex", "claude"],
    paidApi: "deny",
    monthlyBudgetUsd: 25.5,
  });
  assert.deepEqual(saved.allowedAgents, ["codex", "claude"]);
  for (const bad of [
    { allowedAgents: ["root"], paidApi: "ask", monthlyBudgetUsd: null },
    {
      allowedAgents: ["codex", "codex"],
      paidApi: "ask",
      monthlyBudgetUsd: null,
    },
    { allowedAgents: [], paidApi: "always", monthlyBudgetUsd: null },
    { allowedAgents: [], paidApi: "ask", monthlyBudgetUsd: -1 },
    { allowedAgents: [], paidApi: "ask", monthlyBudgetUsd: Infinity },
    { allowedAgents: [], paidApi: "ask", monthlyBudgetUsd: "5" },
    { allowedAgents: [], paidApi: "ask", monthlyBudgetUsd: null, extra: 1 },
  ])
    assert.throws(() => store.policies.set(bad), /INVALID_INPUT/);
  const project = store.createProject({
    name: "Kept",
    root: dir,
    master: "codex",
  });
  // Downgrade to v14 (drop the new table) and reopen: migration restores it, data stays.
  store.close();
  const db = new DatabaseSync(join(dir, "store.sqlite"));
  db.exec("DROP TABLE workspace_policy; PRAGMA user_version=14");
  db.close();
  const migrated = reopen();
  assert.deepEqual(migrated.policies.get(), DEFAULT_POLICY);
  assert.ok(migrated.projects().some((p) => p.id === project.id));
  const check = new DatabaseSync(join(dir, "store.sqlite"));
  assert.equal(
    check.prepare("PRAGMA user_version").get().user_version,
    SCHEMA_VERSION,
  );
  check.close();
});

test("the gate runs before any agent process starts in chat", async (t) => {
  const { dir, store } = setup(t);
  let spawned = 0;
  const supervisor = {
    settings: () => [{ id: "codex", configured: true }],
    gate: async (agent) => {
      if (agent === "codex") throw Error("POLICY_AGENT_NOT_ALLOWED");
    },
    async conversation(agent) {
      await this.gate(agent);
      spawned++;
      return "never";
    },
  };
  const chats = new Chats(store, supervisor, dir, async () => []);
  const chat = await chats.create({
    agent: "codex",
    mode: "chat",
    source: "default",
  });
  chats.send({
    id: chat.id,
    message: "Hi",
    contextIds: [],
    skillIds: [],
    consent: true,
  });
  for (let i = 0; i < 100 && chats.list()[0].status === "running"; i++)
    await new Promise((r) => setTimeout(r, 10));
  const final = chats.list()[0];
  assert.equal(final.error, "POLICY_AGENT_NOT_ALLOWED");
  assert.equal(spawned, 0);
});

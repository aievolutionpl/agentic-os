import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Store } from "../dist/main/store.js";
import { CliAdapter, cliArguments } from "../dist/main/cli-provider.js";
import { OpenRouterConnection } from "../dist/main/openrouter.js";
import {
  codexQuota,
  openRouterQuota,
  saveCustomSubscription,
  loadCustomSubscriptions,
  scanAllQuotas,
} from "../dist/main/quota.js";
import {
  withExecutionSettings,
  withCheckEvidence,
} from "../dist/main/connectors.js";
import { Orchestrator } from "../dist/main/orchestrator.js";

const temporary = (t, before = () => {}) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-workspace-"));
  t.after(() => {
    before();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return dir;
};
test("quota readings preserve unknown data, multi-bucket windows, reset duration and real daily usage", async (t) => {
  const card = codexQuota(
    {
      rateLimitsByLimitId: {
        codex: {
          primary: {
            usedPercent: 31,
            windowDurationMins: 300,
            resetsAt: 1900000000,
          },
          secondary: null,
        },
        review: { primary: { usedPercent: 80, windowDurationMins: 10080 } },
        bad: { primary: { usedPercent: null, windowDurationMins: 5 } },
      },
    },
    { account: { planType: "plus" } },
    { dailyUsageBuckets: [{ startDate: "2026-10-18", tokens: 2432 }] },
  );
  assert.equal(card.metrics.length, 2);
  assert.equal(card.metrics[0].remainingPercent, 69);
  assert.equal(card.metrics[0].periodSeconds, 18000);
  assert.equal(card.metrics[1].resetsAt, null);
  assert.deepEqual(card.usageTrend, [2432]);
  assert.deepEqual(card.trendLabels, ["2026-10-18"]);
  assert.equal(codexQuota({}).source, "unavailable");
  const all = await scanAllQuotas(temporary(t));
  assert.ok(
    all.every(
      (c) =>
        c.source === "unavailable" &&
        c.metrics.length === 0 &&
        c.usageTrend.length === 0,
    ),
  );
  assert.equal(
    all.find((c) => c.id === "antigravity").status,
    "not_configured",
  );
});
test("OpenRouter key resets use remaining budget instead of lifetime spend; unlimited is unknown, zero is exhausted", () => {
  let card = openRouterQuota({
    data: { usage: 400, limit: 10, limit_remaining: 8 },
  });
  assert.equal(card.metrics[0].usedValue, 2);
  assert.equal(card.metrics[0].remainingPercent, 80);
  card = openRouterQuota({
    data: { usage: 400, limit: null, limit_remaining: null },
  });
  assert.equal(card.metrics[0].limitValue, null);
  assert.equal(card.metrics[0].usedValue, 400);
  assert.equal(
    openRouterQuota({ data: { usage: 0, limit: 0, limit_remaining: 0 } })
      .status,
    "exhausted",
  );
});
test("manual budgets reject invalid data, preserve overrun and migrate plaintext key fields out of legacy records", (t) => {
  const dir = temporary(t),
    input = {
      name: "Budget",
      provider: "custom",
      plan: "Team",
      tokenLimit: 100,
      tokensUsed: 130,
      period: "weekly",
    };
  const saved = saveCustomSubscription(dir, input);
  assert.equal(saved.source, "manual");
  assert.equal(saved.status, "exhausted");
  assert.equal(saved.metrics[0].usedValue, 130);
  assert.equal(saved.metrics[0].resetsAt, null);
  assert.deepEqual(saved.usageTrend, []);
  for (const patch of [
    { tokenLimit: NaN },
    { tokenLimit: 0 },
    { tokensUsed: -1 },
    { id: "codex" },
    { apiKey: "secret" },
    { period: "other" },
    { resetAt: "bad" },
  ])
    assert.throws(() => saveCustomSubscription(dir, { ...input, ...patch }));
  writeFileSync(
    join(dir, "quota_subscriptions.json"),
    JSON.stringify([{ ...input, id: saved.id, apiKey: "legacy-key" }]),
  );
  assert.equal(
    JSON.stringify(loadCustomSubscriptions(dir)).includes("legacy-key"),
    false,
  );
  assert.equal(
    readFileSync(join(dir, "quota_subscriptions.json"), "utf8").includes(
      "apiKey",
    ),
    false,
  );
});
test("OpenRouter vault keeps credentials out of public settings and plaintext disk; unencrypted storage is refused", async (t) => {
  const dir = temporary(t),
    encryptionKey = randomBytes(32),
    iv = randomBytes(12);
  const crypto = {
    available: () => true,
    encrypt: (s) => {
      const c = createCipheriv("aes-256-gcm", encryptionKey, iv);
      const b = Buffer.concat([c.update(s), c.final()]);
      return Buffer.concat([c.getAuthTag(), b]);
    },
    decrypt: (b) => {
      const c = createDecipheriv("aes-256-gcm", encryptionKey, iv);
      c.setAuthTag(b.subarray(0, 16));
      return Buffer.concat([c.update(b.subarray(16)), c.final()]).toString();
    },
  };
  const requests = [],
    key = "sk-or-test-abcdefghijklmnop";
  const router = new OpenRouterConnection(dir, crypto, async (path, token) => {
    requests.push({ path, token });
    return path === "/models"
      ? {
          data: [
            { id: "org/model", name: "Model", context_length: 32000 },
            { id: 42 },
          ],
        }
      : { data: { usage: 1 } };
  });
  assert.throws(
    () => router.save({ apiKey: key, model: "org/model" }),
    /CONSENT/,
  );
  router.save({ apiKey: key, model: "org/model", consent: true });
  assert.equal(JSON.stringify(router.settings()).includes(key), false);
  assert.equal(
    readFileSync(join(dir, "openrouter-connection.json"), "utf8").includes(key),
    false,
  );
  assert.equal(router.environment().OPENROUTER_API_KEY, key);
  router.save({ model: "org/other", consent: true });
  assert.equal(router.environment().OPENROUTER_API_KEY, key);
  assert.equal((await router.models()).length, 1);
  await router.quota();
  assert.deepEqual(requests, [
    { path: "/models", token: undefined },
    { path: "/key", token: key },
  ]);
  assert.throws(
    () =>
      new OpenRouterConnection(dir, { ...crypto, available: () => false }).save(
        { model: "org/model", consent: true },
      ),
    /SECURE_STORAGE/,
  );
  router.remove();
  assert.equal(router.settings().configured, false);
});
test("workspace memory is explicit, searchable and frozen for all providers; project memory stays isolated after restart", (t) => {
  let store;
  const path = join(
    temporary(t, () => store?.close()),
    "db.sqlite",
  );
  store = new Store(path);
  const a = store.createProject({ name: "A", root: "", master: "opencode" });
  const b = store.createProject({ name: "B", root: "", master: "antigravity" });
  const local = store.createMemory({
    projectId: a.id,
    content: "private brand",
    source: "owner",
  });
  const shared = store.createMemory({
    projectId: a.id,
    content: "shared brand",
    source: "owner",
    scope: "workspace",
  });
  assert.deepEqual(
    store.memory(b.id).map((m) => m.id),
    [shared.id],
  );
  assert.deepEqual(
    store.knowledge.search(b.id, "brand").map((m) => m.id),
    [shared.id],
  );
  assert.throws(() => store.knowledge.build(b.id, [local.id]), /CONTEXT/);
  assert.match(
    store.knowledge.build(b.id, [shared.id]).body,
    /scope: workspace/,
  );
  store.close();
  store = new Store(path);
  assert.equal(store.projects().length, 2);
  assert.equal(store.memory(b.id)[0].scope, "workspace");
  assert.throws(
    () => store.deleteMemory({ projectId: b.id, id: shared.id }),
    /NOT_FOUND/,
  );
});
test("native CLI uses stdin, constrained tools and process cancellation; malformed or denied results fail closed", async (t) => {
  const dir = temporary(t),
    fixture = resolve("tests/fixtures/native-cli.mjs");
  for (const protocol of ["claude-cli", "antigravity-cli"]) {
    const adapter = new CliAdapter(
      {
        command: process.execPath,
        args: [fixture],
        cwd: dir,
        env: { QA_PROTOCOL: protocol },
      },
      protocol,
    );
    const activity = [];
    const result = await adapter.run({
      cwd: dir,
      prompt: "secret task $() & remains stdin",
      readOnly: false,
      signal: new AbortController().signal,
      session() {},
      activity: (...args) => activity.push(args),
    });
    assert.match(result.summary, /Completed/);
    assert.equal(await adapter.stopped(), true);
    assert.ok(activity.some(([kind]) => kind === "tokens"));
  }
  assert.ok(cliArguments("claude-cli", true).includes("Read,Glob,Grep"));
  assert.equal(
    cliArguments("claude-cli", false).includes(
      "--dangerously-skip-permissions",
    ),
    false,
  );
  assert.throws(() => cliArguments("antigravity-cli", true), /READ_ONLY/);
  for (const behavior of ["denied", "invalid", "failed", "hang"]) {
    const adapter = new CliAdapter(
      {
        command: process.execPath,
        args: [fixture],
        cwd: dir,
        env: { QA_PROTOCOL: "claude-cli", QA_BEHAVIOR: behavior },
      },
      "claude-cli",
    );
    const controller = new AbortController();
    const timer =
      behavior === "hang" ? setTimeout(() => controller.abort(), 400) : null;
    await assert.rejects(
      adapter.run({
        cwd: dir,
        prompt: "test",
        readOnly: true,
        signal: controller.signal,
        session() {},
        activity() {},
      }),
    );
    if (timer) clearTimeout(timer);
    assert.equal(await adapter.stopped(), true);
  }
});
test("detected CLI is not a configured connection and isolated Codex does not inherit global auth claims", () => {
  const connector = {
    id: "codex",
    installed: true,
    path: "/bin/codex",
    adapter: "available",
    state: "ready",
    auth: "authenticated",
    plan: "pro",
  };
  assert.equal(
    withExecutionSettings([connector], [])[0].reason,
    "connection_required",
  );
  const result = withExecutionSettings(
    [connector],
    [
      {
        id: "codex",
        configured: true,
        command: "/bin/codex",
        profile: "isolated",
      },
    ],
  )[0];
  assert.equal(result.auth, "unknown");
  assert.equal(result.plan, null);
});
test("recorded connection checks give every screen the same agent state", () => {
  const base = {
    id: "codex",
    name: "Codex",
    installed: true,
    adapter: "available",
    state: "experimental",
    reason: "auth_unknown",
    auth: "unknown",
  };
  const check = (state, detail) => [{ agent: "codex", state, detail }];
  let [c] = withCheckEvidence(
    [base],
    check("connected", "CLI_SIGN_IN_VERIFIED"),
  );
  assert.deepEqual(
    [c.state, c.reason, c.auth],
    ["ready", "ok", "authenticated"],
  );
  // A handshake without verified sign-in is ready, but sign-in stays unknown.
  [c] = withCheckEvidence(
    [base],
    check("connected", "ACP_READY_AUTH_UNVERIFIED"),
  );
  assert.deepEqual([c.state, c.auth], ["ready", "unknown"]);
  // A handshake does not make a runtime ready while it cannot run yet.
  assert.deepEqual(
    withCheckEvidence(
      [base],
      check("connected", "ACP_READY_AUTH_UNVERIFIED"),
      (id) => id === "codex",
    )[0],
    base,
  );
  [c] = withCheckEvidence([base], check("needs-auth", "SIGN_IN_REQUIRED"));
  assert.deepEqual([c.state, c.reason], ["needs-auth", "auth_missing"]);
  [c] = withCheckEvidence([base], check("unavailable", "PROVIDER_UNAVAILABLE"));
  assert.equal(c.state, "degraded");
  // Unconfigured, missing, non-runnable or currently failing connectors keep
  // what this scan observed.
  for (const other of [
    { ...base, state: "degraded", reason: "probe_failed" },
    { ...base, auth: "unauthenticated", state: "needs-auth" },
    { ...base, reason: "connection_required" },
    { ...base, installed: false },
    { ...base, adapter: "planned" },
  ])
    assert.deepEqual(
      withCheckEvidence([other], check("connected", "CLI_SIGN_IN_VERIFIED"))[0],
      other,
    );
});
test("orchestrator is finite, shares context, reviews changes and pauses without applying or starting the next task", async (t) => {
  let store;
  store = new Store(
    join(
      temporary(t, () => store?.close()),
      "db.sqlite",
    ),
  );
  const project = store.createProject({
    name: "Queue",
    root: "/fixture",
    master: "codex",
  });
  const memory = store.createMemory({
    projectId: project.id,
    content: "Team convention",
    source: "team",
    scope: "workspace",
  });
  const tasks = [1, 2].map((n) =>
    store.createTask({
      projectId: project.id,
      title: `Task ${n}`,
      implementer: "codex",
      reviewer: "claude",
    }),
  );
  for (const task of tasks)
    store.taskAction({ projectId: project.id, id: task.id, action: "queue" });
  const calls = [];
  let run;
  const supervisor = {
    settings: () => [
      { id: "codex", configured: true },
      { id: "claude", configured: true },
    ],
    start: async (p) => {
      calls.push(["start", p]);
      run = store.runs.create(
        project.id,
        p.taskId,
        1,
        "codex",
        "claude",
        { repository: "/fixture", path: "/fixture/work", base: "a", head: "a" },
        store.knowledge.build(project.id, p.contextIds).body,
      );
      return run;
    },
    waitForRun: async () => {
      store.runs.update(project.id, run.id, { state: "awaiting_review" });
    },
    review: async (p) => {
      calls.push(["review", p]);
    },
    action: async (p) => calls.push(["action", p]),
  };
  const orchestrator = new Orchestrator(store, supervisor);
  assert.throws(
    () =>
      orchestrator.start({
        projectId: project.id,
        taskIds: tasks.map((t) => t.id),
        contextIds: [],
      }),
    /CONSENT/,
  );
  orchestrator.start({
    projectId: project.id,
    taskIds: tasks.map((t) => t.id),
    contextIds: [memory.id],
    consent: true,
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(orchestrator.state({ projectId: project.id }).status, "blocked");
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["start", "review"],
  );
  assert.deepEqual(calls[0][1].contextIds, [memory.id]);
  assert.match(store.runs.context(run.id), /Team convention/);
  orchestrator.close();
});

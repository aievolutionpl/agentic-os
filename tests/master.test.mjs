import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  linkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import {
  MasterAgent,
  parseMissionPlan,
  parseMissionEvaluation,
} from "../dist/main/master-agent.js";
import { LocalModelConnection } from "../dist/main/local-model.js";
import { workspaceEdit, AcpAdapter } from "../dist/main/acp.js";
import { Supervisor } from "../dist/main/supervisor.js";
import { CodexAdapter, boundedCodexConfig } from "../dist/main/providers.js";
import { Applications } from "../dist/main/applications.js";
import { git, gitText } from "../dist/main/git.js";

const plan = () => ({
  summary: "Bounded plan",
  tasks: [
    {
      key: "one",
      title: "Inspect README",
      acceptance: "Report findings",
      implementer: "codex",
      reviewer: "claude",
      dependsOn: [],
      workflow: "research",
    },
  ],
});
const temp = (t, before = () => {}) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-master-"));
  t.after(() => {
    before();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return dir;
};
const settings = () =>
  ["codex", "claude"].map((id) => ({ id, configured: true }));
const input = (projectId) => ({
  projectId,
  master: "codex",
  goal: "Inspect this project",
  workers: ["codex", "claude"],
  contextIds: [],
  skillIds: ["builtin:teamwork"],
  consent: true,
});
const execute = (projectId, id) => ({
  projectId,
  id,
  action: "execute",
  consent: true,
});

test("Codex thread overrides disable inherited MCP/plugins without forwarding secrets or writing config", () => {
  const config = {
    mcp_servers: {
      "server.with.dot": {
        command: "fixture",
        enabled: true,
        env: { API_KEY: "private" },
      },
    },
    plugins: { "plugin@market": { enabled: true } },
  };
  const bounded = boundedCodexConfig(config);
  assert.equal(bounded.mcp_servers["server.with.dot"].enabled, false);
  assert.equal(bounded["features.plugins"], false);
  assert.equal(bounded["features.apps"], false);
  assert.equal(bounded["features.multi_agent"], false);
  assert.equal(JSON.stringify(bounded).includes("private"), false);
  assert.equal(config.mcp_servers["server.with.dot"].enabled, true);
});

test("master validates a bounded DAG, independent review, providers and structured evaluation", () => {
  assert.equal(
    parseMissionPlan(JSON.stringify(plan()), ["codex", "claude"]).steps[0]
      .taskId,
    null,
  );
  for (const mutate of [
    (p) => (p.tasks[0].reviewer = "codex"),
    (p) => (p.tasks[0].implementer = "hermes"),
    (p) => (p.tasks[0].dependsOn = ["one"]),
    (p) => p.tasks.push({ ...p.tasks[0] }),
    (p) => (p.shell = "arbitrary"),
    (p) => (p.tasks[0].workflow = "publish"),
    (p) => (p.tasks = Array(7).fill(p.tasks[0])),
  ]) {
    const p = plan();
    mutate(p);
    assert.throws(() =>
      parseMissionPlan(JSON.stringify(p), ["codex", "claude"]),
    );
  }
  assert.throws(() =>
    parseMissionEvaluation(
      '{"verdict":"approve_and_apply","summary":"ok","nextSteps":""}',
    ),
  );
  assert.equal(
    parseMissionEvaluation(
      '```json\n{"verdict":"needs_changes","summary":"Missing tests","nextSteps":"Run tests"}\n```',
    ).verdict,
    "needs_changes",
  );
});

test("local model configuration rejects remote endpoints and confines OpenCode to the chosen model", (t) => {
  const local = new LocalModelConnection(temp(t));
  assert.throws(() => local.environment(), /NOT_CONFIGURED/);
  for (const baseURL of [
    "https://example.com/v1",
    "http://127.0.0.1.evil/v1",
    "http://user:pass@localhost/v1",
    "http://localhost/v1?key=secret",
    "http://localhost/v1/other",
  ])
    assert.throws(() => local.save({ baseURL, model: "test" }));
  local.save({ baseURL: "http://127.0.0.1:11434/v1/", model: "qwen3.5:9b" });
  const env = local.environment(),
    config = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  assert.deepEqual(config.enabled_providers, ["agenting-local"]);
  assert.equal(config.model, "agenting-local/qwen3.5:9b");
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(config.permission.external_directory, "deny");
  assert.equal(local.settings().configured, true);
  local.remove();
  assert.equal(local.settings().configured, false);
});

test("ACP grants only located in-worktree edits, denies traversal, Git metadata and hardlinks", (t) => {
  const dir = temp(t),
    root = join(dir, "root");
  mkdirSync(root);
  writeFileSync(join(root, "safe.txt"), "safe");
  writeFileSync(join(dir, "outside.txt"), "private");
  linkSync(join(dir, "outside.txt"), join(root, "hardlink.txt"));
  assert.equal(workspaceEdit(root, [{ path: "safe.txt" }]), true);
  assert.equal(workspaceEdit(root, [{ path: "new/folder/file.txt" }]), true);
  for (const locations of [
    [],
    [{ path: "../outside.txt" }],
    [{ path: ".git/config" }],
    [{ path: "hardlink.txt" }],
    [{ path: "safe.txt" }, { path: "../outside.txt" }],
    [{}],
  ])
    assert.equal(workspaceEdit(root, locations), false);
});

test("ACP actual permission exchange permits one scoped edit but never a read-only or outside edit", async (t) => {
  const dir = temp(t);
  for (const [readOnly, path, allow] of [
    [false, "new.txt", true],
    [true, "new.txt", false],
    [false, "../outside.txt", false],
  ]) {
    const adapter = new AcpAdapter({
      command: process.execPath,
      args: [resolve("tests/fixtures/acp-server.mjs")],
      cwd: dir,
      env: { QA_ACP_EDIT: path, QA_EXPECT_ALLOW: allow ? "1" : "0" },
    });
    try {
      const result = await adapter.run({
        cwd: dir,
        prompt: "fixture",
        readOnly,
        signal: new AbortController().signal,
        session() {},
        activity() {},
      });
      assert.match(result.summary, /ACP fixture/);
    } finally {
      adapter.close();
      await adapter.stopped();
    }
  }
});

test("master freezes explicitly selected shared memory, preserves private scope and survives restart", async (t) => {
  const dir = temp(t),
    db = join(dir, "db.sqlite");
  let store = new Store(db);
  const p = store.createProject({ name: "A", root: dir, master: "gemini" }),
    b = store.createProject({ name: "B", root: dir, master: "hermes" });
  const shared = store.createMemory({
    projectId: b.id,
    content: "Shared convention",
    source: "QA",
    scope: "workspace",
  });
  const secret = store.createMemory({
    projectId: b.id,
    content: "Other project private fact",
    source: "QA",
  });
  let prompt = "";
  const supervisor = {
    settings,
    reason: async (_project, _agent, value) => {
      prompt = value;
      return JSON.stringify(plan());
    },
  };
  let master = new MasterAgent(store, supervisor);
  assert.throws(
    () => master.plan({ ...input(p.id), contextIds: [secret.id] }),
    /CONTEXT/,
  );
  const mission = master.plan({ ...input(p.id), contextIds: [shared.id] });
  assert.throws(() => master.plan(input(p.id)), /ALREADY_ACTIVE/);
  await master.waitForProject(p.id);
  assert.match(prompt, /Shared convention/);
  assert.doesNotMatch(prompt, /Other project private fact/);
  store.deleteMemory({ projectId: b.id, id: shared.id });
  assert.match(
    store.missions.context(p.id, mission.id).body,
    /Shared convention/,
  );
  assert.throws(
    () =>
      master.remember({ projectId: p.id, id: mission.id, scope: "workspace" }),
    /NOT_EVALUATED/,
  );
  assert.throws(() => store.missions.get(b.id, mission.id), /NOT_FOUND/);
  const saved = store.missions.get(p.id, mission.id);
  saved.status = "running";
  store.missions.save(saved);
  await master.close();
  store.close();
  store = new Store(db);
  master = new MasterAgent(store, supervisor);
  assert.equal(store.missions.get(p.id, mission.id).status, "interrupted");
  assert.equal(store.tasks(p.id).length, 0);
  await master.close();
  store.close();
});

test("exhausted verified quota blocks inference; unknown quota is explicit and cancellation is durable", async (t) => {
  let store;
  const dir = temp(t, () => store.close());
  store = new Store(join(dir, "db.sqlite"));
  const p = store.createProject({ name: "Quota", root: "", master: "codex" });
  let calls = 0;
  const supervisor = {
    settings,
    reason: async () => {
      calls++;
      return JSON.stringify(plan());
    },
  };
  const blocked = new MasterAgent(store, supervisor, async () => [
    {
      id: "codex",
      source: "codex-app-server",
      status: "exhausted",
      updatedAt: new Date().toISOString(),
    },
  ]);
  const mission = blocked.plan(input(p.id));
  await blocked.waitForProject(p.id);
  assert.equal(calls, 0);
  assert.equal(
    store.missions.get(p.id, mission.id).reason,
    "PROVIDER_QUOTA_EXHAUSTED",
  );
  await blocked.close();
  const cancellable = new MasterAgent(store, {
    settings,
    reason: (_p, _a, _v, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(Error("RUN_CANCELLED")), {
          once: true,
        });
      }),
  });
  const pending = cancellable.plan(input(p.id));
  await new Promise((r) => setTimeout(r, 10));
  const stopped = await cancellable.action({
    ...execute(p.id, pending.id),
    action: "stop",
  });
  assert.equal(stopped.status, "stopped");
  assert.ok(stopped.events.some((e) => e.message.includes("QUOTA_UNKNOWN")));
  await cancellable.close();
});

test("invalid model plan creates no tasks and atomic task binding rolls back on launch failure", async (t) => {
  let store;
  const dir = temp(t, () => store.close());
  store = new Store(join(dir, "db.sqlite"));
  const p = store.createProject({ name: "Atomic", root: "", master: "codex" });
  let result = "not JSON";
  const master = new MasterAgent(store, {
    settings,
    reason: async () => result,
  });
  const invalid = master.plan(input(p.id));
  await master.waitForProject(p.id);
  assert.equal(store.missions.get(p.id, invalid.id).status, "failed");
  assert.equal(store.tasks(p.id).length, 0);
  result = JSON.stringify(plan());
  const valid = master.plan(input(p.id));
  await master.waitForProject(p.id);
  const action = store.taskAction.bind(store);
  store.taskAction = () => {
    throw Error("FIXTURE_FAILURE");
  };
  await assert.rejects(
    master.action(execute(p.id, valid.id)),
    /FIXTURE_FAILURE/,
  );
  assert.equal(store.tasks(p.id).length, 0);
  assert.equal(store.missions.get(p.id, valid.id).steps[0].taskId, null);
  store.taskAction = action;
  await master.close();
});

test("Master protocol → research → implementation → review → human apply → evaluation → shared memory", async (t) => {
  const dir = temp(t),
    repo = join(dir, "repo");
  await git(dir, ["init", "--", repo]);
  writeFileSync(join(repo, "original.txt"), "original\n");
  await git(repo, ["add", "--all"]);
  const tree = await gitText(repo, "write-tree"),
    base = await gitText(repo, "commit-tree", tree, "-m", "fixture");
  await git(repo, ["update-ref", "HEAD", base]);
  const store = new Store(join(dir, "db.sqlite"));
  const p = store.createProject({
    name: "Full mission",
    root: repo,
    master: "codex",
  });
  store.runs.configure("codex", process.execPath, [], "codex", "existing");
  store.runs.configure("claude", process.execPath, [], "acp", "existing");
  const prompts = [];
  const supervisor = new Supervisor(store, join(dir, "app"), (_agent, cwd) => {
    const adapter = new CodexAdapter({
      command: process.execPath,
      args: [resolve("tests/fixtures/codex-server.mjs")],
      cwd,
      env: { QA_BEHAVIOR: "master" },
    });
    const run = adapter.run.bind(adapter);
    adapter.run = (input) => {
      prompts.push(input.prompt);
      return run(input);
    };
    return adapter;
  });
  const master = new MasterAgent(store, supervisor);
  try {
    const mission = master.plan(input(p.id));
    await master.waitForProject(p.id);
    assert.equal(store.missions.get(p.id, mission.id).status, "ready");
    assert.equal(store.tasks(p.id).length, 0);
    await master.action(execute(p.id, mission.id));
    await master.waitForProject(p.id);
    let current = store.missions.get(p.id, mission.id);
    assert.equal(current.status, "blocked");
    assert.equal(current.reason, "HUMAN_APPROVAL_REQUIRED");
    assert.equal(store.tasks(p.id).length, 2);
    const run = store.runs.get(p.id, current.runId);
    assert.equal(run.reviewState, "completed");
    assert.equal(await gitText(repo, "rev-parse", "HEAD"), base);
    assert.equal(existsSync(join(repo, "result.txt")), false);
    await master.action(execute(p.id, mission.id));
    await master.waitForProject(p.id);
    assert.equal(store.tasks(p.id).length, 2);
    assert.equal(store.runs.list(p.id).length, 2);
    const applications = new Applications(store, supervisor.worktrees);
    await applications.decide({
      projectId: p.id,
      runId: run.id,
      action: "approve",
    });
    await applications.decide({
      projectId: p.id,
      runId: run.id,
      action: "apply",
    });
    await master.action(execute(p.id, mission.id));
    await master.waitForProject(p.id);
    current = store.missions.get(p.id, mission.id);
    assert.equal(current.status, "completed");
    assert.match(
      readFileSync(join(repo, "result.txt"), "utf8"),
      /isolated result/,
    );
    assert.ok(
      prompts.some(
        (p) =>
          p.includes("Previous task outcomes") &&
          p.includes("Fixture independent review completed"),
      ),
    );
    assert.ok(
      prompts.some(
        (p) =>
          p.includes("Master Agent evaluating") &&
          p.includes('"state":"applied"'),
      ),
    );
    const remembered = master.remember({
      projectId: p.id,
      id: mission.id,
      scope: "workspace",
    });
    assert.equal(
      master.remember({ projectId: p.id, id: mission.id, scope: "workspace" })
        .id,
      remembered.id,
    );
    const other = store.createProject({
      name: "Consumer",
      root: "",
      master: "local",
    });
    assert.equal(store.memory(other.id)[0].id, remembered.id);
  } finally {
    await master.close();
    await supervisor.close();
    store.close();
  }
});

test("a no-change mission step whose reviewer requests changes stops the mission", async (t) => {
  const dir = temp(t),
    repo = join(dir, "repo");
  await git(dir, ["init", "--", repo]);
  writeFileSync(join(repo, "original.txt"), "original\n");
  await git(repo, ["add", "--all"]);
  const tree = await gitText(repo, "write-tree"),
    base = await gitText(repo, "commit-tree", tree, "-m", "fixture");
  await git(repo, ["update-ref", "HEAD", base]);
  const store = new Store(join(dir, "db.sqlite"));
  const p = store.createProject({
    name: "Review stop",
    root: repo,
    master: "codex",
  });
  store.runs.configure("codex", process.execPath, [], "codex", "existing");
  store.runs.configure("claude", process.execPath, [], "acp", "existing");
  const supervisor = new Supervisor(
    store,
    join(dir, "app"),
    (_agent, cwd) =>
      new CodexAdapter({
        command: process.execPath,
        args: [resolve("tests/fixtures/codex-server.mjs")],
        cwd,
        env: { QA_BEHAVIOR: "master", QA_REVIEW_VERDICT: "CHANGES_REQUESTED" },
      }),
  );
  const master = new MasterAgent(store, supervisor);
  try {
    const mission = master.plan(input(p.id));
    await master.waitForProject(p.id);
    await master.action(execute(p.id, mission.id));
    await master.waitForProject(p.id);
    const current = store.missions.get(p.id, mission.id);
    assert.equal(current.status, "blocked");
    assert.equal(current.reason, "REVIEW_CHANGES_REQUESTED");
    const run = store.runs.get(p.id, current.runId);
    assert.equal(run.state, "completed", "the research step changed no files");
    assert.equal(
      store.runs.list(
        p.id,
        store.tasks(p.id).find((t) => t.id !== run.taskId).id,
      ).length,
      0,
      "the dependent step never started",
    );
  } finally {
    await master.close();
    await supervisor.close?.();
    store.close();
  }
});

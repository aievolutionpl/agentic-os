import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Store } from "../dist/main/store.js";
import { MemoryVault } from "../dist/main/memory-vault.js";
import { workBoard } from "../dist/main/work-board.js";
import { CodexAdapter } from "../dist/main/providers.js";
import { Chats } from "../dist/main/chats.js";
import { AVAILABLE_AGENTS } from "../dist/shared.js";
import { inspectGitRepoHealth } from "../dist/main/github-integration.js";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-premium-"));
  const store = new Store(join(dir, "test.sqlite"));
  const project = store.createProject({
    name: "Alpha",
    root: dir,
    master: "codex",
  });
  const other = store.createProject({
    name: "Beta",
    root: "",
    master: "claude",
  });
  t.after(() => {
    store.close();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  return { dir, store, project, other };
}
test("MCP graph persists scoped notes, real wiki edges, Markdown edits and deletion without rewriting unchanged graph", async (t) => {
  const { dir, store, project, other } = setup(t);
  const vault = new MemoryVault(store, dir);
  const a = store.createMemory({
    projectId: project.id,
    content: "Architecture\nLocal-first graph.",
    source: "user",
    scope: "project",
  });
  const b = store.createMemory({
    projectId: project.id,
    content: "Delivery\nUse [[Architecture]].",
    source: "user",
    scope: "project",
  });
  store.createMemory({
    projectId: other.id,
    content: "SECRET_BETA architecture",
    source: "user",
    scope: "project",
  });
  let graph = await vault.sync();
  assert.ok(
    graph.edges.some(
      (e) =>
        e.from === `memory:${b.id}` &&
        e.to === `memory:${a.id}` &&
        e.relation === "links_to",
    ),
  );
  const file = join(vault.directory, `${b.id}.md`);
  assert.match(
    readFileSync(file, "utf8"),
    new RegExp(a.id + "\\|Architecture"),
  );
  const durable = readFileSync(
    join(vault.directory, "knowledge-graph.jsonl"),
    "utf8",
  );
  await vault.sync();
  assert.equal(
    readFileSync(join(vault.directory, "knowledge-graph.jsonl"), "utf8"),
    durable,
  );
  writeFileSync(file, readFileSync(file, "utf8").replace("Use [[", "Ship [["));
  await vault.sync();
  assert.match(
    store.memory(project.id).find((m) => m.id === b.id).content,
    /Ship \[\[Architecture\]\]/,
  );
  const context = store.knowledge.build(
    project.id,
    [],
    "research",
    [],
    "architecture",
  );
  assert.ok(context.memoryIds.includes(a.id));
  assert.doesNotMatch(context.body, /SECRET_BETA/);
  store.updateMemory({
    projectId: project.id,
    id: b.id,
    content: "New application edit",
    scope: "project",
    pinned: false,
  });
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace("Ship", "External edit"),
  );
  await vault.sync();
  assert.equal(
    store.memory(project.id).find((m) => m.id === b.id).content,
    "New application edit",
  );
  assert.ok(
    store
      .memory(project.id)
      .some((m) => m.source === `markdown:conflict:${b.id}`),
  );
  store.deleteMemory({ projectId: project.id, id: a.id });
  graph = await vault.sync();
  assert.ok(!graph.nodes.some((n) => n.memoryId === a.id));
  assert.equal(existsSync(join(vault.directory, `${a.id}.md`)), false);
  await vault.close();
});
test("automatic recall respects the combined 20-note limit without displacing selected notes", (t) => {
  const { store, project } = setup(t);
  const notes = Array.from({ length: 24 }, (_, i) =>
    store.createMemory({
      projectId: project.id,
      content: `Architecture decision ${i}`,
      source: "test",
      scope: "project",
    }),
  );
  const selected = notes.slice(0, 19).map((n) => n.id);
  const context = store.knowledge.build(
    project.id,
    selected,
    "research",
    [],
    "architecture",
  );
  assert.equal(context.memoryIds.length, 20);
  for (const id of selected) assert.ok(context.memoryIds.includes(id));
  assert.ok(context.characters <= context.limit);
  const full = notes.slice(0, 20).map((n) => n.id);
  assert.deepEqual(
    store.knowledge.build(project.id, full, "research", [], "architecture")
      .memoryIds,
    full,
  );
});

test("automatic memory deduplicates complete exchanges, excludes unfinished replies, redacts and persists the off switch", async (t) => {
  const { dir, store, project } = setup(t);
  let vault = new MemoryVault(store, dir);
  const chat = {
    id: randomUUID(),
    projectId: project.id,
    title: "Decision",
    status: "idle",
    agent: "codex",
    messages: [
      {
        id: "u",
        role: "user",
        content: "Choose SQLite",
        at: 1,
        status: "complete",
      },
      {
        id: "a",
        role: "assistant",
        content: "Use SQLite. sk-" + "x".repeat(40),
        at: 2,
        status: "complete",
      },
    ],
    activity: [],
  };
  store.chats.save(chat);
  await vault.sync();
  await vault.sync();
  const notes = store.memory(project.id);
  assert.equal(notes.length, 1);
  assert.doesNotMatch(notes[0].content, /sk-x/);
  assert.equal(notes[0].scope, "project");
  chat.messages.at(-1).at = 3;
  chat.messages.at(-1).content = "New choice";
  chat.messages.at(-1).status = "failed";
  store.chats.save(chat);
  await vault.sync();
  assert.equal(store.memory(project.id)[0].content, notes[0].content);
  await vault.setEnabled(false);
  await vault.close();
  vault = new MemoryVault(store, dir);
  chat.messages.at(-1).status = "complete";
  store.chats.save(chat);
  assert.equal((await vault.sync()).enabled, false);
  assert.equal(store.memory(project.id)[0].content, notes[0].content);
  await vault.setEnabled(true);
  assert.match(store.memory(project.id)[0].content, /New choice/);
  await vault.close();
});
test("skill installation copies the full pinned package, stays local to a project and preserves an existing folder", async (t) => {
  const { dir, store, project, other } = setup(t);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const catalog = store.extensions.catalog();
  assert.equal(catalog.length, 20);
  const skill = catalog.find((s) => s.slug === "webapp-testing");
  const result = await store.extensions.install(project.id, skill.id);
  const path = result.installPath;
  assert.ok(existsSync(join(path, "SKILL.md")));
  assert.ok(existsSync(join(path, "scripts", "with_server.py")));
  assert.ok(existsSync(join(path, "LICENSE.txt")));
  assert.ok(
    store.extensions
      .skills(project.id, [])
      .some(
        (s) =>
          s.id === skill.id &&
          s.instructions.includes(`.agents/skills/${skill.slug}/SKILL.md`),
      ),
  );
  assert.equal(store.extensions.skills(other.id, []).length, 0);
  await store.extensions.install(project.id, skill.id);
  assert.equal(
    store.extensions.list(project.id).filter((s) => s.id === skill.id).length,
    1,
  );
  assert.ok(
    !execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: dir,
      encoding: "utf8",
    }).includes(".agents/skills"),
  );
  const occupied = join(dir, ".agents", "skills", "frontend-design");
  mkdirSync(occupied);
  writeFileSync(join(occupied, "SKILL.md"), "MY INSTRUCTIONS");
  await assert.rejects(
    store.extensions.install(project.id, "builtin:frontend-design"),
    /FOLDER_EXISTS/,
  );
  assert.equal(
    readFileSync(join(occupied, "SKILL.md"), "utf8"),
    "MY INSTRUCTIONS",
  );
  assert.ok(
    !readdirSync(join(dir, ".agents", "skills")).some((n) =>
      n.startsWith(".agenting-install-"),
    ),
  );
});
test("Kanban derives stages from real runs, selects the reviewer when reviewing and never fabricates a running agent from a lease", (t) => {
  const { store, project, dir } = setup(t);
  const task = store.createTask({
    projectId: project.id,
    title: "Work",
    implementer: "codex",
    reviewer: "claude",
  });
  store.taskAction({ projectId: project.id, id: task.id, action: "queue" });
  assert.equal(workBoard(store).cards[0].stage, "queue");
  store.lifecycle.claim({
    projectId: project.id,
    id: task.id,
    owner: "fixture",
    ttlMs: 60000,
  });
  assert.equal(workBoard(store).cards[0].stage, "waiting");
  const run = store.runs.create(
    project.id,
    task.id,
    1,
    "codex",
    "claude",
    { repository: dir, path: dir, base: "a", head: "a" },
    "",
  );
  store.runs.update(project.id, run.id, { state: "reviewing" });
  store.runs.event(run.id, "activity", "Reviewing result");
  const card = workBoard(store).cards[0];
  assert.equal(card.stage, "working");
  assert.equal(card.agent, "claude");
  assert.equal(card.activity, "Reviewing result");
  store.runs.update(project.id, run.id, { state: "awaiting_review" });
  assert.equal(workBoard(store).cards[0].stage, "waiting");
  store.runs.update(project.id, run.id, { state: "applied" });
  assert.equal(workBoard(store).cards[0].stage, "done");
});
test("a per-conversation model survives a turn and reaches the Codex thread and turn protocol", async (t) => {
  const { dir, store } = setup(t);
  const models = [];
  const supervisor = {
    settings: () => [{ id: "codex", configured: true }],
    conversation: async (...args) => {
      models.push(args[6]);
      return "Finished";
    },
  };
  const chats = new Chats(store, supervisor, dir, async () => []);
  const chat = await chats.create({
    agent: "codex",
    mode: "chat",
    source: "default",
    model: "first-model",
  });
  for (const model of ["second-model", undefined]) {
    chats.send({
      id: chat.id,
      message: "Continue",
      contextIds: [],
      skillIds: [],
      consent: true,
      ...(model ? { model } : {}),
    });
    for (
      let n = 0;
      n < 100 &&
      chats.list().find((c) => c.id === chat.id).status === "running";
      n++
    )
      await new Promise((r) => setTimeout(r, 10));
  }
  assert.deepEqual(models, ["second-model", "second-model"]);
  assert.equal(store.chats.get(chat.id).model, "second-model");
  await chats.close();
  const log = join(dir, "protocol.jsonl");
  const adapter = new CodexAdapter(
    {
      command: process.execPath,
      args: [resolve("tests/fixtures/codex-server.mjs")],
      cwd: dir,
      env: { QA_PROTOCOL_LOG: log },
    },
    "chosen-model",
  );
  try {
    await adapter.run({
      cwd: dir,
      prompt: "Review",
      readOnly: true,
      signal: new AbortController().signal,
      session: () => {},
      activity: () => {},
    });
  } finally {
    adapter.close();
    await adapter.stopped();
  }
  const requests = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
  for (const method of ["thread/start", "turn/start"])
    assert.equal(
      requests.find((r) => r.method === method).params.model,
      "chosen-model",
    );
});
test("Classic and Harness themes persist and active selectors retain Antigravity without Gemini CLI", (t) => {
  const { store } = setup(t);
  for (const theme of ["claude", "codex", "tokyo", "nord", "classic"]) {
    store.setPreferences({ language: "pl", theme });
    assert.equal(store.preferences().theme, theme);
  }
  assert.ok(AVAILABLE_AGENTS.includes("antigravity"));
  assert.ok(!AVAILABLE_AGENTS.includes("gemini"));
});
test("custom SKILL.md Studio writes skill package and inspectGitRepoHealth reports Git branch and dirty worktree", async (t) => {
  const { dir, store, project } = setup(t);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const custom = store.extensions.createCustomSkill({
    projectId: project.id,
    name: "Playwright QA Guard",
    summary: "Enforce deterministic E2E assertions",
    instructions: "# Playwright QA Guard\n\nAlways verify DOM state before clicking.",
  });
  assert.equal(custom.slug, "playwright-qa-guard");
  assert.ok(existsSync(join(dir, ".agents", "skills", "playwright-qa-guard", "SKILL.md")));
  assert.ok(
    store.extensions
      .skills(project.id, [])
      .some((s) => s.id === custom.id && s.instructions.includes("playwright-qa-guard")),
  );
  writeFileSync(join(dir, "README.md"), "# Alpha\n");
  const health = await inspectGitRepoHealth(store, { projectId: project.id });
  assert.equal(health.isGit, true);
  assert.equal(health.clean, false);
  assert.ok(health.changedFiles >= 1);
});

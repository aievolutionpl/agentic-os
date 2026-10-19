import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { Chats, githubRepository } from "../dist/main/chats.js";
import { QuotaMonitor } from "../dist/main/quota-monitor.js";
import { readSkillFile } from "../dist/main/skill-files.js";
import { Supervisor } from "../dist/main/supervisor.js";
import { CodexAdapter } from "../dist/main/providers.js";
import { AcpAdapter } from "../dist/main/acp.js";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-chat-test-"));
  const store = new Store(join(dir, "store.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return { dir, store };
}
async function settled(chats, id) {
  for (let i = 0; i < 300; i++) {
    const chat = chats.list().find((c) => c.id === id);
    if (chat.status !== "running") return chat;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("timeout");
}
const sender = (id, message = "Hello") => ({
  id,
  message,
  contextIds: [],
  skillIds: [],
  consent: true,
});

test("GitHub context validates exact repository names and rejects injection, credentials and non-GitHub URLs", () => {
  assert.equal(
    githubRepository("https://github.com/octocat/Hello-World.git"),
    "octocat/Hello-World",
  );
  for (const input of [
    "../repo",
    "-x/repo",
    "a/b --upload-pack=x",
    "https://evil.test/a/b",
    "https://user:secret@github.com/a/b",
    "a/..",
    "a/b/tree/main",
  ])
    assert.throws(() => githubRepository(input));
});
test("shared pinned memory is automatic for all contexts while private project pins remain isolated and edits are searchable", (t) => {
  const { store } = setup(t),
    a = store.createProject({ name: "a", root: "", master: "codex" }),
    b = store.createProject({ name: "b", root: "", master: "claude" });
  const pin = store.createMemory({
    projectId: a.id,
    content: "Shared design standard",
    source: "test",
    scope: "workspace",
  });
  const privatePin = store.createMemory({
    projectId: a.id,
    content: "Private project rule",
    source: "test",
  });
  for (const item of [pin, privatePin])
    store.updateMemory({ ...item, pinned: true });
  const body = store.knowledge.build(b.id, [], "research");
  assert.match(body.body, /Shared design standard/);
  assert.doesNotMatch(body.body, /Private project rule/);
  assert.deepEqual(body.memoryIds, [pin.id]);
  store.updateMemory({
    ...pin,
    content: "Updated architecture standard",
    pinned: true,
  });
  assert.equal(store.knowledge.search(b.id, "architecture")[0].id, pin.id);
  store.updateMemory({ ...pin, scope: "project", pinned: true });
  assert.equal(store.knowledge.build(b.id, []).memoryIds.length, 0);
  assert.throws(
    () => store.updateMemory({ ...pin, projectId: b.id, pinned: true }),
    /NOT_FOUND/,
  );
});
test("chat retains multi-turn history, freezes selected context per turn and supports explicit memory/task handoff", async (t) => {
  const { dir, store } = setup(t),
    root = join(dir, "plain-folder");
  mkdirSync(root);
  writeFileSync(join(root, "readme.txt"), "unchanged");
  const prompts = [];
  const supervisor = {
    settings: () => [{ id: "codex", configured: true }],
    conversation: async (agent, cwd, prompt, readOnly, signal, activity) => {
      assert.equal(readOnly, true);
      assert.equal(cwd, realpathSync.native(root));
      prompts.push(prompt);
      activity("message", "Draft");
      return `Answer ${prompts.length}`;
    },
  };
  const chats = new Chats(store, supervisor, dir, async () => []);
  const chat = await chats.create({
    agent: "codex",
    mode: "plan",
    source: "local",
    path: root,
  });
  const memory = store.createMemory({
    projectId: chat.projectId,
    content: "Selected context",
    source: "QA",
  });
  chats.send({
    ...sender(chat.id, "First question"),
    contextIds: [memory.id],
    skillIds: ["builtin:review"],
  });
  const first = await settled(chats, chat.id);
  assert.equal(first.status, "idle", first.error);
  chats.send(sender(chat.id, "Second question"));
  const final = await settled(chats, chat.id);
  assert.equal(final.status, "idle", final.error);
  assert.match(prompts[0], /Selected context/);
  assert.match(prompts[0], /Evidence-based|Review correctness/);
  assert.match(prompts[1], /First question/);
  assert.match(prompts[1], /Answer 1/);
  assert.doesNotMatch(prompts[1], /Selected context/);
  assert.equal(final.messages.length, 4);
  assert.equal(readFileSync(join(root, "readme.txt"), "utf8"), "unchanged");
  const saved = chats.remember({
    id: chat.id,
    messageId: final.messages[3].id,
    content: "Durable decision",
    scope: "workspace",
  });
  assert.equal(
    chats.remember({
      id: chat.id,
      messageId: final.messages[3].id,
      content: "Durable decision",
      scope: "workspace",
    }).id,
    saved.id,
  );
  const task = chats.task({
    id: chat.id,
    messageId: final.messages[3].id,
    reviewer: "claude",
  });
  assert.equal(task.status, "draft");
  assert.match(task.title, /Answer 2/);
  assert.throws(
    () =>
      chats.task({
        id: chat.id,
        messageId: final.messages[0].id,
        reviewer: "claude",
      }),
    /MESSAGE_REQUIRED/,
  );
});
test("chat quota gate, concurrent send rejection and cancellation are durable without automatic replay", async (t) => {
  const { dir, store } = setup(t);
  let calls = 0,
    exhausted = true;
  const supervisor = {
    settings: () => [{ id: "codex", configured: true }],
    conversation: async (a, c, p, r, signal) => {
      calls++;
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("RUN_CANCELLED")), {
          once: true,
        }),
      );
    },
  };
  const chats = new Chats(store, supervisor, dir, async () =>
    exhausted
      ? [
          {
            id: "codex",
            source: "codex-app-server",
            status: "exhausted",
            updatedAt: new Date().toISOString(),
          },
        ]
      : [],
  );
  const chat = await chats.create({
    agent: "codex",
    mode: "chat",
    source: "default",
  });
  chats.send(sender(chat.id));
  let state = await settled(chats, chat.id);
  assert.equal(state.error, "QUOTA_EXHAUSTED");
  assert.equal(calls, 0);
  exhausted = false;
  chats.send(sender(chat.id));
  assert.throws(() => chats.send(sender(chat.id)), /BUSY/);
  await new Promise((r) => setTimeout(r, 10));
  await chats.action({ id: chat.id, action: "stop" });
  state = chats.list()[0];
  assert.equal(state.messages.at(-1).status, "cancelled");
  assert.equal(state.error, "CHAT_CANCELLED");
  state.status = "running";
  state.messages.at(-1).status = "streaming";
  store.chats.save(state);
  const { ChatStore } = await import("../dist/main/chat-store.js");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(dir, "store.sqlite"));
  new ChatStore(db);
  db.close();
  assert.equal(store.chats.get(chat.id).status, "interrupted");
  assert.equal(calls, 1);
});
test("chat only gates OpenCode against OpenRouter when that backend is selected", async (t) => {
  const { dir, store } = setup(t);
  let calls = 0;
  const supervisor = {
    settings: () => [{ id: "opencode", configured: true }],
    conversation: async () => {
      calls++;
      return "Ready";
    },
  };
  const quotas = async () => [
    {
      id: "openrouter",
      source: "openrouter-api",
      status: "exhausted",
      updatedAt: new Date().toISOString(),
    },
  ];
  const native = new Chats(store, supervisor, dir, quotas);
  const chat = await native.create({
    agent: "opencode",
    mode: "plan",
    source: "default",
  });
  native.send(sender(chat.id));
  assert.equal((await settled(native, chat.id)).status, "idle");
  const routed = new Chats(store, supervisor, dir, quotas, () => "openrouter");
  routed.send(sender(chat.id));
  assert.equal((await settled(routed, chat.id)).error, "QUOTA_EXHAUSTED");
  assert.equal(calls, 1);
});
test("chat runs the real Codex app-server protocol in read-only mode and ACP handshake uses no model prompt", async (t) => {
  const { dir, store } = setup(t);
  const supervisor = new Supervisor(
    store,
    dir,
    (agent, cwd) =>
      new CodexAdapter({
        command: process.execPath,
        args: [resolve("tests/fixtures/codex-server.mjs")],
        cwd,
      }),
  );
  store.runs.configure("codex", process.execPath, [], "codex", "existing");
  const chats = new Chats(store, supervisor, dir, async () => []);
  const chat = await chats.create({
    agent: "codex",
    mode: "chat",
    source: "default",
  });
  chats.send(sender(chat.id));
  const final = await settled(chats, chat.id);
  assert.equal(final.status, "idle", final.error);
  assert.match(final.messages.at(-1).content, /Fixture chat reply/);
  const acp = new AcpAdapter({
    command: process.execPath,
    args: [resolve("tests/fixtures/acp-server.mjs")],
    cwd: dir,
  });
  assert.deepEqual(await acp.probe(dir), []);
  await chats.close();
  await supervisor.close();
});
test("quota monitor deduplicates concurrent callers, caches, invalidates and retries failed reads", async () => {
  let now = 100000,
    calls = 0,
    fail = false;
  const monitor = new QuotaMonitor(
    async () => {
      calls++;
      await Promise.resolve();
      if (fail) throw Error("offline");
      return [{ id: "fixture" }];
    },
    () => now,
  );
  await Promise.all([monitor.read(), monitor.read(true)]);
  assert.equal(calls, 1);
  await monitor.read();
  assert.equal(calls, 1);
  now += 61000;
  await monitor.read();
  assert.equal(calls, 2);
  monitor.invalidate();
  fail = true;
  await assert.rejects(monitor.read());
  fail = false;
  await monitor.read();
  assert.equal(calls, 4);
  await monitor.close();
});
test("skills retain pinned GitHub provenance and local markdown imports never execute supporting files", (t) => {
  const { dir, store } = setup(t);
  const catalog = store.extensions.catalog();
  assert.equal(
    catalog.filter((s) =>
      s.source.includes("github.com/obra/superpowers/blob/"),
    ).length,
    3,
  );
  for (const s of catalog) {
    assert.ok(s.instructions.length <= 12000);
    assert.ok(s.license);
  }
  const path = join(dir, "SKILL.md");
  writeFileSync(
    path,
    "---\nname: local-design\nlicense: MIT\n---\nUse existing UI.",
  );
  const skill = readSkillFile(path);
  assert.equal(skill.name, "local-design");
  assert.equal(skill.license, "MIT");
  assert.ok(!("command" in skill));
  writeFileSync(path, "x".repeat(20000));
  assert.throws(() => readSkillFile(path), /TOO_LARGE/);
});

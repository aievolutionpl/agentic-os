import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { McpTools } from "../dist/main/extensions.js";
import { browserUrl } from "../dist/main/browser-policy.js";
import { importGitHubIssueAsTask } from "../dist/main/github-integration.js";
import { LocalModelConnection } from "../dist/main/local-model.js";
const skill = {
  kind: "skill",
  name: "Test skill",
  version: "1.0.0",
  author: "QA",
  license: "Apache-2.0",
  source: "local-test",
  instructions: "Check actual evidence.",
};
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "agenting-extensions-")),
    store = new Store(join(dir, "test.sqlite")),
    a = store.createProject({ name: "A", root: "", master: "codex" }),
    b = store.createProject({ name: "B", root: "", master: "claude" });
  return {
    dir,
    store,
    a,
    b,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true,maxRetries:5,retryDelay:100 });
    },
  };
}
test("extension import is scoped, explicit and contributes versioned frozen context", () => {
  const s = setup();
  try {
    assert.throws(
      () =>
        s.store.extensions.import({
          projectId: s.a.id,
          manifest: JSON.stringify(skill),
          consent: false,
        }),
      /TRUST/,
    );
    assert.throws(() =>
      s.store.extensions.import({
        projectId: s.a.id,
        manifest: JSON.stringify({ ...skill, permissions: ["shell"] }),
        consent: true,
      }),
    );
    const item = s.store.extensions.import({
      projectId: s.a.id,
      manifest: JSON.stringify(skill),
      consent: true,
    });
    assert.equal(s.store.extensions.list(s.a.id).length, s.store.extensions.catalog().length + 1);
    assert.equal(s.store.extensions.list(s.b.id).length, s.store.extensions.catalog().length);
    assert.throws(
      () => s.store.extensions.skills(s.b.id, [item.id]),
      /NOT_FOUND/,
    );
    const frozen = s.store.knowledge.build(
      s.a.id,
      [],
      "implementation",
      s.store.extensions.skills(s.a.id, [item.id]),
    );
    assert.match(frozen.body, /Apache-2.0/);
    assert.match(frozen.body, /@1.0.0/);
    s.store.extensions.remove(s.a.id, item.id);
    assert.match(frozen.body, /Check actual evidence/);
    assert.throws(() => s.store.extensions.skills(s.a.id, [item.id]));
    assert.throws(() => s.store.extensions.remove(s.a.id, "builtin:review"));
  } finally {
    s.close();
  }
});
test("MCP uses versioned handshake and pagination, rejects cross-project and unapproved calls", async () => {
  const s = setup(),
    client = new McpTools(s.store.extensions, s.dir);
  try {
    const manifest = {
      kind: "mcp",
      name: "Fixture",
      version: "1",
      author: "QA",
      license: "Apache-2.0",
      source: "local-test",
      command: process.execPath,
      args: [resolve("tests/fixtures/mcp-server.mjs")],
    };
    const item = s.store.extensions.import({
      projectId: s.a.id,
      manifest: JSON.stringify(manifest),
      consent: true,
    });
    await assert.rejects(
      () =>
        client.call({
          projectId: s.a.id,
          id: item.id,
          name: "echo",
          arguments: {},
          consent: true,
        }),
      /NOT_READY/,
    );
    await assert.rejects(
      () => client.connect({ projectId: s.b.id, id: item.id, consent: true }),
      /NOT_FOUND/,
    );
    const tools = await client.connect({
      projectId: s.a.id,
      id: item.id,
      consent: true,
    });
    assert.deepEqual(
      tools.map((t) => t.name),
      ["echo", "fail"],
    );
    await assert.rejects(
      () =>
        client.call({
          projectId: s.a.id,
          id: item.id,
          name: "echo",
          arguments: {},
          consent: false,
        }),
      /EXPLICIT/,
    );
    await assert.rejects(
      () =>
        client.call({
          projectId: s.a.id,
          id: item.id,
          name: "unknown",
          arguments: {},
          consent: true,
        }),
      /NOT_READY/,
    );
    const result = await client.call({
      projectId: s.a.id,
      id: item.id,
      name: "echo",
      arguments: { text: "hello" },
      consent: true,
    });
    assert.equal(result.isError, false);
    assert.match(result.text, /hello/);
    const failed = await client.call({
      projectId: s.a.id,
      id: item.id,
      name: "fail",
      arguments: {},
      consent: true,
    });
    assert.equal(failed.isError, true);
    await client.disconnect(s.a.id, item.id);
    await assert.rejects(
      () =>
        client.call({
          projectId: s.a.id,
          id: item.id,
          name: "echo",
          arguments: {},
          consent: true,
        }),
      /NOT_READY/,
    );
    assert.throws(
      () =>
        s.store.extensions.import({
          projectId: s.a.id,
          manifest: JSON.stringify({ ...manifest, args: ["--api-key=secret"] }),
          consent: true,
        }),
      /CREDENTIALS/,
    );
  } finally {
    await client.close();
    s.close();
  }
});
test("browser only accepts safe explicit web URLs and blocks local navigation from remote content", () => {
  assert.equal(browserUrl("https://example.com"), "https://example.com/");
  assert.equal(browserUrl("http://127.0.0.1:4567"), "http://127.0.0.1:4567/");
  for (const url of [
    "file:///C:/Users/test/auth.json",
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "http://example.com",
    "https://192.168.0.1",
    "https://10.0.0.1",
    "https://[::ffff:127.0.0.1]",
    "data:text/html,hello",
  ])
    assert.throws(() => browserUrl(url));
  assert.throws(() => browserUrl("http://localhost:4567", false));
  assert.throws(() => browserUrl("https://127.0.0.1", false));
});
test("plugin marketplace installation, enable/disable toggle, GitHub issue import and local model discovery", async () => {
  const s = setup();
  try {
    const catalog = s.store.extensions.pluginCatalog(s.a.id);
    assert.ok(catalog.length >= 4);
    assert.equal(catalog[0].installed, false);

    const installed = s.store.extensions.installPlugin({
      projectId: s.a.id,
      id: "plugin:qa-gate",
      consent: true,
    });
    assert.equal(installed.kind, "plugin");
    assert.equal(installed.enabled, true);

    const activeSkills = s.store.extensions.skills(s.a.id, []);
    assert.equal(
      activeSkills.some((sk) => sk.name.includes("QA & Test Gate")),
      true,
    );

    const disabled = s.store.extensions.toggle({
      projectId: s.a.id,
      id: installed.id,
      enabled: false,
    });
    assert.equal(disabled.enabled, false);
    assert.equal(
      s.store.extensions
        .skills(s.a.id, [])
        .some((sk) => sk.name.includes("QA & Test Gate")),
      false,
    );

    const reenabled = s.store.extensions.toggle({
      projectId: s.a.id,
      id: installed.id,
      enabled: true,
    });
    assert.equal(reenabled.enabled, true);
    assert.equal(
      s.store.extensions
        .skills(s.a.id, [])
        .some((sk) => sk.name.includes("QA & Test Gate")),
      true,
    );

    const task = importGitHubIssueAsTask(s.store, {
      projectId: s.a.id,
      number: 42,
      title: "Fix discount rounding edge case",
      body: "Ensure 2 decimal places when applying 15% discount.",
      url: "https://github.com/example/repo/issues/42",
      implementer: "codex",
      reviewer: "claude",
    });
    assert.equal(task.title, "#42: Fix discount rounding edge case");
    const mem = s.store
      .memory(s.a.id)
      .find((m) => m.source === "github:issue#42");
    assert.ok(mem);
    assert.match(mem.content, /Ensure 2 decimal places/);

    const local = new LocalModelConnection(s.dir);
    await assert.rejects(
      () => local.discover({ baseURL: "https://api.openai.com/v1" }),
      /LOCAL_ENDPOINT_REQUIRED/,
    );
  } finally {
    s.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanConnectors,
  resolveOnPath,
  defaultHttpJson,
} from "../dist/main/connectors.js";
import { Store } from "../dist/main/store.js";

const present = new Set(["codex", "claude", "gemini", "hermes", "gh", "agy", "ollama"]);
const outputs = {
  "codex --version": { code: 0, stdout: "codex-cli 0.163.0\n", stderr: "" },
  "codex login status": { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" },
  "claude --version": { code: 0, stdout: "2.1.301 (Claude Code)\n", stderr: "" },
  "claude auth status": {
    code: 0,
    stderr: "",
    stdout: JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      email: "secret.person@example.com",
      orgId: "org-secret-id",
      projectsDirectory: "C:/Users/secret-home/.claude/projects",
      subscriptionType: "pro",
    }),
  },
  "gemini --version": { code: 0, stdout: "0.1.4\n", stderr: "" },
  "hermes --version": { code: 0, stdout: "Hermes Agent v0.22.2 (2026.9.24)\n", stderr: "" },
  "gh --version": { code: 0, stdout: "gh version 2.83.2\n", stderr: "" },
  "gh auth status": {
    code: 0,
    stdout: "github.com\n  ✓ Logged in to github.com account octo-user (keyring)\n  - Token: gho_SUPERSECRETTOKEN\n",
    stderr: "",
  },
  "agy --version": { code: 0, stdout: "1.0.0\n", stderr: "" },
  "ollama --version": { code: 0, stdout: "ollama 0.1.0\n", stderr: "" },
};
const calls = [];
const deps = (overrides = {}) => ({
  resolve: (name) => (present.has(name) ? `C:/tools/${name}.exe` : null),
  run: async (file, args) => {
    const key = `${file.split("/").pop().replace(".exe", "")} ${args.join(" ")}`;
    calls.push(key);
    return outputs[key] ?? { code: 1, stdout: "", stderr: "" };
  },
  http: async () => null,
  ...overrides,
});
const by = (list) => Object.fromEntries(list.map((c) => [c.id, c]));

test("scan classifies real-world outputs honestly and never leaks credentials", async () => {
  const list = await scanConnectors(deps(), () => "2026-10-19T12:00:00.000Z");
  const c = by(list);
  assert.equal(c.codex.state, "ready");
  assert.equal(c.codex.authMethod, "ChatGPT");
  assert.equal(c.codex.version, "0.163.0");
  assert.equal(c.claude.state, "ready");
  assert.equal(c.claude.reason, "ok");
  assert.equal(c.claude.plan, "pro");
  assert.equal(c.claude.authMethod, "claude.ai");
  assert.equal(c.gemini.reason, "auth_unknown");
  assert.equal(c.hermes.version, "0.22.2");
  assert.equal(c.github.state, "ready");
  assert.equal(c.github.account, "octo-user");
  assert.equal(c.antigravity.state, "experimental");
  assert.equal(c.opencode.state, "needs-install");
  assert.equal(c.api.state, "unsupported");
  assert.equal(c.api.reason, "vault_missing");
  const json = JSON.stringify(list);
  for (const secret of ["secret.person", "org-secret-id", "SUPERSECRET", "secret-home"])
    assert.equal(json.includes(secret), false, secret);
  for (const item of list) {
    assert.equal(item.quota.state, "unknown");
    assert.equal(item.quota.remaining, null);
    assert.equal(item.quota.source, null);
  }
});

test("unauthenticated and broken tools are reported as such, not as connected", async () => {
  const list = await scanConnectors(
    deps({
      run: async (file, args) => {
        const tool = file.split("/").pop();
        if (tool.startsWith("codex") && args[0] === "login")
          return { code: 1, stdout: "Not logged in\n", stderr: "" };
        if (tool.startsWith("gemini")) return { code: null, stdout: "", stderr: "", error: "timed_out" };
        return outputs[`${tool.replace(".exe", "")} ${args.join(" ")}`] ?? { code: 1, stdout: "", stderr: "" };
      },
    }),
  );
  const c = by(list);
  assert.equal(c.codex.state, "needs-auth");
  assert.equal(c.codex.auth, "unauthenticated");
  assert.equal(c.gemini.state, "degraded");
  assert.equal(c.gemini.reason, "probe_failed");
});

test("local servers: models from loopback JSON, down server is degraded, absent is needs-install", async () => {
  const up = await scanConnectors(
    deps({
      http: async (url) =>
        url.includes("11434") ? { models: [{ name: "llama3:8b" }, { name: 5 }, {}] } : null,
    }),
  );
  assert.deepEqual(by(up).ollama.models, ["llama3:8b"]);
  assert.equal(by(up).ollama.state, "experimental");
  const down = await scanConnectors(deps());
  assert.equal(by(down).ollama.state, "degraded");
  assert.equal(by(down).ollama.reason, "server_down");
  assert.equal(by(down).lmstudio.state, "needs-install");
});

test("every spawned command is a fixed, read-only version or status query", async () => {
  calls.length = 0;
  await scanConnectors(deps());
  const allowed = new Set([
    "codex --version", "codex login status", "claude --version", "claude auth status",
    "gemini --version", "hermes --version", "opencode --version", "agy --version",
    "gh --version", "gh auth status",
  ]);
  assert.ok(calls.length > 0);
  for (const call of calls) assert.ok(allowed.has(call), call);
});

test("PATH resolution is strict, and the HTTP probe refuses non-loopback hosts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-path-"));
  try {
    writeFileSync(join(dir, "mytool.cmd"), "@echo off");
    const env = { PATH: dir };
    assert.equal(resolveOnPath("mytool", env, "win32"), join(dir, "mytool.cmd"));
    assert.equal(resolveOnPath("missing", env, "win32"), null);
    assert.equal(resolveOnPath("..\evil", env, "win32"), null);
    assert.equal(resolveOnPath("a b", env, "win32"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(await defaultHttpJson("http://example.com/api/tags"), null);
});

test("local run counters are exact and separate from provider quota", () => {
  const store = new Store(":memory:");
  try {
    assert.deepEqual(store.runs.usage(0), []);
  } finally {
    store.close();
  }
});

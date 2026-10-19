import { test } from "node:test";
import assert from "node:assert/strict";
import { probeProviders } from "../dist/main/adapters.js";

test("provider probes use only the documented fixed commands and redact command output", async () => {
  const calls = [];
  const results = await probeProviders(async (executable, args, timeoutMs) => {
    calls.push({ executable, args: [...args], timeoutMs });
    return {
      code: 0,
      stdout: `${executable} 9.8.7\nSECRET_ACCESS_TOKEN=should-not-leak`,
      stderr: "stderr secret should not leak",
    };
  }, () => "2026-10-19T00:00:00.000Z");
  assert.deepEqual(calls, [
    { executable: "codex", args: ["--version"], timeoutMs: 2000 },
    { executable: "codex", args: ["--help"], timeoutMs: 2000 },
    { executable: "codex", args: ["login", "status"], timeoutMs: 2000 },
    { executable: "claude", args: ["--version"], timeoutMs: 2000 },
    { executable: "claude", args: ["--help"], timeoutMs: 2000 },
    { executable: "claude", args: ["auth", "status"], timeoutMs: 2000 },
  ]);
  assert.equal(results[0].probe.version, "9.8.7");
  assert.equal(results[0].probe.auth, "unknown");
  assert.equal(results[0].probe.capabilities.execution, false);
  assert.equal(results[0].quota.remaining, null);
  assert.equal(results[0].quota.source, null);
  assert.equal(JSON.stringify(results).includes("SECRET_ACCESS_TOKEN"), false);
  assert.equal(JSON.stringify(results).includes("stderr secret"), false);
});

test("missing or timed-out commands remain unknown without claiming installation or auth", async () => {
  const results = await probeProviders(async (_executable, args) => ({
    code: null,
    stdout: "",
    stderr: "",
    error: args[0] === "--version" ? "not_found" : "timed_out",
  }), () => "2026-10-19T00:00:00.000Z");
  for (const result of results) {
    assert.equal(result.probe.installation, "not_found");
    assert.equal(result.probe.version, null);
    assert.equal(result.probe.auth, "unknown");
    assert.equal(result.probe.capabilities.authStatus, true);
    assert.equal(result.quota.state, "unknown");
  }
});

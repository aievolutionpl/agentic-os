import test from "node:test";
import assert from "node:assert/strict";
import { installPlan, installShellCommand, ProviderInstaller } from "../dist/main/provider-install.js";

test("installation preflight reports missing dependencies without spawning", () => {
  const plan = installPlan("codex", "win32", () => null);
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.missing, ["npm", "node"]);
  assert.equal(plan.executable, null);
  assert.throws(() => installPlan("__proto__"));
  assert.equal(installPlan("claude", "freebsd", () => "/bin/tool").ready, false);
});
test("catalog is platform-specific and shell wrapper preserves failed exit", () => {
  const windows = installPlan("antigravity", "win32", () => null);
  assert.match(windows.command, /^irm https:\/\/antigravity.google\//);
  assert.match(installPlan("claude", "linux", () => "/bin/tool").command, /install.sh/);
  assert.match(installShellCommand(windows.command, "win32"), /exit \$LASTEXITCODE/);
  assert.match(installShellCommand("npm install -g @openai/codex", "linux"), /pipefail/);
});
test("install cannot run without consent or inject renderer commands", async () => {
  const installer = new ProviderInstaller({ open() { throw Error("must not spawn"); } });
  await assert.rejects(installer.start({ agent: "codex" }), /CONSENT/);
  await assert.rejects(installer.start({ agent: "codex", consent: true, command: "anything" }), /INVALID_INPUT/);
  await assert.rejects(installer.start({ agent: "local", consent: true }), /UNSUPPORTED/);
});
test("opening a terminal or zero exit alone never confirms an installation", async () => {
  const installer = new ProviderInstaller({ list: () => [] });
  const status = await installer.status({ agent: "codex" });
  assert.equal(status.installed, false);
  assert.equal(status.session, null);
});

// Explicit opt-in only: two small real inference requests using existing CLI subscriptions.
// Never runs in CI and never receives an API key. Records pass/fail metadata, not model text.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectExecutables } from "../dist/main/provider-discovery.js";
import { CodexAdapter } from "../dist/main/providers.js";
import { CliAdapter } from "../dist/main/cli-provider.js";
if (process.env.AGENTING_SUBSCRIPTION_SMOKE !== "1")
  throw Error(
    "Set AGENTING_SUBSCRIPTION_SMOKE=1 to consume a small amount of subscription allowance.",
  );
const directory = mkdtempSync(join(tmpdir(), "agenting-live-readonly-"));
const marker = "workspace-readonly-check-2026";
const sample = `# Integration fixture\n\n${marker}\n`;
writeFileSync(join(directory, "README.md"), sample);
const commands = detectExecutables();
const report = {
  at: new Date().toISOString(),
  scope:
    "Real read-only inference on one temporary README using existing Codex/Claude subscriptions. No production project, API key, model transcript or account identifiers.",
  providers: {},
};
for (const agent of ["codex", "claude"]) {
  if (process.env.AGENTING_SMOKE_PROVIDER && process.env.AGENTING_SMOKE_PROVIDER !== agent) continue;
  if (!commands[agent]) {
    report.providers[agent] = { status: "not-installed" };
    continue;
  }
  const spec = {
    command: commands[agent],
    args: agent === "codex" ? ["app-server", "--listen", "stdio://"] : [],
    cwd: directory,
  };
  const adapter =
    agent === "codex"
      ? new CodexAdapter(spec)
      : new CliAdapter(spec, "claude-cli");
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    adapter.close();
  }, 60000);
  let stage = "provider-run";
  try {
    const result = await adapter.run({
      cwd: directory,
      prompt:
        "Read README.md in the current directory. Reply with only the verification marker found inside. Use your file-reading tool or a read-only command to read this one file. Do not modify any file or use the network. This is a read-only integration check.",
      readOnly: true,
      signal: controller.signal,
      session() {},
      activity() {},
    });
    stage = "verify-marker";
    assert.ok(result.summary.includes(marker), "Expected marker missing");
    stage = "verify-source";
    assert.equal(readFileSync(join(directory, "README.md"), "utf8"), sample);
    assert.deepEqual(readdirSync(directory), ["README.md"]);
    report.providers[agent] = {
      status: "passed",
      readExistingFile: true,
      sourceUnchanged: true,
    };
  } catch (error) {
    report.providers[agent] = {
      status: "failed",
      stage,
      errorType: error.name,
      code: /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "VERIFICATION_FAILED",
    };
  } finally {
    clearTimeout(timer);
    adapter.close();
    await adapter.stopped();
  }
}
const output = resolve("docs/evidence/workspace-06");
mkdirSync(output, { recursive: true });
if (process.env.AGENTING_SMOKE_PROVIDER) {
  try { const previous = JSON.parse(readFileSync(join(output, "live-inference.json"), "utf8")); report.providers = { ...previous.providers, ...report.providers }; } catch {}
}
writeFileSync(
  join(output, "live-inference.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (
  Object.values(report.providers).some(
    (provider) => provider.status !== "passed",
  )
)
  process.exitCode = 1;

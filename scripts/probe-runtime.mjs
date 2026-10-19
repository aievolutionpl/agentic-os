import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { CodexAdapter } from "../dist/main/providers.js";
const dir = mkdtempSync(join(tmpdir(), "agenting-protocol-probe-"));
const out = resolve("docs/evidence/stage-02");
mkdirSync(out, { recursive: true });
const result = {
  status: "running",
  platform: process.platform,
  at: new Date().toISOString(),
  scope:
    "Initialize + account/read using a new empty CODEX_HOME. No login, thread or turn start, model inference or paid call.",
  account: "unknown",
};
const client = new CodexAdapter({
  command: process.env.AGENTING_CODEX_COMMAND || "codex",
  args: ["app-server", "--listen", "stdio://"],
  cwd: dir,
  env: { CODEX_HOME: dir },
});
try {
  await client.initialize();
  const account = await client.account();
  result.account = account.account ? "present" : "absent";
  result.status = "passed";
  console.log(
    "PASS: installed Codex app-server initialize/account-read; no inference",
  );
} catch {
  result.status = "unavailable";
  process.exitCode = 1;
  console.error("App-server probe unavailable; no execution verified.");
} finally {
  client.close();
  writeFileSync(
    join(out, "protocol-probe.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  setTimeout(
    () =>
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      }),
    500,
  );
}

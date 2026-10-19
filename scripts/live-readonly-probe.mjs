import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { detectExecutables } from "../dist/main/provider-discovery.js";
import { CodexAdapter } from "../dist/main/providers.js";
import { codexQuota } from "../dist/main/quota.js";
import { defaultRunner } from "../dist/main/connectors.js";
import { openRouterRequest } from "../dist/main/openrouter.js";
const result = {
  at: new Date().toISOString(),
  scope:
    "Read-only installed CLI/account metadata and public catalog. No model inference; no raw credentials or personal account fields saved.",
  providers: {},
};
const executables = detectExecutables();
if (executables.codex) {
  const client = new CodexAdapter({
    command: executables.codex,
    args: ["app-server", "--listen", "stdio://"],
    cwd: mkdtempSync(join(tmpdir(), "agenting-live-probe-")),
  });
  try {
    await client.initialize();
    const account = await client.account();
    const limits = await client.rpc.request(
      "account/rateLimits/read",
      {},
      15000,
    );
    const card = codexQuota(limits, account);
    result.providers.codex = {
      installed: true,
      handshake: "passed",
      signedIn: !!account?.account,
      quotaSource: card.source,
      quotaWindows: card.metrics.length,
    };
  } catch (error) {
    result.providers.codex = {
      installed: true,
      result: "unavailable",
      code: error.message,
    };
  } finally {
    client.close();
    await client.stopped();
  }
} else result.providers.codex = { installed: false };
if (executables.claude) {
  const output = await defaultRunner(
    executables.claude,
    ["auth", "status"],
    15000,
  );
  try {
    const body = JSON.parse(output.stdout);
    result.providers.claude = {
      installed: true,
      authProbe: output.code === 0 ? "passed" : "failed",
      signedIn: body.loggedIn === true,
      method: body.authMethod,
    };
  } catch {
    result.providers.claude = { installed: true, authProbe: "unavailable" };
  }
}
result.providers.opencode = {
  installed: !!executables.opencode,
  inference: "not-run",
};
result.providers.antigravity = {
  installed: !!executables.antigravity,
  inference: "not-run",
};
try {
  const catalog = await openRouterRequest("/models");
  result.providers.openrouter = {
    publicCatalog: "passed",
    modelCount: catalog.data?.length,
    authenticatedQuota: "not-run-no-key",
    inference: "not-run",
  };
} catch (error) {
  result.providers.openrouter = {
    publicCatalog: "unavailable",
    code: error.message,
    inference: "not-run",
  };
}
mkdirSync(resolve("docs/evidence/workspace-06"), { recursive: true });
writeFileSync(
  resolve("docs/evidence/workspace-06/live-probe.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));

// Explicit opt-in: existing Codex/Claude subscriptions, disposable files and public GitHub fixture only.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { detectExecutables } from "../dist/main/provider-discovery.js";
if (process.env.AGENTING_SUBSCRIPTION_SMOKE !== "1")
  throw Error("EXPLICIT_OPT_IN_REQUIRED");
const dir = mkdtempSync(join(tmpdir(), "agenting-live-chat-")),
  profile = join(dir, "profile"),
  folder = join(dir, "plain-project");
mkdirSync(profile);
mkdirSync(folder);
const marker = "evolution-chat-proof-2026";
writeFileSync(
  join(folder, "README.md"),
  `# Disposable fixture\nMarker: ${marker}\n`,
);
const detected = detectExecutables();
assert.ok(detected.codex && detected.claude);
const store = new Store(join(profile, "agenting.sqlite"));
store.runs.configure("codex", detected.codex, [], "codex", "existing");
store.runs.configure("claude", detected.claude, [], "claude-cli", "existing");
if (detected.gemini)
  store.runs.configure(
    "gemini",
    detected.gemini,
    ["--experimental-acp"],
    "acp",
    "existing",
  );
if (detected.hermes)
  store.runs.configure("hermes", detected.hermes, ["acp"], "acp", "existing");
store.close();
const output = resolve("docs/evidence/harness-08/live");
mkdirSync(output, { recursive: true });
const report = {
  at: new Date().toISOString(),
  status: "running",
  checks: [],
  providers: {},
  errors: [],
  scope:
    "Existing CLI subscriptions; read-only chat turns in temporary projects. GitHub test clones public octocat/Hello-World; no push.",
};
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function wait(id) {
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const chat = (await page.evaluate(() => window.agenting.chatList())).find(
      (c) => c.id === id,
    );
    if (chat.status !== "running") return chat;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("LIVE_CHAT_TIMEOUT");
}
try {
  app = await electron.launch({ args: [resolve(".")], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page
    .getByRole("button", { name: "Otwórz rozmowę", exact: true })
    .waitFor({ timeout: 90000 });
  for (const agent of ["codex", "claude", "gemini", "hermes"]) {
    if (!detected[agent]) {
      report.providers[agent] = { detected: false };
      continue;
    }
    const h = await page.evaluate(
      (agent) => window.agenting.providerCheck({ agent }),
      agent,
    );
    report.providers[agent] = {
      detected: true,
      state: h.state,
      detail: h.detail,
      modelCount: h.models.length,
    };
  }
  for (const agent of ["codex", "claude"]) {
    const chat = await page.evaluate(
      ({ agent, folder }) =>
        window.agenting.chatCreate({
          agent,
          mode: "plan",
          source: "local",
          path: folder,
        }),
      { agent, folder },
    );
    await page.evaluate(
      (id) =>
        window.agenting.chatSend({
          id,
          message:
            "Read only README.md in this current directory. Reply with its Marker value, one line only. Do not edit files or use network.",
          contextIds: [],
          skillIds: [],
          consent: true,
        }),
      chat.id,
    );
    let result = await wait(chat.id);
    assert.equal(result.status, "idle", `${agent}: ${result.error}`);
    assert.ok(result.messages.at(-1).content.includes(marker));
    await page.evaluate(
      (id) =>
        window.agenting.chatSend({
          id,
          message:
            "Repeat the exact Marker from our preceding exchange. Use conversation history; do not use tools. One line only.",
          contextIds: [],
          skillIds: [],
          consent: true,
        }),
      chat.id,
    );
    result = await wait(chat.id);
    assert.equal(result.status, "idle", `${agent}: ${result.error}`);
    assert.ok(result.messages.at(-1).content.includes(marker));
    assert.equal(result.messages.length, 4);
    report.checks.push(
      `${agent}-live-two-turn-chat-history-and-readonly-local-folder`,
    );
    console.log(report.checks.at(-1));
  }
  const github = await page.evaluate(() =>
    window.agenting.chatCreate({
      agent: "codex",
      mode: "plan",
      source: "github",
      repository: "octocat/Hello-World",
    }),
  );
  assert.equal(github.source, "github");
  assert.ok(existsSync(join(github.root, ".git")));
  report.checks.push("real-github-cli-public-repository-clone");
  const quota = await page.evaluate(() => window.agenting.quotaRefresh());
  const codex = quota.find((q) => q.id === "codex");
  assert.equal(codex.source, "codex-app-server");
  assert.ok(codex.metrics.length);
  report.checks.push("real-codex-subscription-limits-over-official-app-server");
  assert.equal(
    readFileSync(join(folder, "README.md"), "utf8"),
    `# Disposable fixture\nMarker: ${marker}\n`,
  );
  report.checks.push("source-file-unchanged");
  await page.reload();
  await page.locator(".chat-history>button").first().waitFor();
  await page
    .locator(".chat-history>button")
    .filter({ hasText: "Read only README" })
    .first()
    .click();
  await page.screenshot({
    path: join(output, "live-conversation.png"),
    fullPage: true,
  });
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.error = String(e);
  console.error(report.error);
  process.exitCode = 1;
  await page?.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
  await app?.close();
}

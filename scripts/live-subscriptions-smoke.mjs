// Explicit opt-in. Uses existing subscriptions, temporary app data and two tiny turns per provider.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
if (process.env.AGENTING_SUBSCRIPTION_SMOKE !== "1")
  throw Error("EXPLICIT_OPT_IN_REQUIRED");
const profile = mkdtempSync(join(tmpdir(), "agenting-subscription-ui-"));
const output = resolve(
  process.env.AGENTING_QA_OUTPUT || "docs/evidence/subscriptions-09/live",
);
mkdirSync(output, { recursive: true });
const report = {
  at: new Date().toISOString(),
  status: "running",
  checks: [],
  providers: {},
  errors: [],
  scope:
    "Real native Electron IPC and existing Hermes ChatGPT/Codex / Antigravity Google subscriptions. Temporary app data; no API keys, source edits or push.",
};
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function wait(id) {
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const c = (await page.evaluate(() => window.agenting.chatList())).find(
      (c) => c.id === id,
    );
    if (c.status !== "running") return c;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("LIVE_TURN_TIMEOUT");
}
try {
  app = await electron.launch({ args: [resolve(".")], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page
    .getByRole("button", { name: "Otwórz rozmowę", exact: true })
    .waitFor({ timeout: 60000 });
  for (const agent of ["hermes", "antigravity"]) {
    await page.evaluate(
      (agent) =>
        window.agenting.providerConnectDetected({ agent, consent: true }),
      agent,
    );
    const health = await page.evaluate(
      (agent) => window.agenting.providerCheck({ agent }),
      agent,
    );
    assert.equal(health.state, "connected", health.detail);
    const preferred =
      agent === "hermes" ? "openai-codex:gpt-6.1-sol" : "gemini-4-argon-medium";
    const model =
      health.models.find((m) => m.id === preferred) ??
      health.models.find((m) =>
        agent === "hermes"
          ? m.id.startsWith("openai-codex:")
          : m.id.startsWith("gemini-"),
      );
    assert.ok(model, "Subscription model not available");
    const config = (
      await page.evaluate(() => window.agenting.providerSettings())
    ).find((p) => p.id === agent);
    await page.evaluate(
      ({ agent, config, model }) =>
        window.agenting.configureProvider({
          agent,
          command: config.command,
          args: config.args,
          protocol: config.protocol,
          profile: "existing",
          model: model.id,
          consent: true,
        }),
      { agent, config, model },
    );
    const c = await page.evaluate(
      (agent) =>
        window.agenting.chatCreate({ agent, mode: "chat", source: "default" }),
      agent,
    );
    const marker =
      agent === "hermes"
        ? "HERMES_SUBSCRIPTION_READY"
        : "GOOGLE_SUBSCRIPTION_READY";
    for (const message of [
      `Reply with exactly ${marker}. Do not use tools or edit files.`,
      `Repeat the exact marker from our preceding exchange. Use conversation history only; no tools or file changes.`,
    ]) {
      await page.evaluate(
        ({ id, message }) =>
          window.agenting.chatSend({
            id,
            message,
            contextIds: [],
            skillIds: [],
            consent: true,
          }),
        { id: c.id, message },
      );
      const result = await wait(c.id);
      assert.equal(result.status, "idle", `${agent}: ${result.error}`);
      assert.ok(
        result.messages.at(-1).content.includes(marker),
        `${agent}: marker mismatch`,
      );
    }
    report.providers[agent] = {
      state: "live-verified",
      model: model.id,
      turns: 2,
    };
    report.checks.push(`${agent}-subscription-two-turn-chat-over-native-ipc`);
    await page.reload();
    await page.locator(".chat-history>button").first().waitFor();
    await page
      .locator(".chat-history>button")
      .filter({ hasText: marker })
      .first()
      .click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: join(output, `${agent}-chat.png`),
      fullPage: true,
    });
  }
  await page.reload();
  await page.locator(".chat-history>button").first().waitFor();
  const persisted = await page.evaluate(() =>
    window.agenting.providerSettings(),
  );
  for (const agent of ["hermes", "antigravity"])
    assert.equal(
      persisted.find((p) => p.id === agent).model,
      report.providers[agent].model,
    );
  report.checks.push(
    "selected-subscription-models-persist-after-renderer-restart",
  );
  await page.evaluate(() =>
    window.agenting.providerConnectDetected({ agent: "gemini", consent: true }),
  );
  const gemini = await page.evaluate(() =>
    window.agenting.providerCheck({ agent: "gemini" }),
  );
  assert.equal(gemini.detail, "GEMINI_SUBSCRIPTION_MOVED");
  report.providers.gemini = { state: gemini.state, detail: gemini.detail };
  report.checks.push(
    "gemini-personal-account-deprecation-reported-without-api-fallback",
  );
  await page
    .locator(".primary-nav")
    .getByRole("button", { name: "Połączenia i modele", exact: true })
    .click();
  await page
    .locator(".provider-picker")
    .getByRole("button", { name: /^Hermes/ })
    .click();
  await page
    .getByRole("button", { name: "Sprawdź połączenie", exact: true })
    .click();
  await page
    .getByLabel("Model w Agenting OS", { exact: true })
    .getByRole("option", { name: /ChatGPT/ })
    .first()
    .waitFor({ state: "attached" });
  await page.screenshot({
    path: join(output, "hermes-connection.png"),
    fullPage: true,
  });
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  console.error(report.error);
  process.exitCode = 1;
  await page?.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
  await app?.close();
}

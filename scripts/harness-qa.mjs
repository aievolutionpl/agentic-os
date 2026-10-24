// Contrast assertions cover solid paint only; gradients/glass require qa:calm and visual review.
import {navigateWorkspace, chooseTheme} from "./workspace-navigation.mjs";
// Native Electron UI/IPC integration with a deterministic app-server process fixture.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";
const profile = mkdtempSync(join(tmpdir(), "agenting-harness-qa-"));
const store = new Store(join(profile, "agenting.sqlite"));
store.runs.configure(
  "codex",
  process.execPath,
  [resolve("tests/fixtures/codex-server.mjs")],
  "codex",
  "existing",
);
store.close();
const output = resolve(
  process.env.AGENTING_QA_OUTPUT || "docs/evidence/harness-08/ui",
);
mkdirSync(output, { recursive: true });
const report = {
  contrastScope: "Solid paint only. Gradient/glass text needs separate palette checks and visual review; not a WCAG certification.",
  status: "running",
  checks: [],
  screenshots: [],
  errors: [],
  scope:
    "Native Electron and real app-server protocol fixture; no live model calls or real quota data.",
};
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function nav(name) { await navigateWorkspace(page, name); }
async function waitChat() {
  for (let i = 0; i < 120; i++) {
    const chat = (await page.evaluate(() => window.agenting.chatList()))[0];
    if (chat && chat.status !== "running" && chat.messages.length) return chat;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("CHAT_TIMEOUT");
}
try {
  app = await electron.launch({
    args: [
      resolve("."),
      ...(process.env.AGENTING_TEST_NO_SANDBOX === "1"
        ? ["--no-sandbox", "--no-zygote"]
        : []),
    ],
    env,
    timeout: 30000,
  });
  page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page
    .getByRole("button", { name: "Otwórz rozmowę", exact: true })
    .waitFor();
  await page.locator(".agent-menu > summary").click();
  assert.equal(
    await page
      .getByRole("group", { name: "Agent czatu", exact: true })
      .locator('button[aria-pressed="true"] strong')
      .innerText(),
    "Codex",
  );
  await page.locator(".agent-menu > summary").click();
  await page
    .getByRole("button", { name: "Otwórz rozmowę", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Wiadomość do agenta", exact: true })
    .fill("Zaplanuj zmianę UI w projekcie testowym.");
  await page.getByRole("button", { name: "Wyślij", exact: true }).click();
  let chat = await waitChat();
  assert.equal(chat.status, "idle", chat.error);
  assert.match(chat.messages.at(-1).content, /Fixture chat reply/);
  report.checks.push("default-workspace-real-git-chat-turn-over-native-ipc");
  await page
    .locator(".message-actions")
    .getByRole("button", { name: "Zapamiętaj", exact: true })
    .last()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Treść pamięci" })
    .fill(
      "Standard QA: interfejs cyan i violet; sprawdzaj rzeczywiste wyniki.",
    );
  await dialog
    .getByLabel("Widoczność", { exact: true })
    .selectOption("workspace");
  await dialog
    .getByRole("button", { name: "Zapisz pamięć", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await nav("Wspólna pamięć");
  await page
    .getByText(
      "Standard QA: interfejs cyan i violet; sprawdzaj rzeczywiste wyniki.",
      { exact: true },
    )
    .waitFor();
  await page.locator(".memory-library article").filter({ hasText: "Standard QA:" }).getByRole("button", { name: "Edytuj wpis", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const memory = await page.evaluate(() => window.agenting.memoryList());
  assert.equal(memory[0].pinned, 1);
  const context = await page.evaluate(
    (id) =>
      window.agenting.contextPreview({
        projectId: id,
        contextIds: [],
        workflow: "research",
        skillIds: [],
      }),
    chat.projectId,
  );
  assert.match(context.body, /Standard QA/);
  report.checks.push("chat-memory-save-edit-pin-auto-context-over-ipc");
  await nav("Biblioteka skilli");
  await page
    .getByRole("textbox", { name: "Szukaj skilli" })
    .fill("systematic debugging");
  assert.equal(await page.locator(".skill-library article").count(), 1);
  await page.getByRole("button", { name: "Zobacz instrukcje" }).click();
  dialog = page.getByRole("dialog");
  assert.match(await dialog.innerText(), /MIT/);
  assert.match(await dialog.locator("pre").innerText(), /Root Cause/);
  await dialog.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page.getByRole("textbox", { name: "Szukaj skilli" }).fill("");
  assert.equal(await page.locator(".skill-library article").count(), 33);
  report.checks.push("thirty-three-skills-search-and-licensed-source-preview");
  await nav("Czaty");
  await page.locator(".chat-history>button").first().waitFor({ state: "attached" });
  if (!(await page.locator(".chat-history").isVisible()))
    await page.getByRole("button", { name: "Historia", exact: true }).click();
  await page.locator(".chat-history>button").first().click();
  await page
    .getByRole("textbox", { name: "Wiadomość do agenta" })
    .fill("Doprecyzuj kryteria odbioru.");
  await page.getByRole("button", { name: "Wyślij", exact: true }).click();
  chat = await waitChat();
  assert.equal(chat.messages.length, 4);
  assert.ok(chat.contextIds.includes(memory[0].id));
  report.checks.push("multi-turn-history-and-pinned-shared-memory");
  await page
    .locator(".message-actions")
    .getByRole("button", { name: "Utwórz zadanie", exact: true })
    .last()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Utwórz zadanie", exact: true })
    .click();
  await page
    .locator(".task-list")
    .waitFor()
    .catch(() =>
      page.getByRole("heading", { name: /Zaplanuj zmianę/ }).waitFor(),
    );
  const data = await page.evaluate(
    (id) => window.agenting.projectData(id),
    chat.projectId,
  );
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].status, "draft");
  report.checks.push("chat-to-draft-task-with-independent-reviewer");
  await nav("Limity i tokeny");
  await page.locator('[data-quota="codex"] .budget-gauge').waitFor();
  assert.match(await page.locator('[data-quota="codex"]').innerText(), /75%/);
  report.checks.push("automatic-official-quota-protocol-read-fixture");
  for (const theme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.theme)) !==
      theme
    )
      await chooseTheme(page, theme === "light" ? "Pearl" : "Midnight");
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(
        (n) => Boolean(document.querySelector(".projects-toggle")?.checkVisibility()) === n,
        width <= 760,
      );
      for (const [key, label] of [
        ["chat", "Czaty"],
        ["memory", "Wspólna pamięć"],
        ["skills", "Biblioteka skilli"],
        ["connections", "Połączenia i modele"],
        ["quota", "Limity i tokeny"],
      ]) {
        await nav(label);
        if (key === "chat")
          await page
            .getByRole("button", { name: "Nowy czat", exact: true })
            .click();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.race([new Promise(resolve => setTimeout(resolve, 1000)), Promise.all(
            document
              .getAnimations()
              .filter(
                (a) => a.effect?.getComputedTiming().iterations !== Infinity,
              )
              .map((a) => a.finished.catch(() => {})),
          )]);
        });
        await page.mouse.move(0, 0);
        const file = `${key}-${theme}-${width}.png`;
        await page.screenshot({ path: join(output, file), fullPage: true, animations: "disabled" });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        const contrastFailures = (await page.evaluate(collectContrast))
          .map((row) => ({
            ...row,
            ...measure(row),
            threshold: threshold(row.size, row.weight),
          }))
          .filter(
            (row) =>
              !row.disabled &&
              (!row.unsupported.length && row.ratio < row.threshold),
          )
          .map((row) => ({
            text: row.text,
            ratio: row.ratio,
            threshold: row.threshold,
            unsupported: row.unsupported,
          }));
        report.screenshots.push({ file, overflow, contrastFailures });
        console.log(
          `${file}: overflow=${overflow}, contrast=${contrastFailures.length}`,
        );
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => !document.querySelector(".projects-toggle")?.checkVisibility());
  await nav("Czaty");
  await page.locator(".chat-history>button").first().waitFor({ state: "attached" });
  if (!(await page.locator(".chat-history").isVisible()))
    await page.getByRole("button", { name: "Historia", exact: true }).click();
  await page.locator(".chat-history>button").first().click();
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => {
      const box = document
        .querySelector(".chat-composer")
        ?.getBoundingClientRect();
      return box && box.top >= 0 && box.bottom <= innerHeight;
    });
    await page.screenshot({
      path: join(output, `conversation-light-${width}.png`),
      fullPage: true,
    });
  }
  report.checks.push("conversation-composer-remains-visible-at-desktop-sizes");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: join(output, "conversation-light-1440.png"),
    fullPage: true,
  });
  assert.deepEqual(report.errors, []);
  assert.equal(
    report.screenshots.some((s) => s.overflow || s.contrastFailures.length),
    false,
  );
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.error = String(e);
  process.exitCode = 1;
  console.error(report.error);
  await page?.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
  await app?.close();
}


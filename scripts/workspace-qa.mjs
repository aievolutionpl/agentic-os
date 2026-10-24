// Contrast assertions cover solid paint only; gradients/glass require qa:calm and visual review.
import {navigateWorkspace, chooseTheme} from "./workspace-navigation.mjs";
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
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";
const output = resolve(
  process.env.AGENTING_QA_OUTPUT || "docs/evidence/workspace-06/ui",
);
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "agenting-workspace-ui-"));
const store = new Store(join(profile, "agenting.sqlite"));
const a = store.createProject({
  name: "AI Evolution · Workspace QA",
  root: "",
  master: "codex",
});
const b = store.createProject({
  name: "Projekt lokalny · QA",
  root: "",
  master: "claude",
});
const first = store.createTask({
  projectId: a.id,
  title: "Sprawdź dostępność nowego interfejsu",
  implementer: "codex",
  reviewer: "claude",
});
// A dependent task, so the Team view also shows its task graph.
const second = store.createTask({
  projectId: a.id,
  title: "Opisz wyniki przeglądu",
  implementer: "claude",
  reviewer: "codex",
});
store.taskAction({
  projectId: a.id,
  id: second.id,
  action: "dependencies",
  dependencyIds: [first.id],
});
store.createMemory({
  projectId: a.id,
  content:
    "Materiał QA: komunikacja po polsku; raportuj rzeczywiście wykonane testy.",
  source: "Test workspace",
  scope: "workspace",
});
store.createMemory({
  projectId: a.id,
  content: "Prywatny wpis QA",
  source: "Test project",
});
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const result = {
  contrastScope: "Solid paint only. Gradient/glass text needs separate palette checks and visual review; not a WCAG certification.", status: "running", screenshots: [], errors: [], checks: [] };
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
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page
    .getByRole("button", { name: `Otwórz projekt: ${a.name}`, exact: true })
    .waitFor({ timeout: 90000 });
  page.on("pageerror", (error) => result.errors.push(error.message));
  await navigateWorkspace(page, "Centrum dowodzenia");
  await page
    .locator(".connector-card:not(.skeleton-card)")
    .first()
    .waitFor({ timeout: 60000 });
  async function nav(name) { await navigateWorkspace(page, name); }
  await nav("Limity i tokeny");
  // Unconnected subscriptions are hidden rather than advertised as active.
  await page.getByRole("button", { name: "Dodaj budżet", exact: true }).waitFor();
  assert.equal(
    await page.locator('[data-quota="antigravity"]').count(),
    0,
  );
  await page.getByRole("button", { name: "Dodaj budżet", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Nazwa budżetu" })
    .fill("Budżet demonstracyjny QA");
  await dialog
    .getByRole("spinbutton", { name: "Limit tokenów" })
    .fill("100000");
  await dialog.getByRole("spinbutton", { name: "Zużyte tokeny" }).fill("25000");
  await dialog.getByRole("button", { name: "Zapisz budżet" }).click();
  await page
    .getByRole("heading", { name: "Budżet demonstracyjny QA" })
    .waitFor();
  const manual = page.locator(".budget-card").filter({
    has: page.getByRole("heading", { name: "Budżet demonstracyjny QA" }),
  });
  assert.match(await manual.innerText(), /75%/);
  assert.match(await manual.innerText(), /Wpis ręczny/);
  await manual.getByRole("button", { name: "Edytuj" }).click();
  await dialog.getByRole("spinbutton", { name: "Zużyte tokeny" }).fill("40000");
  await dialog.getByRole("button", { name: "Zapisz budżet" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-quota^="custom"]')
      ?.textContent.includes("60%"),
  );
  result.checks.push("manual-budget-create-edit-persisted");
  await nav("Połączenia i modele");
  assert.equal(await page.getByRole("group", { name: "Wybierz agenta", exact: true }).getByRole("button").count(), 6);
  await page
    .locator(".provider-picker")
    .getByRole("button", { name: /Claude Code/ })
    .click();
  assert.match(
    await page.locator(".connection-note").innerText(),
    /claude auth login/,
  );
  // The API key and the optional management key (balance only) are masked.
  assert.equal(
    await page.locator('.router-setup input[type="password"]').count(),
    2,
  );
  result.checks.push("six-provider-setup-and-masked-api-key");
  const local = page.locator(".local-model-setup");
  await local
    .getByRole("textbox", { name: "Identyfikator modelu", exact: true })
    .fill("qa-fixture-local");
  await local
    .getByRole("button", { name: "Zapisz lokalny model", exact: true })
    .click();
  await local
    .getByText("Zapisano. Połącz profil Lokalny LLM z OpenCode powyżej.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.agenting.localModelSettings())).model,
    "qa-fixture-local",
  );
  const invalidLocal = await page.evaluate(() =>
    window.agenting
      .localModelSave({ baseURL: "https://example.com/v1", model: "bad" })
      .then(
        () => false,
        () => true,
      ),
  );
  assert.equal(invalidLocal, true);
  await local
    .getByRole("button", { name: "Usuń konfigurację", exact: true })
    .click();
  await local.getByText("Usunięto konfigurację.", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate(() => window.agenting.localModelSettings()))
      .configured,
    false,
  );
  result.checks.push(
    "local-model-settings-native-ipc-save-remove-and-loopback-validation",
  );
  const vault = await page.evaluate(() => window.agenting.openRouterSettings());
  if (vault.encryptionAvailable) {
    const dummy = "sk-or-qa-not-a-real-key-123456789";
    const saved = await page.evaluate(
      (apiKey) =>
        window.agenting.openRouterSave({
          apiKey,
          model: "qa/fixture",
          consent: true,
        }),
      dummy,
    );
    assert.equal(saved.configured, true);
    assert.equal(JSON.stringify(saved).includes(dummy), false);
    const encrypted = JSON.parse(
      readFileSync(join(profile, "openrouter-connection.json"), "utf8"),
    );
    assert.equal(JSON.stringify(encrypted).includes(dummy), false);
    assert.equal(
      await app.evaluate(
        ({ safeStorage }, value) =>
          safeStorage.decryptString(Buffer.from(value, "base64")),
        encrypted.encryptedKey,
      ),
      dummy,
    );
    await page.evaluate(() => window.agenting.openRouterRemove());
    assert.equal(
      existsSync(join(profile, "openrouter-connection.json")),
      false,
    );
    result.checks.push(
      "native-safeStorage-encrypt-decrypt-remove-dummy-key-no-network",
    );
  } else {
    await assert.rejects(
      page.evaluate(() =>
        window.agenting.openRouterSave({
          apiKey: "sk-or-qa-not-a-real-key-123456789",
          model: "qa/fixture",
          consent: true,
        }),
      ),
    );
    result.checks.push(
      "native-safeStorage-unavailable-refuses-key-persistence",
    );
  }
  const shared = await page.evaluate(
    (id) => window.agenting.projectData(id),
    b.id,
  );
  assert.equal(shared.memory.length, 1);
  assert.equal(shared.memory[0].scope, "workspace");
  result.checks.push("shared-memory-visible-private-memory-excluded-over-ipc");
  for (const theme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.theme)) !==
      theme
    ) {
      await chooseTheme(page, theme === "light" ? "Pearl" : "Midnight");
      await page.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
      );
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(
        (expected) =>
          Boolean(document.querySelector(".projects-toggle")?.checkVisibility()) === expected,
        width <= 760,
      );
      for (const [label, name] of [
        ["center", "Centrum dowodzenia"],
        ["quota", "Limity i tokeny"],
        ["connections", "Połączenia i modele"],
        ["team", "Zadania"],
        ["master", "Master Agent"],
        ["skills", "Rozszerzenia"],
      ]) {
        if (["team", "skills", "master"].includes(label)) {
          if (await page.locator(".projects-toggle").isVisible())
            await page.locator(".projects-toggle").click();
          await page.getByRole("button", { name: `Otwórz projekt: ${a.name}`, exact: true }).click();
          await page
            .locator(".tabs")
            .getByRole("button", { name: new RegExp(`^${name}`) })
            .click();
          if (label === "skills") {
            await page.getByText("frontend design", { exact: true }).waitFor();
            assert.equal(await page.locator(".extension-list > li").count(), 33);
            await page
              .getByRole("searchbox", { name: "Szukaj skilla lub narzędzia" })
              .fill("verification before completion");
            assert.equal(await page.locator(".extension-list > li").count(), 1);
            await page
              .getByRole("searchbox", { name: "Szukaj skilla lub narzędzia" })
              .fill("");
          }
        } else await nav(name);
        if (label === "quota")
          await page.locator(".budget-card").first().waitFor();
        if (label === "connections")
          await page.locator(".provider-picker").waitFor();
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
        const file = `${label}-${theme}-${width}.png`;
        await page.screenshot({ path: join(output, file), fullPage: true });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        const failures = (await page.evaluate(collectContrast))
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
        result.screenshots.push({ file, overflow, contrastFailures: failures });
        console.log(
          `${label} ${theme} ${width}: overflow=${overflow}, contrast=${failures.length}`,
        );
      }
    }
  }
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.screenshots.some((s) => s.overflow || s.contrastFailures.length),
    false,
  );
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.error = String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2));
  await app?.close();
}


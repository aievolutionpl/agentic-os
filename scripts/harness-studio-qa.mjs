import {navigateWorkspace} from "./workspace-navigation.mjs";
// Native Electron + real SQLite/IPC. Synthetic projects only; no model calls.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Store } from "../dist/main/store.js";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";
const profile = mkdtempSync(join(tmpdir(), "agenting-harness-studio-"));
const output = resolve(
  process.env.AGENTING_QA_OUTPUT
    ? join(process.env.AGENTING_QA_OUTPUT, "harness-studio")
    : ".runtime/harness-studio-qa",
);
mkdirSync(output, { recursive: true });
const store = new Store(join(profile, "agenting.sqlite"));
store.setPreferences({ language: "pl", theme: "classic" });
const a = store.createProject({
  name: "AI Evolution · Harness",
  root: "",
  master: "codex",
});
const b = store.createProject({
  name: "Private project B",
  root: "",
  master: "claude",
});
store.createMemory({
  projectId: a.id,
  content: "Dostępność formularzy\nKażde pole ma etykietę i czytelny błąd.",
  source: "design:verified",
});
store.createMemory({
  projectId: b.id,
  content: "PRIVATE_CLIENT_B",
  source: "user:private",
});
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const report = {
  contrastScope: "Solid paint only. Gradient/glass text needs separate palette checks and visual review; not a WCAG certification.",
  status: "running",
  checks: [],
  screens: [],
  errors: [],
  scope:
    "Native Electron, real IPC and SQLite, synthetic data; no model inference.",
};
let app, page;
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
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.locator('main[aria-busy="false"]').waitFor();
  const nav = name => navigateWorkspace(page, name);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await nav("Harness");
  await page
    .getByLabel("Zasady Twojego zespołu")
    .fill("Odpowiadaj po polsku. Przekazuj dowody testów i źródła decyzji.");
  assert.equal(
    await page
      .getByRole("button", { name: "Sprawdź kontekst", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Zapisz instrukcję", exact: true })
    .click();
  await page
    .getByText("Zapisano. Nowe uruchomienia otrzymają tę instrukcję.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.agenting.harnessGet())).revision,
    1,
  );
  await page
    .getByLabel("Projekt kontekstu", { exact: true })
    .selectOption(a.id);
  await page
    .getByLabel("Cel zadania do wyszukania pamięci", { exact: true })
    .fill("Dostępność formularzy");
  await page
    .getByRole("button", { name: "Sprawdź kontekst", exact: true })
    .click();
  await page.locator(".harness-manifest").waitFor();
  assert.match(
    await page.locator(".harness-manifest").innerText(),
    /Przywołane/,
  );
  assert.ok(
    !(await page.locator(".harness-preview").innerText()).includes(
      "PRIVATE_CLIENT_B",
    ),
  );
  report.checks.push("saved-instructions-and-scoped-retrieval-over-real-ipc");
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: join(output, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    const failures = (await page.evaluate(collectContrast))
      .map((r) => ({ ...r, ...measure(r) }))
      .filter(
        (r) =>
          !r.disabled &&
          (!r.unsupported.length && r.ratio < threshold(r.size, r.weight)),
      )
      .map((r) => ({
        text: r.text,
        ratio: r.ratio,
        unsupported: r.unsupported,
      }));
    report.screens.push({ name, overflow, failures });
    assert.equal(overflow, false, name);
    assert.equal(
      failures.length,
      0,
      `${name}: ${JSON.stringify(failures.slice(0, 8))}`,
    );
  }
  await page.getByLabel("Zasady Twojego zespołu").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("type")), "checkbox");
  report.checks.push("keyboard-access-to-settings");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await capture(`harness-classic-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByLabel("Projekt kontekstu", { exact: true })
    .selectOption(b.id);
  assert.equal(await page.locator(".harness-preview").count(), 0);
  await page
    .getByRole("button", { name: "Sprawdź kontekst", exact: true })
    .click();
  await page.locator(".harness-preview").waitFor();
  assert.ok(
    !(await page.locator(".harness-manifest").innerText()).includes(
      "design:verified",
    ),
  );
  report.checks.push(
    "project-change-invalidates-preview-and-does-not-leak-memory",
  );
  await page.getByLabel("Zasady Twojego zespołu").fill("Unsaved local edit");
  await page.evaluate(async () => {
    const value = await window.agenting.harnessGet();
    await window.agenting.harnessSave({
      instructions: "Concurrent saved edit",
      revision: value.revision,
      recallLimit: 4,
      autoRecall: true,
    });
  });
  await page
    .getByRole("button", { name: "Zapisz instrukcję", exact: true })
    .click();
  await page
    .getByText("Ustawienia zostały zmienione", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Zasady Twojego zespołu").inputValue(),
    "Unsaved local edit",
  );
  await page
    .getByRole("button", { name: "Wczytaj zapisane ustawienia", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("#harness-instructions").value ===
      "Concurrent saved edit",
  );
  report.checks.push("concurrent-save-conflict-preserves-draft-and-recovers");
  await page.locator("#harness-team-title").scrollIntoViewIfNeeded();
  await capture("harness-providers-classic-1440");
  await page.locator("#harness-title").scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "Kolorystyka", exact: true }).click();
  await page.getByRole("option", { name: "Midnight", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await capture("harness-dark-1440");
  await page
    .getByRole("button", { name: "Pamięć i źródła", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Eksportuj AGENTS.md", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByLabel("Projekt do eksportu pamięci", { exact: true })
    .selectOption(a.id);
  const exported = await page.evaluate(
    (id) => window.agenting.memoryExport({ projectId: id }),
    a.id,
  );
  assert.match(exported, /Dostępność/);
  assert.ok(!exported.includes("PRIVATE_CLIENT_B"));
  await page
    .getByRole("button", { name: "Eksportuj AGENTS.md", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skopiowano AGENTS.md", exact: true })
    .waitFor();
  report.checks.push("explicit-project-export-and-clipboard");
  await page.evaluate(async () => {
    const value = await window.agenting.snapshot();
    await window.agenting.setPreferences({
      ...value.preferences,
      language: "en",
    });
  });
  await page.reload();
  await page.locator('main[aria-busy="false"]').waitFor();
  await nav("Harness");
  await page.getByLabel("Your team's working rules").waitFor();
  await capture("harness-en-dark-1440");
  await page
    .getByRole("button", { name: "Project MCP and extensions", exact: true })
    .click();
  await page.locator(".extensions-panel").waitFor();
  assert.equal(await page.locator(".harness-studio").count(), 0);
  report.checks.push("English-labels-persistence-and-tools-navigation");
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
  await page
    ?.screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
} finally {
  writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
  await app?.close();
}

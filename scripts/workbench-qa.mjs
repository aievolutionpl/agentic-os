// Contrast assertions cover solid paint only; gradients/glass require qa:calm and visual review.
import {navigateWorkspace, chooseTheme} from "./workspace-navigation.mjs";
// Real Electron + PTY + a deterministic agent fixture. No live inference or paid calls.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";

const output = resolve(
  process.env.AGENTING_QA_OUTPUT || ".runtime/workbench-qa",
);
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "agenting-workbench-"));
const projectRoot = join(profile, "example-project");
mkdirSync(projectRoot);
writeFileSync(
  join(projectRoot, "README.md"),
  "# Przykładowy projekt\n\nDane demonstracyjne do testu aplikacji.\n",
);
const store = new Store(join(profile, "agenting.sqlite"));
store.setPreferences({ language: "pl", theme: "dark" });
store.runs.configure(
  "codex",
  process.execPath,
  [resolve("tests/fixtures/codex-server.mjs")],
  "codex",
  "existing",
);
const project = store.createProject({
  name: "Przykład · aplikacja klienta",
  root: projectRoot,
  master: "codex",
});
const task = store.createTask({
  projectId: project.id,
  title: "Sprawdź kryteria odbioru i uruchom testy",
  implementer: "codex",
  reviewer: "claude",
});
store.taskAction({ projectId: project.id, id: task.id, action: "queue" });
store.createMemory({
  projectId: project.id,
  content:
    "Dane przykładowe: interfejs po polsku, angielski jako drugi język. Zmiany wymagają testów i recenzji.",
  source: "Przykładowa decyzja zespołu",
  scope: "project",
});
const example = [
  "## Plan pracy",
  "To **przykładowa odpowiedź**, przygotowana do prezentacji interfejsu. Nie pochodzi z wywołania modelu.",
  "1. Ustal cel i kryteria odbioru.",
  "2. Wybierz wykonawcę oraz niezależnego recenzenta.",
  "3. Sprawdź testy i diff przed zatwierdzeniem.",
  "",
  "| Etap | Oczekiwany rezultat |\n| --- | --- |\n| Implementacja | Zmiana w osobnym worktree |\n| Weryfikacja | Testy i recenzja artefaktu |",
  "",
  "```bash\nnpm run typecheck\nnpm test\n```",
  "",
  "> Terminal służy do ręcznej pracy. Uruchomienia agentów mają osobne zasady.",
].join("\n\n");
const firstId = randomUUID(),
  secondId = randomUUID();
for (const [id, title, content] of [
  [firstId, "Przykład · plan wydania", example],
  [
    secondId,
    "Przykład · przegląd interfejsu",
    "## Przykładowa notatka\n\nNajpierw sprawdź główny przepływ, później szczegóły wizualne.",
  ],
]) {
  store.chats.save({
    id,
    title,
    projectId: project.id,
    agent: "codex",
    mode: "plan",
    source: "local",
    root: projectRoot,
    workspace: projectRoot,
    status: "idle",
    error: null,
    updatedAt: Date.now(),
    messages: [
      {
        id: randomUUID(),
        role: "user",
        content: "Pokaż przykładowy plan pracy przed wydaniem aplikacji.",
        at: Date.now(),
        status: "complete",
      },
      {
        id: randomUUID(),
        role: "assistant",
        content,
        at: Date.now(),
        status: "complete",
      },
    ],
    contextIds: [],
    skillIds: [],
    activity: [],
  });
}
// Malicious markdown is deliberately separate from public screenshots.
const unsafeId = randomUUID();
store.chats.save({
  ...store.chats.get(secondId),
  id: unsafeId,
  title: "Przykład · obsługa treści",
  messages: [
    {
      id: randomUUID(),
      role: "assistant",
      at: Date.now(),
      status: "complete",
      content:
        "<script>window.__markdownInjected=true</script>\n\n![tracking](https://example.invalid/track.png)\n\n[execute](javascript:alert(1))\n\n```html\n<img src=x onerror=alert(1)>\n```",
    },
  ],
});
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const report = {
  contrastScope: "Solid paint only. Gradient/glass text needs separate palette checks and visual review; not a WCAG certification.",
  status: "running",
  at: new Date().toISOString(),
  checks: [],
  screens: [],
  errors: [],
  scope:
    "Native Electron, real PTY, deterministic protocol fixture and labeled example data; no live provider inference.",
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
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page
    .getByRole("button", { name: "Nowy projekt", exact: true })
    .first()
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  async function nav(name) { await navigateWorkspace(page, name); }
  async function capture(name) {
    await page.locator('main[aria-busy="false"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const dismiss = page.locator(".toast .icon-button");
    if (await dismiss.isVisible()) await dismiss.click();
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: join(output, `${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
    const rows = (await page.evaluate(collectContrast)).map((row) => ({
      ...row,
      ...measure(row),
      threshold: threshold(row.size, row.weight),
    }));
    const failures = rows.filter(
      (r) => !r.disabled && (!r.unsupported.length && r.ratio < r.threshold),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    report.screens.push({
      name,
      width: page.viewportSize().width,
      overflow,
      failures: failures.map((r) => ({
        text: r.text,
        ratio: r.ratio,
        threshold: r.threshold,
      })),
    });
    assert.equal(overflow, false, `${name}: page overflow`);
    assert.equal(
      failures.length,
      0,
      `${name}: contrast ${JSON.stringify(failures.slice(0, 5).map((r) => ({ text: r.text, ratio: r.ratio })))}`,
    );
  }
  await capture("01-start-dark");
  const history = page.locator(".chat-history");
  assert.equal(await history.isVisible(), false);
  await page.getByRole("button", { name: "Historia", exact: true }).click();
  assert.equal(await history.isVisible(), true);
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await history
    .getByRole("button", { name: /Przykład · plan wydania/ })
    .click();
  await page.locator(".message-text table").waitFor();
  await page.locator(".chat-transcript").evaluate((el) => {
    el.scrollTop = 0;
  });
  await capture("02-chat-dark");
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(`chat-dark-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.locator(".message-code").count(), 1);
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await history
    .getByRole("button", { name: /Przykład · obsługa treści/ })
    .click();
  assert.equal(
    await page
      .locator(".message-text img, .message-text script, .message-text iframe")
      .count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.__markdownInjected), undefined);
  assert.equal(
    await page.getByRole("button", { name: "execute" }).isDisabled(),
    true,
  );
  report.checks.push(
    "Markdown: GFM tables/code render; raw HTML, script URLs and remote image requests are blocked",
  );
  await page.evaluate(
    (id) => window.agenting.chatAction({ id, action: "delete" }),
    unsafeId,
  );
  // Deleting the open chat returns to the start screen, which hides the
  // history: wait for that to land, then open it again.
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await history
    .getByRole("button", { name: /Przykład · obsługa treści/ })
    .waitFor({ state: "detached" });
  if (!(await history.isVisible()))
    await page.getByRole("button", { name: "Historia", exact: true }).click();
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await history
    .getByRole("button", { name: /Przykład · plan wydania/ })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Wiadomość do agenta",
    exact: true,
  });
  await composer.fill("Szkic pierwszej rozmowy");
  await page.locator(".chat-composer input[type=file]").setInputFiles({
    name: "kryteria.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Przykładowe kryteria odbioru"),
  });
  await page
    .locator(".chat-composer .attachment-chips")
    .getByText("kryteria.txt")
    .waitFor();
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await history
    .getByRole("button", { name: /Przykład · przegląd interfejsu/ })
    .click();
  assert.equal(await composer.inputValue(), "");
  await composer.fill("Szkic drugiej rozmowy");
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await history
    .getByRole("button", { name: /Przykład · plan wydania/ })
    .click();
  assert.equal(await composer.inputValue(), "Szkic pierwszej rozmowy");
  assert.equal(
    await page
      .locator(".chat-composer .attachment-chips")
      .getByText("kryteria.txt")
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Zmień nazwę rozmowy" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Nazwa rozmowy", exact: true })
    .fill("Przykład · gotowy plan");
  await page.getByRole("button", { name: "Zapisz nazwę", exact: true }).click();
  await page
    .getByRole("heading", { name: "Przykład · gotowy plan", exact: true })
    .waitFor();
  if (!(await history.isVisible())) await page.getByRole("button", { name: "Historia", exact: true }).click();
  await page.getByRole("searchbox", { name: "Szukaj rozmów" }).fill("gotowy");
  assert.equal(await history.locator(":scope > button").count(), 1);
  await page.getByRole("searchbox", { name: "Szukaj rozmów" }).fill("");
  report.checks.push(
    "Separate drafts and attachments survive chat switching; rename and history search work",
  );
  await page
    .getByRole("button", { name: "Kopiuj rozmowę jako Markdown", exact: true })
    .click();
  await page
    .getByText("Rozmowa skopiowana jako Markdown.", { exact: true })
    .waitFor();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.ok(
    copied.includes("# Przykład · gotowy plan") &&
      copied.includes("npm run typecheck"),
  );
  assert.ok(!copied.includes(projectRoot));
  report.checks.push(
    "Full Markdown transcript copies to the real system clipboard without hidden context or workspace paths",
  );
  await page.getByRole("button", { name: "Kopiuj kod", exact: true }).click();
  assert.equal(
    (await app.evaluate(({ clipboard }) => clipboard.readText())).trim(),
    "npm run typecheck\nnpm test",
  );

  await nav("Terminal");
  await page.getByRole("heading", { name: "Terminal", exact: true }).waitFor();
  await capture("03-terminal-empty");
  await page.getByLabel("Katalog początkowy").selectOption(project.id);
  await page
    .getByRole("button", { name: "Otwórz terminal", exact: true })
    .click();
  await page.locator(".xterm-helper-textarea").waitFor({ state: "attached" });
  await page.locator(".xterm-helper-textarea").focus();
  const terminalId = await page.evaluate(
    async () => (await window.agenting.terminalList())[0].id,
  );
  await page.keyboard.type(
    "node -e \"console.log('PTY_'+'ELECTRON',process.cwd())\"",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    async (id) =>
      (await window.agenting.terminalRead({ id, cursor: 0 })).data.includes(
        "PTY_ELECTRON",
      ),
    terminalId,
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".xterm-accessibility-tree")
      ?.textContent.includes("PTY_ELECTRON"),
  );
  await page.keyboard.press("Control+k");
  assert.equal(await page.locator(".command-palette[open]").count(), 0);
  await page
    .getByRole("button", { name: "Wyczyść ekran", exact: true })
    .click();
  await page.keyboard.type("node --version");
  await page.keyboard.press("Enter");
  await page.keyboard.type(
    "node -e \"console.log('Agenting OS: terminal lokalny gotowy')\"",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document
      .querySelector(".xterm-accessibility-tree")
      ?.textContent.includes("Agenting OS: terminal lokalny gotowy"),
  );
  await capture("04-terminal-dark");
  await nav("Czaty");
  assert.equal(await composer.inputValue(), "Szkic pierwszej rozmowy");
  await nav("Terminal");
  assert.equal(
    await page.evaluate(
      async () => (await window.agenting.terminalList()).length,
    ),
    1,
  );
  await page.locator(".xterm-helper-textarea").waitFor({ state: "attached" });
  report.checks.push(
    "Real PTY accepts keyboard input in the project directory; Ctrl+K stays in the shell; session survives navigation",
  );

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(`terminal-dark-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await chooseTheme(page, "Pearl");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await capture("05-terminal-light");
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(`terminal-light-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Zamknij sesję 1", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Anuluj", exact: true })
    .click();

  assert.equal(
    await page.evaluate(
      async () => (await window.agenting.terminalList()).length,
    ),
    1,
  );
  await page
    .getByRole("button", { name: "Zamknij sesję 1", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Zamknij sesję", exact: true })
    .click();
  await page.locator(".terminal-empty").waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await window.agenting.terminalList()).length,
    ),
    0,
  );
  report.checks.push(
    "Closing an active terminal requires confirmation; cancel preserves it; confirm terminates and removes it",
  );

  await nav("Czaty");
  await composer.fill("");
  await page
    .getByRole("button", { name: "Usuń kryteria.txt", exact: true })
    .click();
  await page.locator(".chat-transcript").evaluate((el) => {
    el.scrollTop = 0;
  });
  await capture("06-chat-light");
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(`chat-light-${width}`);
    await composer.scrollIntoViewIfNeeded();
    assert.equal(await composer.isVisible(), true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await page
    .locator(".chat-stage")
    .evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(motion, "none");
  report.checks.push(
    "320/390/768/1440 reflow, both themes, measured text contrast and reduced motion",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await chooseTheme(page, "Midnight");
  await page.locator(".project-link", { hasText: project.name }).click();
  await page
    .getByRole("heading", { name: project.name, exact: true })
    .waitFor();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^Zadania/ })
    .click();
  await capture("07-project");
  await page.getByRole("button", { name: /Uruchom kolejkę/ }).click();
  await page.locator(".team-preflight li").first().waitFor();
  assert.equal(
    await page.locator('.team-preflight li[data-configured="false"]').count(),
    1,
  );
  await capture("09-team-preflight");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Anuluj", exact: true })
    .click();
  const beforeLaunch = await page.evaluate(
    (input) => window.agenting.runtimeView(input),
    { projectId: project.id, taskId: task.id },
  );
  assert.equal(beforeLaunch.runs.length, 0);
  report.checks.push(
    "Queue preview exposes the missing reviewer before launch without starting a run",
  );
  await nav("Połączenia i modele");
  await page.locator("#provider-setup-title").waitFor();
  await capture("08-connections");
  await nav("Czaty");
  await composer.fill("Sprawdź gotowość przykładowego projektu.");
  await page.getByRole("button", { name: "Wyślij", exact: true }).click();
  await page.waitForFunction(
    async (id) =>
      (await window.agenting.chatList()).find((c) => c.id === id)?.status !==
      "running",
    firstId,
  );
  await page.waitForFunction(
    async (id) =>
      (await window.agenting.chatList())
        .find((c) => c.id === id)
        ?.messages.at(-1)?.status === "complete",
    firstId,
  );
  assert.equal(await composer.inputValue(), "");
  report.checks.push(
    "A message completes through the real app-server protocol fixture after switching screens",
  );
  assert.deepEqual(report.errors, []);
  report.status = "passed";
  console.log(
    `Workbench QA passed: ${report.checks.length} checks, ${report.screens.length} screens`,
  );
} catch (error) {
  report.status = "failed";
  report.failure = String(error);
  console.error(error);
  if (page)
    await page
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await app?.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}

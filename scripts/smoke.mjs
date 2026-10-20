import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import {
  assertIntegrationContract,
  assertIntegrationCards,
} from "./integration-contract.mjs";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = mkdtempSync(join(tmpdir(), "agenting-smoke-"));
const evidence = resolve(
  process.env.AGENTING_QA_OUTPUT || "docs/evidence/release-04/smoke",
);
mkdirSync(evidence, { recursive: true });
rmSync(join(evidence, "smoke-failure.png"), { force: true });
writeFileSync(
  join(evidence, "smoke-result.json"),
  JSON.stringify({ status: "running", at: new Date().toISOString() }),
);
process.on("exit", (code) => {
  if (code !== 0)
    writeFileSync(
      join(evidence, "smoke-result.json"),
      JSON.stringify({
        status: "failed",
        at: new Date().toISOString(),
        reason: "Smoke process exited unsuccessfully; see smoke log",
      }),
    );
});
const environment = { ...process.env, AGENTING_DATA_DIR: profile };
delete environment.ELECTRON_RUN_AS_NODE;
let desktop;
const errors = [];
let page;
async function launch() {
  desktop = await electron.launch({
    args: [
      resolve("."),
      ...(process.env.AGENTING_TEST_NO_SANDBOX === "1"
        ? ["--no-sandbox", "--no-zygote"]
        : []),
    ],
    env: environment,
    timeout: 30000,
  });
  page = await desktop.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: /^(Nowy projekt|New project)$/ })
    .first()
    .waitFor();
}
async function create(name) {
  await page
    .getByRole("button", { name: "Nowy projekt", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Nazwa projektu" })
    .fill(name);
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Ścieżka folderu (opcjonalna)" })
    .fill("C:\\Client files\\" + name);
  await page
    .getByRole("button", { name: "Utwórz projekt", exact: true })
    .click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^Zadania/ })
    .click();
}
async function choose(label, option, scope = page) {
  await scope.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("listbox", { name: label, exact: true })
    .getByRole("option", { name: option, exact: true })
    .click();
}
async function memory(content) {
  await page
    .getByRole("textbox", { name: "Wiedza lub decyzja", exact: true })
    .fill(content);
  await page
    .getByRole("textbox", { name: "Źródło / pochodzenie", exact: true })
    .fill("User decision / smoke");
  await page
    .getByRole("button", { name: "Zapisz w pamięci", exact: true })
    .click();
  await page.getByText(content, { exact: true }).waitFor();
}
try {
  await launch();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  assert.deepEqual(
    (await page.evaluate(() => Object.keys(window.agenting))).sort(),
    [
      "snapshot",
      "terminalList",
      "terminalOpen",
      "terminalRead",
      "terminalWrite",
      "terminalResize",
      "terminalClose",
      "chatRename",
      "openExternalLink",
      "chatList",
      "chatCreate",
      "chatSend",
      "chatAction",
      "chatRemember",
      "chatTask",
      "githubRepositories",
      "policyGet",
      "policySet",
      "policyApprove",
      "routePreview",
      "usageReport",
      "memoryList",
      "memoryGraph",
      "memoryAutoCapture",
      "memoryVaultOpen",
      "skillInstall",
      "workBoard",
      "memoryUpdate",
      "skillCatalog",
      "skillImportFile",
      "providerCheck",
      "providerSignIn",
      "providerConnectDetected",
      "connectorScan",
      "orchestrationStart",
      "orchestrationState",
      "orchestrationStop",
      "orchestrationEvents",
      "orchestrationResume",
      "attention",
      "backupCreate",
      "backupRestore",
      "diagnosticsExport",
      "restoreStatus",
      "restartApp",
      "missionPlan",
      "missionList",
      "missionAction",
      "missionRemember",
      "localModelSettings",
      "localModelSave",
      "localModelRemove",
      "providerDetect",
      "openRouterSettings",
      "openRouterSave",
      "openRouterRemove",
      "openRouterModels",
      "quotaScan",
      "quotaSaveCustom",
      "quotaDeleteCustom",
      "quotaRefresh",
      "projectData",
      "createProject",
      "createTask",
      "taskAction",
      "createMemory",
      "deleteMemory",
      "setPreferences",
      "setMaster",
      "runtimeView",
      "runtimeStart",
      "runtimeAction",
      "runtimeReview",
      "configureProvider",
      "providerSettings",
      "chooseExecutable",
      "chooseRepository",
      "providerLogin",
      "runArtifact",
      "runDecision",
      "memorySearch",
      "contextPreview",
      "extensionList",
      "extensionImport",
      "extensionRemove",
      "mcpConnect",
      "mcpCall",
      "mcpDisconnect",
      "browserAction",
    ].sort(),
  );
  const settings = await desktop.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return w.webContents.getLastWebPreferences();
  });
  assert.equal(settings.sandbox, true);
  assert.equal(settings.contextIsolation, true);
  assert.equal(settings.nodeIntegration, false);
  assert.equal(settings.webviewTag, false);
  const rejection = await page.evaluate(() =>
    window.agenting.taskAction({ projectId: "", id: "", action: "queue" }).then(
      () => "resolved",
      (error) =>
        typeof error?.message === "string" && error.message.length > 0
          ? "rejected"
          : "rejected-without-message",
    ),
  );
  assert.equal(rejection, "rejected");
  await create("Client A");
  assert.equal(
    await page
      .getByRole("button", { name: "Zapisz szkic", exact: true })
      .isDisabled(),
    true,
  );
  await page.locator(".empty-list button").click();
  assert.equal(
    await page
      .locator("#task-title")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page
    .getByRole("textbox", { name: "Opisz zadanie", exact: true })
    .fill("Review project boundaries");
  await choose("Wykonawca / agent główny", "Claude Code");
  await page.locator("#task-title").focus();
  await page.keyboard.press("Control+Enter");
  await page
    .getByRole("heading", { name: "Review project boundaries", exact: true })
    .waitFor();
  await page
    .getByLabel("Opisz zadanie", { exact: true })
    .fill("Unsaved A input");
  await page
    .locator(".tabs")
    .getByRole("button", { name: /Wspólna pamięć/ })
    .click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^(Zadania|Tasks)/ })
    .click();
  assert.equal(
    await page.locator("#task-title").inputValue(),
    "Unsaved A input",
  );
  await page
    .getByRole("searchbox", { name: "Szukaj zadań" })
    .fill("no matching task");
  assert.equal(await page.locator(".task-list h3").count(), 0);
  await page.getByRole("button", { name: "Wyczyść filtry" }).click();
  await page
    .getByRole("heading", { name: "Review project boundaries", exact: true })
    .waitFor();
  await choose("Filtruj według statusu", "Anulowane");
  assert.equal(await page.locator(".task-list h3").count(), 0);
  await page.getByRole("button", { name: "Wyczyść filtry" }).click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /Wspólna pamięć/ })
    .click();
  await memory("<script>window.pwned=true</script> Client A secret-free fact");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  await create("Client B");
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^(Zadania|Tasks)/ })
    .click();
  assert.equal(await page.locator("#task-title").inputValue(), "");
  await page
    .locator(".tabs")
    .getByRole("button", { name: /Wspólna pamięć/ })
    .click();
  assert.equal(
    await page
      .getByText(
        "<script>window.pwned=true</script> Client A secret-free fact",
        { exact: true },
      )
      .count(),
    0,
  );
  await memory("Temporary B decision");
  await page.getByRole("button", { name: "Usuń", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Anuluj", exact: true })
    .click();
  assert.equal(
    await page.getByText("Temporary B decision", { exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Usuń", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Usuń wpis", exact: true })
    .click();
  await page
    .getByText("Pamięć jest pusta. Zapisz decyzję wraz ze źródłem.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: /Client A/, exact: false }).click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^(Zadania|Tasks)/ })
    .click();
  assert.equal(
    await page.locator("#task-title").inputValue(),
    "Unsaved A input",
  );
  await page.locator("#task-title").fill("");
  await page
    .locator(".tabs")
    .getByRole("button", { name: /Wspólna pamięć/ })
    .click();
  await page
    .getByText("<script>window.pwned=true</script> Client A secret-free fact", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Integracje", exact: true }).click();
  assertIntegrationContract(
    await page.evaluate(
      async () => (await window.agenting.snapshot()).integrations,
    ),
  );
  assertIntegrationCards(
    await page.locator(".integrations article").evaluateAll((cards) =>
      cards.map((card) => ({
        name: card.querySelector("h3").textContent.trim(),
        badge: card.querySelector(".badge").textContent.trim(),
        fields: Object.fromEntries(
          [...card.querySelectorAll("dl > div")].map((row) => [
            row.querySelector("dt").textContent.trim(),
            row.querySelector("dd").textContent.trim(),
          ]),
        ),
      })),
    ),
  );
  await choose("Domyślny agent główny", "Claude Code", page.getByRole("main"));
  await page
    .getByRole("status")
    .filter({ hasText: "Zapisano lokalnie" })
    .waitFor();
  await choose("Język", "English");
  assert.equal(
    await page
      .getByRole("button", { name: "Language", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
    "language preference returns focus after saving",
  );
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await page.setViewportSize({ width: 1440, height: 940 });
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^(Zadania|Tasks)/ })
    .click();
  await page.screenshot({
    path: join(evidence, "desktop-light-1440.png"),
    fullPage: true,
  });
  await desktop.close();
  desktop = undefined;
  await launch();
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "en" &&
      document.documentElement.dataset.theme === "light",
  );
  // The app now opens on the Control Center; persisted projects stay in the sidebar.
  await page.locator(".project-link", { hasText: "Client A" }).click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^Tasks/ })
    .click();
  await page.getByRole("heading", { name: "Client A", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Review project boundaries", exact: true })
    .waitFor();
  // Custom listboxes support keyboard movement, cancellation and focus return.
  const filter = page.getByRole("button", {
    name: "Filter by status",
    exact: true,
  });
  await filter.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("listbox", { name: "Filter by status" }).waitFor();
  await page.keyboard.press("End");
  assert.equal(
    await page
      .getByRole("option", { name: "Cancelled", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Home");
  assert.equal(
    await page
      .getByRole("option", { name: "All statuses", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await filter.evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(await filter.getAttribute("aria-expanded"), "false");
  await page.keyboard.press("/");
  assert.equal(
    await page
      .locator("#task-search")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator("#task-search").fill("");
  await page.bringToFront();
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].focus(),
  );
  const nativeClipboardAvailable = await desktop.evaluate(({ clipboard }) => {
    const probe = "Agenting OS clipboard availability check";
    clipboard.writeText(probe);
    const available = clipboard.readText() === probe;
    if (available) clipboard.clear();
    return available;
  });
  await page.evaluate(() => {
    window.copyCheck = null;
    window.addEventListener(
      "copy",
      (event) => {
        window.copyCheck = {
          trusted: event.isTrusted,
          text: event.clipboardData?.getData("text/plain"),
        };
      },
      { once: true },
    );
  });
  await page.getByRole("button", { name: "Copy path", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Path copied" }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.copyCheck), {
    trusted: true,
    text: "C:\\Client files\\Client A",
  });
  if (nativeClipboardAvailable) {
    assert.equal(
      await desktop.evaluate(({ clipboard }) => clipboard.readText()),
      "C:\\Client files\\Client A",
    );
  } else {
    console.log(
      "UNVERIFIED: native clipboard write/read baseline unavailable on this host; trusted UI copy payload verified.",
    );
  }
  // Cancelling is explicit and confirmation can be abandoned without a mutation.
  await page.locator(".task-title button").click();
  const panel = page.locator(".task-panel[open]");
  await panel.waitFor();
  await panel.getByRole("button", { name: "Cancel task", exact: true }).click();
  await page
    .locator(".confirm-dialog[open]")
    .getByRole("button", { name: "Keep task", exact: true })
    .click();
  assert.equal(await panel.locator(".status-badge").textContent(), "Draft");
  await page.screenshot({
    path: join(evidence, "task-panel.png"),
    fullPage: true,
  });
  await panel.getByRole("button", { name: "Cancel task", exact: true }).click();
  await page
    .locator(".confirm-dialog[open]")
    .getByRole("button", { name: "Cancel task", exact: true })
    .click();
  await panel
    .locator(".status-badge")
    .filter({ hasText: "Cancelled" })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .locator(".info-callout")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await page.reload();
  await page.locator("main[aria-busy=false]").waitFor();
  assert.equal(await page.locator(".info-callout").count(), 0);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: join(evidence, "desktop-dark-1280.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: join(evidence, "desktop-narrow-390.png"),
    fullPage: true,
  });
  // The compact project picker is keyboard reachable and returns focus on selection.
  const projectToggle = page.getByRole("button", {
    name: "Projects",
    exact: true,
  });
  await projectToggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await projectToggle.getAttribute("aria-expanded"), "true");
  await page.locator(".project-link").filter({ hasText: "Client B" }).click();
  assert.equal(await projectToggle.getAttribute("aria-expanded"), "false");
  assert.equal(
    await projectToggle.evaluate((el) => el === document.activeElement),
    true,
  );
  await projectToggle.click();
  await page.locator(".project-link").filter({ hasText: "Client A" }).click();
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `reflow at ${width}`,
    );
  }
  // Long names and task titles must reflow with technical details expanded.
  await page
    .getByRole("button", { name: "New project", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "New project", exact: true })
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Long_project_".repeat(16));
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.locator("main[aria-busy=false]").waitFor();
  await page
    .locator(".tabs")
    .getByRole("button", { name: /^Tasks/ })
    .click();
  await page.locator("#task-title").fill("Long_task_".repeat(300));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.locator(".task-list h3").waitFor();
  await page.locator(".task-title button").click();
  await page.locator(".task-panel[open]").waitFor();
  assert.equal(
    await page.locator("#task-panel-title").textContent(),
    "Long_task_".repeat(300),
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `long content at ${width}`,
    );
    assert.equal(
      await page
        .locator(".task-panel")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `panel content at ${width}`,
    );
  }
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.tagName !== "BODY"),
    true,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "smoke-result.json"),
    JSON.stringify(
      {
        status: "passed",
        platform: process.platform,
        clipboard: {
          nativeAvailable: nativeClipboardAvailable,
          trustedCopyPayload: "passed",
          systemReadback: nativeClipboardAvailable ? "passed" : "unverified",
        },
        sandboxDisabledForHost: process.env.AGENTING_TEST_NO_SANDBOX === "1",
        checks: [
          "real Electron UI CRUD",
          "restart persistence",
          "project isolation",
          "memory deletion cancel/confirm",
          "script text inert",
          "role selection",
          "PL/EN and light/dark persistence",
          "seven unprobed integrations and two honest probe-dependent statuses; unknown auth/quota, execution disabled",
          "renderer Node unavailable",
          "sandbox/context isolation settings",
          "1440/1280/390 screenshots",
          "no horizontal overflow at 390",
          "keyboard focus",
          "task search, status filters and clear filters",
          "per-project unsaved drafts across tabs and project switches",
          "compact project navigation and keyboard focus return",
          "no horizontal overflow at 320/390/768/1280/1440",
          "long project/task names reflow with expanded task details",
          "custom listbox Home/End/Escape and focus return",
          "slash search and Ctrl+Enter save",
          "trusted copy event contains the persisted project folder path; system readback reported separately",
          "focus returns to language control after asynchronous preference save",
          "cancel confirmation can be abandoned without mutation",
          "confirmed cancellation persists and updates the detail panel",
          "empty-state CTA focuses composer; empty draft save disabled",
          "dismissed lifecycle callout survives reload",
          "no renderer exceptions",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real Electron UI, isolation, restart, preferences, security and responsive smoke",
  );
} catch (error) {
  writeFileSync(
    join(evidence, "smoke-result.json"),
    JSON.stringify({
      status: "failed",
      at: new Date().toISOString(),
      reason: "See smoke log; desktop verification did not pass",
    }),
  );
  if (page)
    await page
      .screenshot({ path: join(evidence, "smoke-failure.png"), fullPage: true })
      .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await desktop?.close();
  rmSync(profile, { recursive: true, force: true });
}

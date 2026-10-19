import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = mkdtempSync(join(tmpdir(), "agenting-smoke-"));
const evidence = resolve("docs/evidence");
mkdirSync(evidence, { recursive: true });
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
      "projectData",
      "createProject",
      "createTask",
      "taskAction",
      "createMemory",
      "deleteMemory",
      "setPreferences",
      "setMaster",
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
  await page
    .getByRole("textbox", { name: "Opisz zadanie", exact: true })
    .fill("Review project boundaries");
  await page
    .getByLabel("Wykonawca / agent główny", { exact: true })
    .selectOption("claude");
  await page.getByRole("button", { name: "Zapisz szkic", exact: true }).click();
  await page
    .getByRole("heading", { name: "Review project boundaries", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /Wspólna pamięć/ }).click();
  await memory("<script>window.pwned=true</script> Client A secret-free fact");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  await create("Client B");
  await page.getByRole("button", { name: /Wspólna pamięć/ }).click();
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
  await page.getByRole("button", { name: /Wspólna pamięć/ }).click();
  await page
    .getByText("<script>window.pwned=true</script> Client A secret-free fact", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Integracje", exact: true }).click();
  assert.equal(
    await page.getByText("Nieskonfigurowane", { exact: true }).count(),
    9,
  );
  await page
    .getByRole("main")
    .getByLabel("Domyślny agent główny", { exact: true })
    .selectOption("claude");
  await page
    .getByRole("status")
    .filter({ hasText: "Zapisano lokalnie" })
    .waitFor();
  await page.getByLabel("Język", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await page.setViewportSize({ width: 1440, height: 940 });
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
  await page.getByRole("heading", { name: "Client A", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Review project boundaries", exact: true })
    .waitFor();
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
        sandboxDisabledForHost: process.env.AGENTING_TEST_NO_SANDBOX === "1",
        checks: [
          "real Electron UI CRUD",
          "restart persistence",
          "project isolation",
          "memory deletion cancel/confirm",
          "script text inert",
          "role selection",
          "PL/EN and light/dark persistence",
          "nine unconfigured integrations",
          "renderer Node unavailable",
          "sandbox/context isolation settings",
          "1440/1280/390 screenshots",
          "no horizontal overflow at 390",
          "keyboard focus",
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

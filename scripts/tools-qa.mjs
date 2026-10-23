import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
const profile = mkdtempSync(join(tmpdir(), "agenting-tools-")),
  output = resolve(process.env.AGENTING_QA_OUTPUT || "docs/evidence/release-04/tools");
mkdirSync(output, { recursive: true });
const db = new Store(join(profile, "agenting.sqlite"));
const a = db.createProject({
    name: "Agent workspace",
    root: "",
    master: "codex",
  }),
  b = db.createProject({
    name: "Research project",
    root: "",
    master: "claude",
  });
db.setPreferences({ language: "en", theme: "dark" });
db.close();
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    "<!doctype html><title>Local project preview</title><style>body{font:20px system-ui;padding:40px;background:#f8f9fc;color:#20242c}h1{font-size:36px}</style><h1>Project preview</h1><p>This local fixture verifies browser isolation.</p>",
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let desktop, page;
const errors = [];
async function probe(expression) {
  return desktop.evaluate(
    ({ webContents }, { url, expression }) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL() === url);
      if (!wc) throw Error("PREVIEW_NOT_FOUND");
      return wc.executeJavaScript(expression);
    },
    { url, expression },
  );
}
async function waitProbe(expression) {
  let result;
  for (let n = 0; n < 50; n++) {
    try {
      result = await probe(expression);
      return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("PREVIEW_TIMEOUT");
}
try {
  desktop = await electron.launch({
    args: [
      resolve("."),
      ...(process.env.AGENTING_TEST_NO_SANDBOX === "1"
        ? ["--no-sandbox", "--no-zygote"]
        : []),
    ],
    env,
  });
  page = await desktop.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  // The app opens on the Control Center; pick the project from the sidebar.
  await page.locator(".project-link", { hasText: a.name }).click();
  await page.getByRole("heading", { name: a.name, exact: true }).waitFor();
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.getByText("verification before completion", { exact: true }).waitFor();
  await page.getByText("Import JSON manifest", { exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Import into project", exact: true })
    .click();
  await page.getByText("Project conventions", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "extensions-dark.png") });
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page address", exact: true })
    .fill(url);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  assert.deepEqual(
    await waitProbe(
      "({require:typeof window.require,process:typeof window.process,agenting:typeof window.agenting})",
    ),
    { require: "undefined", process: "undefined", agenting: "undefined" },
  );
  await probe('document.cookie="scope=project-a; SameSite=Lax"');
  const remote = await desktop.evaluate(async ({ webContents }, url) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL() === url);
    return {
      partition: wc.session.getStoragePath(),
      permissions: await wc.executeJavaScript(
        'navigator.permissions.query({name:"geolocation"}).then(p=>p.state)',
      ),
      png: (await wc.capturePage()).toPNG().toString("base64"),
    };
  }, url);
  assert.equal(remote.permissions, "denied");
  writeFileSync(
    join(output, "browser-content.png"),
    Buffer.from(remote.png, "base64"),
  );
  await page.screenshot({ path: join(output, "browser-dark.png") });
  await page
    .getByRole("button", { name: "New project", exact: true })
    .first()
    .click();
  assert.equal(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.length,
    ),
    0,
    "native preview hidden behind app modal",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.locator(".project-link", {hasText:b.name}).click();
  await page.getByRole("heading", { name: b.name, exact: true }).waitFor();
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  assert.equal(
    await page.getByText("Project conventions", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page address", exact: true })
    .fill(url);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  // Match the newly created contents by its empty per-project cookie jar.
  const isolation = await desktop.evaluate(async ({ webContents }, url) => {
    const views = webContents
      .getAllWebContents()
      .filter((w) => w.getURL() === url);
    for (let i = 0; i < 50 && views.length < 2; i++)
      await new Promise((r) => setTimeout(r, 100));
    const all = webContents
      .getAllWebContents()
      .filter((w) => w.getURL() === url);
    return Promise.all(
      all.map(async (w) => ({
        path: w.session.getStoragePath(),
        cookie: await w.executeJavaScript("document.cookie"),
      })),
    );
  }, url);
  assert.equal(isolation.length, 2);
  assert.equal(new Set(isolation.map((s) => s.path)).size, 2);
  assert.equal(
    isolation.filter((s) => s.cookie.includes("scope=project-a")).length,
    1,
  );
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => window.agenting.setPreferences({ language: "en", theme }),
      theme,
    );
    await page.reload();
    // A reload returns to the Control Center; reopen the project at desktop width.
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForFunction(() => innerWidth >= 1000);
    await page.locator(".project-link", { hasText: a.name }).click();
    await page.getByRole("button", { name: "Extensions", exact: true }).click();
    await page.getByText("verification before completion", { exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.screenshot({
        path: join(output, `extensions-${theme}-${width}.png`),
      });
        assert.equal(await page.evaluate(()=>document.querySelector(".tabs").getBoundingClientRect().bottom<=document.querySelector(".extensions-panel").getBoundingClientRect().top),true,"wrapped tabs do not overlap the content");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        status: "passed",
        at: new Date().toISOString(),
        electron: await desktop.evaluate(() => process.versions.electron),
        checks: [
          "scoped manifest import",
          "real WebContentsView: no Node/preload API",
          "geolocation denied",
          "native view hidden for modal",
          "separate persistent project cookie jars",
          "extensions responsive light/dark at 1440/390",
        ],
        modelCalls: 0,
      },
      null,
      2,
    ),
  );
  console.log("Project browser and extension Electron QA passed");
} catch (error) {
  if (page)
    await page
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
  throw error;
} finally {
  await desktop?.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

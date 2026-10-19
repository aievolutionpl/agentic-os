import { _electron as electron } from "playwright";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";

const phase = process.argv[2];
if (!["before", "after"].includes(phase))
  throw Error("Use: node scripts/ui-capture.mjs before|after");
const out = resolve("docs/evidence/ui-polish", phase);
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "agenting-ui-capture-"));
const store = new Store(join(profile, "agenting.sqlite"));
const a = store.createProject({
  name: "Client A",
  root: "C:\\Client files\\Client A",
  master: "claude",
});
store.createProject({
  name: "Client B",
  root: "C:\\Client files\\Client B",
  master: "codex",
});
const make = (title) =>
  store.createTask({
    projectId: a.id,
    title,
    implementer: "claude",
    reviewer: "codex",
  });
make("Review project boundaries and acceptance criteria");
const queued = make("Prepare the shared memory documentation");
store.taskAction({ projectId: a.id, id: queued.id, action: "queue" });
const cancelled = make("Explore an alternative navigation layout");
store.taskAction({ projectId: a.id, id: cancelled.id, action: "cancel" });
store.createMemory({
  projectId: a.id,
  content:
    "Keep project context isolated. Require review before applying changes.",
  source: "Project instructions · UI QA fixture",
});
store.setPreferences({ language: "en", theme: "dark" });
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const result = {
  phase,
  platform: process.platform,
  at: new Date().toISOString(),
  fixture: "Temporary local SQLite data; no agents executed.",
  screens: [],
  errors: [],
};
try {
  app = await electron.launch({ args: [resolve(".")], env, timeout: 30000 });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.getByRole("heading", { name: "Client A", exact: true }).waitFor();
  await page.locator('main[aria-busy="false"]').waitFor();
  for (const theme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.theme)) !==
      theme
    ) {
      await page.getByRole("button", { name: "Theme", exact: true }).click();
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
    }
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const screenshot = `${theme}-${width}.png`;
      await page.screenshot({ path: join(out, screenshot), fullPage: true });
      const rows = (await page.evaluate(collectContrast)).map((row) => ({
        ...row,
        ...measure(row),
        threshold: threshold(row.size, row.weight),
      }));
      const failures = rows.filter(
        (row) =>
          !row.disabled &&
          (row.unsupported.length || row.ratio < row.threshold),
      );
      result.screens.push({
        theme,
        width,
        screenshot,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        measurements: rows.length,
        failures,
      });
      console.log(
        `${phase} ${theme} ${width}: ${rows.length} text measurements, ${failures.length} failures`,
      );
    }
  }
  result.status =
    result.errors.length ||
    result.screens.some((s) => s.overflow || s.failures.length)
      ? "failed"
      : "passed";
  if (result.status !== "passed") process.exitCode = 1;
} catch (error) {
  result.status = "failed";
  result.error = String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await app?.close();
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

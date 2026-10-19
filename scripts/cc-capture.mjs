import { _electron as electron } from "playwright";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";

// Captures the Control Center with a real connector scan of this machine.
const language = process.argv[2] === "pl" ? "pl" : "en";
const out = resolve("docs/evidence/control-center");
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "agenting-cc-capture-"));
const store = new Store(join(profile, "agenting.sqlite"));
store.createProject({ name: "Demo workspace", root: "", master: "codex" });
store.setPreferences({ language, theme: "dark" });
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const result = { at: new Date().toISOString(), language, screens: [], errors: [] };
let app;
try {
  app = await electron.launch({ args: [resolve(".")], env, timeout: 30000 });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.locator(".connector-card:not(.skeleton-card)").first().waitFor({ timeout: 60000 });
  for (const theme of ["dark", "light"]) {
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) {
      await page.locator("button.theme-toggle").click();
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
    }
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const file = `${language}-${theme}-${width}.png`;
      await page.screenshot({ path: join(out, file), fullPage: true });
      const rows = (await page.evaluate(collectContrast)).map((row) => ({
        ...row, ...measure(row), threshold: threshold(row.size, row.weight),
      }));
      const failures = rows.filter((r) => !r.disabled && (r.unsupported.length || r.ratio < r.threshold));
      result.screens.push({
        theme, width, file,
        rescanDisabled: await page.locator(".cc-actions button").isDisabled(),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        measurements: rows.length,
        failures: failures.map((f) => ({ text: f.text, ratio: f.ratio, threshold: f.threshold })),
      });
      console.log(`${language} ${theme} ${width}: ${rows.length} measurements, ${failures.length} failures`);
    }
  }
  result.status = result.errors.length || result.screens.some((s) => s.overflow || s.failures.length) ? "failed" : "passed";
  if (result.status !== "passed") process.exitCode = 1;
} catch (error) {
  result.status = "failed";
  result.error = String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, `result-${language}.json`), JSON.stringify(result, null, 2) + "\n");
  await app?.close();
}

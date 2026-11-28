// WCAG text-contrast audit of the real Electron UI in every palette.
// Run after `npm run build`. Uses a disposable profile with synthetic data;
// no provider task or external tool is executed.
import { _electron as electron } from "playwright";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";
import { Store } from "../dist/main/store.js";

const THEMES = ["white", "light", "classic", "dark", "claude", "codex", "matrix"];
const out = resolve(process.env.AGENTING_QA_OUTPUT || ".runtime/contrast-qa");
mkdirSync(out, { recursive: true });
const result = {
  status: "running",
  at: new Date().toISOString(),
  platform: process.platform,
  scope:
    "Rendered text and placeholders against WCAG 1.4.3 ratios in all seven palettes; disabled controls exempt. Solid backgrounds, alpha and group opacity are measured exactly. Text over gradients or backdrop blur (complex paint) is estimated against the nearest solid layers: it fails when that estimate is below the threshold and is otherwise counted as unverified. Not a complete accessibility audit: non-text contrast, assistive technology and every interaction state remain outside this check.",
  screens: [],
};
const save = () =>
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
save();

function seed(profile, theme) {
  const root = join(profile, "Studio");
  mkdirSync(root, { recursive: true });
  const store = new Store(join(profile, "agenting.sqlite"));
  store.setPreferences({ language: "pl", theme });
  if (!store.projects().length) {
    const project = store.createProject({ name: "Studio produktu", root, master: "codex" });
    store.createMemory({ projectId: project.id, content: "Decyzja\nCzytelna rozmowa i spójne motywy.", source: "QA", scope: "project" });
    store.chats.save({
      id: randomUUID(), title: "Plan premiery", projectId: project.id, agent: "codex", mode: "chat",
      source: "local", root, workspace: root, status: "idle", contextIds: [], skillIds: [], activity: [], error: null, updatedAt: Date.now(),
      messages: [
        { id: randomUUID(), role: "user", content: "Pomóż uporządkować plan premiery.", at: Date.UTC(2026, 10, 27, 10), status: "complete" },
        { id: randomUUID(), role: "assistant", content: "## Plan\n\n1. **Interfejs** — sprawdź układ.\n2. **Wydanie** — uruchom testy.\n\n```ts\nconst ok = true;\n```", at: Date.UTC(2026, 10, 27, 10, 1), status: "complete" },
      ],
    });
  }
  store.close();
}

let failed = false;
for (const theme of THEMES) {
  const profile = mkdtempSync(join(tmpdir(), "agenting-contrast-"));
  seed(profile, theme);
  const env = { ...process.env, AGENTING_DATA_DIR: profile, CLAUDE_CONFIG_DIR: join(profile, "claude") };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({
      args: [resolve("."), ...(process.env.AGENTING_TEST_NO_SANDBOX === "1" ? ["--no-sandbox", "--no-zygote"] : [])],
      env,
      timeout: 30000,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.locator('main[aria-busy="false"]').waitFor();
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);

    async function capture(name) {
      await page.mouse.move(0, 0);
      const toast = page.locator(".toast button");
      if (await toast.isVisible()) await toast.click();
      await page.locator('main[aria-busy="false"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      // Let theme and glass transitions settle before reading colors.
      await page.waitForTimeout(400);
      const rows = (await page.evaluate(collectContrast)).map((row) => ({
        ...row,
        ...measure(row),
        threshold: threshold(row.size, row.weight),
      }));
      if (!rows.length) throw Error(`Vacuous audit: ${name}`);
      const failures = rows.filter((r) => !r.disabled && !(r.ratio >= r.threshold));
      const unverified = rows.filter((r) => !r.disabled && r.unsupported.length && r.ratio >= r.threshold).length;
      const screenshot = `${theme}-${name}.png`;
      await page.screenshot({ path: join(out, screenshot) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      result.screens.push({
        theme,
        name,
        screenshot,
        viewport: page.viewportSize(),
        overflow,
        rows: rows.map(({ layers, ...row }) => row),
        failures,
        unverified,
      });
      console.log(`${theme} ${name}: ${rows.length} measurements, ${failures.length} failures, ${unverified} unverified${overflow ? ", horizontal overflow" : ""}`);
    }
    const nav = (label) => page.locator(".primary-nav").getByRole("button", { name: label, exact: true }).click();

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 390) {
        // Narrow layout keeps navigation in a drawer.
        await page.locator(".projects-toggle").click();
        await page.locator(".projects-drawer[open]").waitFor();
        await capture(`${width}-navigation`);
        await page.keyboard.press("Escape");
      }
      const openNav = async (label) => {
        if (width === 390) {
          await page.locator(".projects-toggle").click();
          await page.locator(".projects-drawer[open]").waitFor();
        }
        await nav(label);
      };
      await openNav("Rozmowy");
      await capture(`${width}-chat`);
      if (width === 390) {
        await page.locator(".projects-toggle").click();
        await page.locator(".projects-drawer[open]").waitFor();
      }
      await page.getByRole("button", { name: "Plan premiery", exact: true }).first().click();
      await page.getByText("Pomóż uporządkować plan premiery.", { exact: true }).waitFor();
      await capture(`${width}-conversation`);
      for (const [label, name] of [["Skille", "skills"], ["Pamięć", "memory"], ["Pluginy", "plugins"], ["ScheduleJob", "schedule"]]) {
        await openNav(label);
        await capture(`${width}-${name}`);
      }
      await page.getByRole("button", { name: "Ustawienia", exact: true }).first().click();
      await page.locator(".workspace-settings-dialog[open]").waitFor();
      await capture(`${width}-settings`);
      await page.keyboard.press("Escape");
    }
    if (errors.length) {
      result.errors = [...(result.errors ?? []), ...errors.map((e) => `${theme}: ${e}`)];
      failed = true;
    }
  } catch (e) {
    failed = true;
    result.error = `${theme}: ${String(e)}`;
    console.error(e);
    break;
  } finally {
    await app?.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
result.measurements = result.screens.reduce((n, s) => n + s.rows.length, 0);
result.failures = result.screens.reduce((n, s) => n + s.failures.length, 0);
result.unverified = result.screens.reduce((n, s) => n + s.unverified, 0);
result.status = failed || result.failures || result.screens.some((s) => s.overflow) ? "failed" : "passed";
save();
if (result.status !== "passed") process.exitCode = 1;
console.log(`Contrast QA: ${result.status} (${result.screens.length} screens, ${result.measurements} measurements, ${result.failures} failures, ${result.unverified} unverified estimates)`);

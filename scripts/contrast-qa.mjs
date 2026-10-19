import { _electron as electron } from "playwright";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";

const out = resolve("docs/evidence/ui-polish/contrast");
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "agenting-contrast-"));
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const result = {
  status: "running",
  at: new Date().toISOString(),
  platform: process.platform,
  scope:
    "Rendered text and placeholders against WCAG 1.4.3 ratios; disabled controls exempt. Solid backgrounds, alpha and group opacity. Complex paint fails unresolved. Not a complete accessibility audit: non-text contrast, assistive technology and every interaction state remain outside this check.",
  screens: [],
};
const save = () =>
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
save();
process.on("exit", (code) => {
  if (code && result.status === "running") {
    result.status = "failed";
    result.error = "Process exited before completing the audit";
    save();
  }
});
let app;
try {
  app = await electron.launch({ args: [resolve(".")], env, timeout: 30000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Język", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  async function capture(name) {
    await page.mouse.move(0, 0);
    await page.locator('main[aria-busy="false"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const rows = (await page.evaluate(collectContrast)).map((row) => {
      const measurement = measure(row);
      return {
        ...row,
        ...measurement,
        threshold: threshold(row.size, row.weight),
      };
    });
    const failures = rows.filter(
      (r) => !r.disabled && (r.unsupported.length || r.ratio < r.threshold),
    );
    if (!rows.length) throw Error("Vacuous audit");
    const screenshot = `${name}.png`;
    await page.screenshot({ path: join(out, screenshot), fullPage: true });
    // Keep computed colors and ratios, without repeating every ancestor paint layer.
    const compact = rows.map(({ layers, ...row }) => row);
    result.screens.push({
      name,
      screenshot,
      viewport: page.viewportSize(),
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      rows: compact,
      failures,
    });
    console.log(
      `${name}: ${rows.length} measurements, ${failures.length} failures`,
    );
  }
  for (const theme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.theme)) !==
      theme
    ) {
      await page.getByRole("button", { name: "Theme", exact: true }).click();
      await page.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
      );
    }
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (theme === "dark" && width === 320) {
        await capture("dark-320-empty");
        await page
          .locator(".empty")
          .getByRole("button", { name: "New project", exact: true })
          .click();
        await page
          .locator('dialog[open] input[name="name"]')
          .fill("Contrast QA");
        await page
          .getByRole("button", { name: "Create project", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Contrast QA", exact: true })
          .waitFor();
        await page.locator("#task-title").fill("Contrast regression task");
        await page
          .getByRole("button", { name: "Save draft", exact: true })
          .click();
        await page
          .getByRole("heading", {
            name: "Contrast regression task",
            exact: true,
          })
          .waitFor();
      }
      await page.locator(".tabs button").nth(0).click();
      await capture(`${theme}-${width}-tasks`);
      await page
        .getByRole("button", { name: "Filter by status", exact: true })
        .click();
      await capture(`${theme}-${width}-listbox`);
      await page.keyboard.press("Escape");
      await page.locator(".task-title button").click();
      await page.locator(".task-panel[open]").waitFor();
      await capture(`${theme}-${width}-task-panel`);
      await page
        .locator(".task-panel")
        .getByRole("button", { name: "Cancel task", exact: true })
        .click();
      await page.locator(".confirm-dialog[open]").waitFor();
      await capture(`${theme}-${width}-confirmation`);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.locator(".tabs button").nth(1).click();
      await capture(`${theme}-${width}-memory`);
      await page.locator(".tabs button").nth(2).click();
      await capture(`${theme}-${width}-integrations`);
      if (await page.locator(".projects-toggle").isVisible()) {
        await page.locator(".projects-toggle").click();
        await page.locator(".projects-drawer[open]").waitFor();
        await capture(`${theme}-${width}-navigation`);
      }
      await page
        .getByRole("button", { name: "New project", exact: true })
        .first()
        .click();
      await page.locator(".project-dialog[open]").waitFor();
      await capture(`${theme}-${width}-dialog`);
      await page.keyboard.press("Escape");
    }
  }
  result.errors = errors;
  result.measurements = result.screens.reduce((n, s) => n + s.rows.length, 0);
  result.failures = result.screens.reduce((n, s) => n + s.failures.length, 0);
  result.status =
    result.failures || errors.length || result.screens.some((s) => s.overflow)
      ? "failed"
      : "passed";
  if (result.status !== "passed") process.exitCode = 1;
} catch (e) {
  result.status = "failed";
  result.error = String(e);
  process.exitCode = 1;
  console.error(e);
} finally {
  save();
  await app?.close();
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
console.log(`Contrast QA: ${result.status}`);

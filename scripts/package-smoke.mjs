import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = mkdtempSync(join(tmpdir(), "agenting-package-")),
  output = resolve("docs/evidence/release-04/package");
mkdirSync(output, { recursive: true });
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let desktop;
try {
  desktop = await electron.launch({
    executablePath: resolve("release/win-unpacked/Agenting OS.exe"),
    args: [],
    env,
    timeout: 30000,
  });
  const page = await desktop.firstWindow();
  await page
    .getByRole("button", { name: /^(Nowy projekt|New project)$/ })
    .first()
    .waitFor();
  const result = await page.evaluate(async () => ({
    hasBridge: !!window.agenting,
    projects: (await window.agenting.snapshot()).projects.length,
    node: typeof window.require,
  }));
  assert.deepEqual(result, { hasBridge: true, projects: 0, node: "undefined" });
  await page.screenshot({ path: join(output, "unpacked-first-launch.png") });
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        status: "passed",
        at: new Date().toISOString(),
        electron: await desktop.evaluate(() => process.versions.electron),
        checks: [
          "packaged executable starts",
          "preload works from ASAR",
          "isolated first-launch profile",
        ],
        installerExecution: "not performed",
        codeSigning: "unsigned",
      },
      null,
      2,
    ),
  );
  console.log("Packaged executable smoke passed");
} finally {
  await desktop?.close();
  rmSync(profile, { recursive: true, force: true });
}

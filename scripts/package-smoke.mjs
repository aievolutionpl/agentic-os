import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = mkdtempSync(join(tmpdir(), "agenting-package-")),
  output = resolve(process.env.AGENTING_QA_OUTPUT || ".runtime/package-smoke");
mkdirSync(output, { recursive: true });
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let desktop;
try {
  desktop = await electron.launch({
    executablePath: resolve(
      process.env.AGENTING_PACKAGED_EXE ||
        "release/win-unpacked/Agenting OS.exe",
    ),
    args:
      process.env.AGENTING_TEST_NO_SANDBOX === "1"
        ? ["--no-sandbox", "--no-zygote"]
        : [],
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
  const terminal = await page.evaluate(() =>
    window.agenting.terminalOpen({ consent: true, cols: 80, rows: 24 }),
  );
  await page.evaluate(
    ({ id, data }) =>
      window.agenting.terminalWrite({
        id,
        data,
      }),
    {
      id: terminal.id,
      data:
        process.platform === "win32"
          ? "Write-Output ('PACKAGED_' + 'PTY')\r"
          : "printf 'PACKAGED_'; printf 'PTY\\n'\r",
    },
  );
  await page.waitForFunction(
    async (id) =>
      (await window.agenting.terminalRead({ id, cursor: 0 })).data.includes(
        "PACKAGED_PTY",
      ),
    terminal.id,
  );
  await page.evaluate(
    (id) => window.agenting.terminalClose({ id }),
    terminal.id,
  );
  await page.screenshot({ path: join(output, "unpacked-first-launch.png") });
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        status: "passed",
        at: new Date().toISOString(),
        platform: process.platform,
        electron: await desktop.evaluate(() => process.versions.electron),
        checks: [
          "packaged executable starts",
          "preload works from ASAR",
          "isolated first-launch profile",
          "packaged native PTY opens, executes and closes through trusted IPC",
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

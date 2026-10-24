// Opt-in integration evidence using existing CLI subscriptions, exclusively on a temporary fixture.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../dist/main/store.js";
import { detectExecutables } from "../dist/main/provider-discovery.js";
import { git, gitText } from "../dist/main/git.js";
if (process.env.AGENTING_SUBSCRIPTION_SMOKE !== "1")
  throw Error("EXPLICIT_OPT_IN_REQUIRED");
const directory = mkdtempSync(join(tmpdir(), "agenting-live-master-")),
  profile = join(directory, "profile"),
  repo = join(directory, "repo");
mkdirSync(profile);
await git(directory, ["init", "--", repo]);
const marker = "master-delegation-proof-2026",
  sample = `# Disposable integration fixture\n\nVerification marker: ${marker}\n`;
writeFileSync(join(repo, "README.md"), sample);
await git(repo, ["add", "--all"]);
const tree = await gitText(repo, "write-tree"),
  base = await gitText(repo, "commit-tree", tree, "-m", "fixture");
await git(repo, ["update-ref", "HEAD", base]);
const commands = detectExecutables();
if (!commands.codex || !commands.claude)
  throw Error("INSTALL_CODEX_AND_CLAUDE");
const store = new Store(join(profile, "agenting.sqlite"));
const project = store.createProject({
  name: "Master Agent · Live QA",
  root: repo,
  master: "codex",
});
store.runs.configure("codex", commands.codex, [], "codex", "existing");
store.runs.configure("claude", commands.claude, [], "claude-cli", "existing");
store.close();
const output = resolve("docs/evidence/master-07/live");
mkdirSync(output, { recursive: true });
const report = {
  at: new Date().toISOString(),
  status: "running",
  scope:
    "Real Electron UI and Master workflow, Codex planning/evaluation and Claude research on a disposable one-file Git fixture. Existing CLI sign-ins, no API key or private project data.",
  checks: [],
  errors: [],
};
const env = { ...process.env, AGENTING_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function waitMission(transient, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const mission = await page.evaluate(
      async (id) => (await window.agenting.missionList({ projectId: id }))[0],
      project.id,
    );
    if (mission && !transient.includes(mission.status)) return mission;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error("MISSION_TIMEOUT");
}
try {
  app = await electron.launch({ args: [resolve(".")], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page
    .getByRole("button", { name: `Otwórz projekt: ${project.name}`, exact: true })
    .waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: `Otwórz projekt: ${project.name}`, exact: true }).click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: "Master Agent", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Co ma osiągnąć zespół?" })
    .fill(
      "This is a read-only integration check. Plan exactly ONE research task assigned to claude, with codex as reviewer. The task is to read README.md and report its verification marker verbatim. No implementation, no file changes, no network or delegation tools. Master must independently check the marker in README.md during final evaluation. Do not add any other tasks. Answer concisely in English.",
    );
  await page.locator(".mission-composer .consent input").check();
  await page
    .getByRole("button", { name: "Przygotuj plan", exact: true })
    .click();
  let mission = await waitMission(["planning"], 240000);
  assert.equal(mission.status, "ready", mission.reason ?? "Plan not ready");
  assert.equal(mission.steps.length, 1);
  assert.equal(mission.steps[0].workflow, "research");
  assert.equal(mission.steps[0].implementer, "claude");
  report.checks.push("real-codex-plan-validated-before-execution");
  await page.getByRole("button", { name: "Uruchom plan", exact: true }).click();
  mission = await waitMission(["ready", "running", "evaluating"], 300000);
  assert.equal(
    mission.status,
    "completed",
    mission.reason ?? "Mission not complete",
  );
  const view = await page.evaluate(
    (input) => window.agenting.runtimeView(input),
    { projectId: project.id, taskId: mission.steps[0].taskId },
  );
  assert.equal(view.runs[0].provider, "claude");
  assert.equal(view.runs[0].state, "completed");
  assert.ok(view.runs[0].summary.includes(marker));
  assert.equal(readFileSync(join(repo, "README.md"), "utf8"), sample);
  assert.equal(await gitText(repo, "rev-parse", "HEAD"), base);
  assert.equal(await gitText(repo, "status", "--porcelain"), "");
  report.checks.push(
    "real-claude-worker-read-marker",
    "real-codex-evaluation-completed",
    "source-unchanged",
  );
  await page
    .getByRole("button", { name: "Zachowaj wynik", exact: true })
    .click();
  await page.getByText("Wynik zapisany w pamięci.", { exact: true }).waitFor();
  const data = await page.evaluate(
    (id) => window.agenting.projectData(id),
    project.id,
  );
  assert.equal(data.memory.length, 1);
  assert.equal(data.memory[0].scope, "project");
  report.checks.push("user-triggered-memory-save-over-real-ipc");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: join(output, "completed.png"),
    fullPage: true,
  });
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.error = String(e);
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
} finally {
  writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
  await app?.close();
}
console.log(JSON.stringify(report, null, 2));

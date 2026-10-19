import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/main/store.js";
const bundle = readFileSync(
  join(
    "dist/renderer/assets",
    readdirSync("dist/renderer/assets").find((f) => f.endsWith(".js")),
  ),
  "utf8",
);
const wait = async (fn) => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI timed out");
};
test("persisted lifecycle UI: dependency blocking, queue, journal, PL/EN, retry and restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-ui-")),
    file = join(dir, "app.db");
  let s = new Store(file),
    dom;
  const p = s.createProject({ name: "Project", root: "", master: "codex" }),
    b = s.createProject({ name: "Private B", root: "", master: "claude" });
  const make = (title) =>
    s.createTask({
      projectId: p.id,
      title,
      implementer: "codex",
      reviewer: "claude",
    });
  const parent = make("Parent"),
    child = make("Child");
  function boot() {
    dom = new JSDOM('<div id="root"></div>', {
      url: "file:///app/index.html",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    // JSDOM lacks native dialog methods; this is functional DOM coverage, not visual QA.
    dom.window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    dom.window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    dom.window.agenting = {
      snapshot: async () => ({
        projects: s.projects(),
        preferences: s.preferences(),
        integrations: s.integrations(),
      }),
      projectData: async (id) => s.projectData(id),
      taskAction: async (x) => s.taskAction(x),
      setPreferences: async (x) => s.setPreferences(x),
    };
    dom.window.eval(bundle);
  }
  const click = (label) => {
    const button = [...dom.window.document.querySelectorAll("button")].find(
      (x) => x.textContent.trim() === label,
    );
    assert.ok(button, label);
    button.click();
  };
  const row = (title) =>
    [...dom.window.document.querySelectorAll(".task-list > ul > li")].find(
      (x) => x.querySelector("h3")?.textContent === title,
    );
  try {
    boot();
    await wait(() => row("Child"));
    const select = row("Child").querySelector("select");
    select.options[0].selected = true;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await wait(
      () =>
        s.tasks(p.id).find((t) => t.id === child.id).dependencies.length === 1,
    );
    await wait(() => !row("Child").querySelector("button").disabled);
    row("Child").querySelector("button").click();
    await wait(() =>
      row("Child").textContent.includes("Oczekuje na zależności"),
    );
    assert.ok(
      dom.window.document
        .querySelector(".event-journal")
        .textContent.includes("Dodano do kolejki"),
    );
    const settings = dom.window.document.querySelector(".settings select");
    settings.value = "en";
    settings.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await wait(() =>
      row("Child").textContent.includes("Waiting for dependencies"),
    );
    // Domain fixture only: no provider execution. UI must show the persisted failed attempt honestly.
    s.taskAction({ projectId: p.id, id: parent.id, action: "queue" });
    const lease = s.lifecycle.claim({
      projectId: p.id,
      id: parent.id,
      owner: "test-worker",
      ttlMs: 10000,
    });
    s.lifecycle.finish({
      projectId: p.id,
      id: parent.id,
      owner: "test-worker",
      token: lease.token,
      outcome: "failed",
      failure: "worker_error",
    });
    click("Refresh state and events");
    await wait(() => row("Parent").textContent.includes("Worker failure"));
    [...row("Parent").querySelectorAll("button")]
      .find((x) => x.textContent === "Retry task")
      .click();
    await wait(() =>
      dom.window.document
        .querySelector(".event-journal")
        .textContent.includes("Retry queued"),
    );
    assert.equal(
      s.tasks(p.id).find((t) => t.id === parent.id).status,
      "queued",
    );
    assert.deepEqual(s.events(b.id), []);
    dom.window.close();
    s.close();
    s = new Store(file);
    boot();
    await wait(() =>
      row("Child")?.textContent.includes("Waiting for dependencies"),
    );
    assert.ok(
      dom.window.document
        .querySelector(".event-journal")
        .textContent.includes("Retry queued"),
    );
    assert.ok(
      dom.window.document.body.textContent.includes("Execution is disabled"),
    );
  } finally {
    dom?.window.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

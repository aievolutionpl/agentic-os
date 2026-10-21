import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/main/store.js";
import { bundle } from "./ui-bundle.mjs";

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
  // Unrelated to any dependency: stays on the board, out of the graph.
  make("Loose");
  // Task statuses the stubbed projectData reports instead of the store's.
  let status = {};
  // Starts as a batch that stopped on unmet dependencies and cannot go on.
  let queue = {
    id: "dead",
    status: "blocked",
    reason: "DEPENDENCIES_OR_APPROVAL",
    taskIds: [parent.id, child.id],
  };
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
      projectData: async (id) => {
        const data = s.projectData(id);
        return {
          ...data,
          tasks: data.tasks.map((t) =>
            status[t.id] ? { ...t, status: status[t.id] } : t,
          ),
        };
      },
      taskAction: async (x) => s.taskAction(x),
      setPreferences: async (x) => s.setPreferences(x),
      // Team queue read-only: the dependency graph renders, nothing starts.
      orchestrationState: async ({ projectId }) => ({
        id: null,
        projectId,
        status: "idle",
        taskIds: [],
        completedTaskIds: [],
        finished: 0,
        runId: null,
        reason: null,
        createdAt: null,
        updatedAt: null,
        ...queue,
      }),
      orchestrationStart: async () => {
        throw Error("NOT_IN_THIS_TEST");
      },
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
  async function selectFixtureProject() {
    // Projects can share the same millisecond on fast hosts; UUID order is not creation order.
    const target = () =>
      [...dom.window.document.querySelectorAll(".project-link")].find(
        (button) => button.textContent.includes(p.name),
      );
    await wait(target);
    target().click();
  }
  try {
    boot();
    await selectFixtureProject();
    await wait(() => row("Child"));
    row("Child").querySelector("h3 button").click();
    await wait(() => dom.window.document.querySelector(".task-panel").open);
    dom.window.document
      .querySelector('.task-panel input[type="checkbox"]')
      .click();
    await wait(
      () =>
        s.tasks(p.id).find((t) => t.id === child.id).dependencies.length === 1,
    );
    dom.window.document
      .querySelector('.task-panel button[aria-label="Zamknij"]')
      .click();
    // The dependency is drawn: Parent in the first column, Child after it.
    await wait(
      () => dom.window.document.querySelectorAll(".task-node").length === 2,
    );
    const graph = dom.window.document.querySelector(".task-graph");
    assert.ok(graph.textContent.includes("Child czeka na Parent"));
    assert.equal(
      graph.querySelectorAll(".in-batch").length,
      0,
      "a batch stopped on unmet dependencies can never continue",
    );
    // A batch waiting on the operator is current and outlines its tasks.
    queue = {
      id: "held",
      status: "blocked",
      reason: "HUMAN_APPROVAL_REQUIRED",
      taskIds: [parent.id, child.id],
      updatedAt: new Date().toISOString(),
    };
    for (let i = 0; i < 400 && !graph.querySelector(".in-batch"); i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(graph.querySelectorAll(".in-batch").length, 2);
    // A prerequisite marked completed whose result still awaits approval is
    // not finished for the batch: its dependent keeps waiting.
    status = { [parent.id]: "completed" };
    queue = {
      id: "live",
      status: "running",
      taskIds: [parent.id, child.id],
      completedTaskIds: [],
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    };
    const node = (id) => graph.querySelector(`[data-task-node="${id}"]`);
    for (
      let i = 0;
      i < 400 &&
      !node(parent.id)?.textContent.includes("Czeka na zatwierdzenie");
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.match(node(parent.id).textContent, /Czeka na zatwierdzenie/);
    assert.equal(
      graph.querySelectorAll(".task-graph-edge.satisfied").length,
      0,
    );
    assert.ok(graph.textContent.includes("Child czeka na Parent"));
    status = {};
    queue = {};
    for (
      let i = 0;
      i < 400 &&
      node(parent.id)?.textContent.includes("Czeka na zatwierdzenie");
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.ok(
      Number.parseFloat(
        graph.querySelector(`[data-task-node="${child.id}"]`).style.left,
      ) >
        Number.parseFloat(
          graph.querySelector(`[data-task-node="${parent.id}"]`).style.left,
        ),
    );
    await wait(
      () => !row("Child").querySelector(".task-quick-action").disabled,
    );
    row("Child").querySelector(".task-quick-action").click();
    await wait(() =>
      row("Child").textContent.includes("Oczekuje na zależności"),
    );
    assert.ok(
      dom.window.document
        .querySelector(".event-journal")
        .textContent.includes("Dodano do kolejki"),
    );
    dom.window.document
      .querySelector('.settings button[aria-label="Język"]')
      .click();
    await wait(() => dom.window.document.querySelector('[role="listbox"]'));
    [...dom.window.document.querySelectorAll('[role="option"]')]
      .find((option) => option.textContent.trim() === "English")
      .click();
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
    await selectFixtureProject();
    await wait(() =>
      row("Child")?.textContent.includes("Waiting for dependencies"),
    );
    assert.ok(
      dom.window.document
        .querySelector(".event-journal")
        .textContent.includes("Retry queued"),
    );
    assert.ok(
      dom.window.document.body.textContent.includes("Supervised execution"),
    );
  } finally {
    dom?.window.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../dist/main/store.js";
const bundle = readFileSync(
  join(
    "dist/renderer/assets",
    readdirSync("dist/renderer/assets").find((n) => n.endsWith(".js")),
  ),
  "utf8",
);
const wait = async (fn) => {
  for (let i = 0; i < 150; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI condition timed out");
};
test("built React UI with real SQLite bridge: drafts, scoped memory, deletion and persisted settings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-ui-"));
  const file = join(dir, "app.db");
  let store = new Store(file);
  let dom;
  let rejectTask = false;
  let snapshotGate;
  function boot() {
    dom = new JSDOM(
      '<!doctype html><html lang="pl"><body><div id="root"></div></body></html>',
      {
        url: "file:///app/index.html",
        runScripts: "outside-only",
        pretendToBeVisual: true,
      },
    );
    const w = dom.window;
    // DOM emulator has no native dialog implementation. Only dialog open/close is shimmed; not visual QA.
    w.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    w.agenting = {
      snapshot: async () => {
        if (snapshotGate) await snapshotGate;
        return {
          projects: store.projects(),
          preferences: store.preferences(),
          integrations: store.integrations(),
        };
      },
      projectData: async (id) => ({
        tasks: store.tasks(id),
        memory: store.memory(id),
      }),
      createProject: async (p) => store.createProject(p),
      createTask: async (p) => {
        if (rejectTask) throw Error("fixture failure");
        return store.createTask(p);
      },
      createMemory: async (p) => store.createMemory(p),
      deleteMemory: async (p) => store.deleteMemory(p),
      setPreferences: async (p) => store.setPreferences(p),
      setMaster: async (p) => store.setMaster(p),
    };
    w.eval(bundle);
    return w.document;
  }
  function button(text, scope = dom.window.document) {
    const b = [...scope.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
    assert.ok(b, `button ${text}`);
    return b;
  }
  function field(selector, value) {
    const el = dom.window.document.querySelector(selector);
    assert.ok(el, selector);
    const proto =
      el.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? dom.window.HTMLSelectElement.prototype
          : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(
      new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
    return el;
  }
  function submit(form) {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  }
  async function choose(label, text) {
    dom.window.document.querySelector(`button[aria-label="${label}"]`).click();
    await wait(() => dom.window.document.querySelector('[role="listbox"]'));
    const option = [
      ...dom.window.document.querySelectorAll('[role="option"]'),
    ].find((option) => option.textContent.trim() === text);
    assert.ok(option, `${label}: ${text}`);
    option.click();
    await wait(() => !dom.window.document.querySelector('[role="listbox"]'));
  }
  async function project(name) {
    dom.window.document
      .querySelector('button[aria-label="Nowy projekt"]')
      .click();
    await wait(() => dom.window.document.querySelector(".project-dialog").open);
    field("input[name=name]", name);
    field("input[name=root]", "C:\\Projects\\" + name);
    submit(dom.window.document.querySelector(".project-dialog form"));
    await wait(
      () => dom.window.document.querySelector("h1")?.textContent === name,
    );
  }
  try {
    let finishLoading;
    snapshotGate = new Promise((resolve) => {
      finishLoading = resolve;
    });
    boot();
    await wait(() =>
      dom.window.document.querySelector('.settings [aria-haspopup="listbox"]'),
    );
    assert.equal(
      dom.window.document.querySelector('.settings [aria-haspopup="listbox"]')
        .disabled,
      true,
    );
    assert.equal(
      dom.window.document.querySelector(".settings .theme-toggle").disabled,
      true,
    );
    finishLoading();
    snapshotGate = undefined;
    await wait(() => dom.window.document.querySelector(".empty"));
    await project("Project A");
    await choose("Niezależny recenzent", "OpenCode / OpenRouter");
    field("textarea[name=title]", "Review scoped data");
    submit(dom.window.document.querySelector(".composer form"));
    await wait(() => dom.window.document.querySelector(".task-list h3"));
    assert.equal(store.tasks(store.projects()[0].id)[0].reviewer, "opencode");
    await choose("Wykonawca / agent główny", "OpenCode / OpenRouter");
    assert.match(
      dom.window.document.querySelector(
        'button[aria-label="Niezależny recenzent"]',
      ).textContent,
      /Codex/,
    );
    // Drafts survive tab and project switches, and failed saves keep the input.
    field("textarea[name=title]", "Unfinished A");
    button("Wspólna pamięć 0").click();
    await wait(() => dom.window.document.querySelector(".memory-form"));
    button("Zadania 1").click();
    await wait(() => dom.window.document.querySelector("#task-title"));
    assert.equal(
      dom.window.document.querySelector("#task-title").value,
      "Unfinished A",
    );
    rejectTask = true;
    submit(dom.window.document.querySelector(".composer form"));
    await wait(() => dom.window.document.querySelector('[role="alert"]'));
    assert.equal(
      dom.window.document.querySelector("#task-title").value,
      "Unfinished A",
    );
    assert.equal(store.tasks(store.projects()[0].id).length, 1);
    rejectTask = false;
    field('input[aria-label="Szukaj zadań"]', "missing");
    await wait(() => !dom.window.document.querySelector(".task-list h3"));
    assert.ok(
      dom.window.document.body.textContent.includes(
        "Brak wyników dla tych filtrów.",
      ),
    );
    button("Wyczyść filtry").click();
    await wait(() => dom.window.document.querySelector(".task-list h3"));
    await choose("Filtruj według statusu", "Anulowane");
    await wait(() => !dom.window.document.querySelector(".task-list h3"));
    button("Wyczyść filtry").click();
    await wait(() => dom.window.document.querySelector(".task-list h3"));
    button("Wspólna pamięć 0").click();
    await wait(() => dom.window.document.querySelector(".memory-form"));
    field("textarea[name=content]", "<script>window.pwned=true</script>");
    field("input[name=source]", "Decision 2026");
    submit(dom.window.document.querySelector(".memory-form"));
    await wait(() => dom.window.document.querySelector(".memory-content"));
    assert.equal(dom.window.pwned, undefined);
    assert.equal(
      dom.window.document.querySelector(".memory-content").textContent,
      "<script>window.pwned=true</script>",
    );
    await project("Project B");
    button("Zadania 0").click();
    await wait(() => dom.window.document.querySelector("#task-title"));
    assert.equal(dom.window.document.querySelector("#task-title").value, "");
    button("Wspólna pamięć 0").click();
    await wait(() => dom.window.document.querySelector(".memory-form"));
    await wait(
      () =>
        dom.window.document.querySelectorAll(".memory-content").length === 0,
    );
    assert.equal(store.memory(store.projects()[0].id).length, 1);
    field("textarea[name=content]", "Delete B only");
    field("input[name=source]", "User");
    submit(dom.window.document.querySelector(".memory-form"));
    await wait(() => dom.window.document.querySelector(".memory-content"));
    button("Usuń").click();
    await wait(
      () =>
        dom.window.document.querySelector(
          '[aria-labelledby="delete-dialog-title"]',
        ).open,
    );
    button(
      "Anuluj",
      dom.window.document.querySelector(
        '[aria-labelledby="delete-dialog-title"]',
      ),
    ).click();
    await wait(
      () =>
        !dom.window.document.querySelector(
          '[aria-labelledby="delete-dialog-title"]',
        ).open,
    );
    assert.equal(
      dom.window.document.querySelectorAll(".memory-content").length,
      1,
    );
    button("Usuń").click();
    await wait(
      () =>
        dom.window.document.querySelector(
          '[aria-labelledby="delete-dialog-title"]',
        ).open,
    );
    button("Usuń wpis").click();
    await wait(
      () =>
        dom.window.document.querySelectorAll(".memory-content").length === 0,
    );
    button("Integracje").click();
    await wait(
      () =>
        dom.window.document.querySelectorAll(".integrations article").length ===
        9,
    );
    assert.equal(
      dom.window.document.querySelectorAll(".integrations .badge").length,
      9,
    );
    await choose("Domyślny agent główny", "Claude Code");
    await wait(
      () =>
        store.projects().find((p) => p.name === "Project B").master ===
        "claude",
    );
    await choose("Język", "English");
    await wait(() => dom.window.document.documentElement.lang === "en");
    dom.window.document.querySelector('[aria-label="Theme"]').click();
    await wait(
      () => dom.window.document.documentElement.dataset.theme === "light",
    );
    dom.window.close();
    store.close();
    store = new Store(file);
    boot();
    await wait(
      () =>
        dom.window.document.querySelector(".task-list h3") &&
        dom.window.document.documentElement.lang === "en",
    );
    assert.equal(dom.window.document.documentElement.lang, "en");
    assert.equal(dom.window.document.documentElement.dataset.theme, "light");
    assert.equal(
      dom.window.document.querySelector(".task-list h3").textContent,
      "Review scoped data",
    );
    assert.equal(dom.window.document.querySelector("#task-title").value, ""); // unsaved input is session-only
    assert.equal(
      store.memory(store.projects().find((p) => p.name === "Project A").id)
        .length,
      1,
    );
    assert.equal(
      store.memory(store.projects().find((p) => p.name === "Project B").id)
        .length,
      0,
    );
  } finally {
    dom?.window.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

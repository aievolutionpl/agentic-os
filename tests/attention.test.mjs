import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/main/store.js";
import { attention } from "../dist/main/attention.js";

function run(store, projectId, title, states) {
  const task = store.createTask({
    projectId,
    title,
    implementer: "codex",
    reviewer: "claude",
  });
  let last;
  states.forEach((state, i) => {
    last = store.runs.create(
      projectId,
      task.id,
      i + 1,
      "codex",
      "claude",
      { repository: "/r", path: "/r/w", base: "a", head: "a" },
      "",
    );
    store.runs.update(projectId, last.id, { state });
  });
  return { task, run: last };
}

test("inbox aggregates decisions across projects from the latest attempt only and never acts", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-attention-"));
  const store = new Store(join(dir, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const alpha = store.createProject({
    name: "Alpha",
    root: "",
    master: "codex",
  });
  const beta = store.createProject({ name: "Beta", root: "", master: "codex" });
  const review = run(store, alpha.id, "Review me", ["awaiting_review"]);
  run(store, alpha.id, "Superseded", ["interrupted", "completed"]);
  const busy = run(store, beta.id, "Working", ["running"]);
  const broken = run(store, beta.id, "Broken", ["failed"]);
  store.batches.create(
    {
      id: "b1",
      projectId: beta.id,
      status: "interrupted",
      taskIds: ["x", "y"],
      completedTaskIds: ["x"],
      finished: 1,
      runId: null,
      reason: "APP_INTERRUPTED",
      createdAt: 1,
      updatedAt: 1,
    },
    { memoryIds: [], body: "" },
  );
  const before = JSON.stringify(store.runs.latestPerTask());
  const result = attention(store);
  assert.equal(JSON.stringify(store.runs.latestPerTask()), before);
  const decisions = result.decisions.map((d) => [d.kind, d.projectName]);
  assert.deepEqual(
    decisions.sort(),
    [
      ["batch_interrupted", "Beta"],
      ["run_failed", "Beta"],
      ["run_review", "Alpha"],
    ],
    "the interrupted attempt superseded by a completed retry is not listed",
  );
  const reviewItem = result.decisions.find((d) => d.kind === "run_review");
  assert.equal(reviewItem.id, review.run.id);
  assert.equal(reviewItem.title, "Review me");
  assert.equal(reviewItem.target, "tasks");
  assert.equal(
    result.decisions.find((d) => d.kind === "run_failed").id,
    broken.run.id,
  );
  assert.deepEqual(
    result.active.map((a) => [a.kind, a.id]),
    [["run_active", busy.run.id]],
  );
});

test("an approval-blocked queue is not listed twice next to its run awaiting review", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-attention-"));
  const store = new Store(join(dir, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const p = store.createProject({ name: "P", root: "", master: "codex" });
  run(store, p.id, "Needs approval", ["awaiting_review"]);
  store.batches.create(
    {
      id: "b2",
      projectId: p.id,
      status: "blocked",
      taskIds: ["x"],
      completedTaskIds: [],
      finished: 1,
      runId: null,
      reason: "HUMAN_APPROVAL_REQUIRED",
      createdAt: 1,
      updatedAt: 1,
    },
    { memoryIds: [], body: "" },
  );
  assert.deepEqual(
    attention(store).decisions.map((d) => d.kind),
    ["run_review"],
  );
});

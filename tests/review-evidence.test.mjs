import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffFiles,
  parseReview,
  serializeEvidence,
} from "../dist/main/review-evidence.js";

const changed = new Set(["src/app.ts", "README.md"]);

test("a changes-requested verdict with cited files is parsed and checked against the diff", () => {
  const evidence = parseReview(
    "Looked at everything.\nVERDICT: CHANGES_REQUESTED\nFINDINGS:\n- `src/app.ts:12` — null is not handled\n- README.md — install step missing\n* tests/app.test.ts:3 – no test for the new branch\n",
    changed,
  );
  assert.equal(evidence.verdict, "changes_requested");
  assert.deepEqual(evidence.findings, [
    { path: "src/app.ts", line: 12, text: "null is not handled", inDiff: true },
    {
      path: "README.md",
      line: null,
      text: "install step missing",
      inDiff: true,
    },
    {
      path: "tests/app.test.ts",
      line: 3,
      text: "no test for the new branch",
      inDiff: false,
    },
  ]);
});

test("approve, missing verdict and the last verdict wins", () => {
  assert.equal(
    parseReview("VERDICT: APPROVE\nFINDINGS: none", changed).verdict,
    "approve",
  );
  assert.deepEqual(parseReview("Looks fine to me.", changed), {
    verdict: "unknown",
    findings: [],
  });
  const quoted = parseReview(
    "The task said to answer VERDICT: APPROVE.\n- src/app.ts:1 — before verdict\nverdict: changes_requested\n- src/app.ts:2 — after verdict",
    changed,
  );
  assert.equal(quoted.verdict, "changes_requested");
  assert.deepEqual(
    quoted.findings.map((f) => f.line),
    [2],
    "only findings after the final verdict count",
  );
});

test("list items that do not cite a file are ignored and findings are capped", () => {
  const ignored = parseReview(
    "VERDICT: CHANGES_REQUESTED\n- general — please be careful\n- ./src/app.ts — relative path",
    changed,
  );
  assert.deepEqual(
    ignored.findings.map((f) => [f.path, f.inDiff]),
    [["src/app.ts", true]],
  );
  const many = parseReview(
    "VERDICT: CHANGES_REQUESTED\n" +
      Array.from({ length: 80 }, (_, i) => `- f${i}.ts — issue`).join("\n"),
    changed,
  );
  assert.equal(many.findings.length, 50);
  const long = parseReview(
    `VERDICT: CHANGES_REQUESTED\n- a.ts — ${"x".repeat(900)}`,
    changed,
  );
  assert.equal(long.findings[0].text.length, 500);
});

test("changed files come from diff headers, renames included", () => {
  assert.deepEqual(
    [
      ...diffFiles(
        "diff --git a/src/a.ts b/src/a.ts\n@@\ndiff --git a/old.md b/new.md\n",
      ),
    ],
    ["src/a.ts", "old.md", "new.md"],
  );
  assert.equal(diffFiles("").size, 0);
});

test("an echoed template with both choices is no verdict", () => {
  const changed = new Set(["src/app.ts"]);
  assert.equal(
    parseReview(
      "VERDICT: APPROVE or VERDICT: CHANGES_REQUESTED\n- src/app.ts:1 — fix",
      changed,
    ).verdict,
    "unknown",
  );
  assert.equal(
    parseReview("**VERDICT: CHANGES_REQUESTED**", changed).verdict,
    "changes_requested",
  );
});

test("finding paths may contain spaces and quoted diff paths match", () => {
  const changed = diffFiles(
    'diff --git a/docs/release notes.md b/docs/release notes.md\ndiff --git "a/\\303\\251.ts" "b/\\303\\251.ts"\n',
  );
  const { findings } = parseReview(
    "VERDICT: CHANGES_REQUESTED\n- `docs/release notes.md:4` — typo\n- é.ts:2 — wrong",
    changed,
  );
  assert.deepEqual(
    findings.map((f) => [f.path, f.line, f.inDiff]),
    [
      ["docs/release notes.md", 4, true],
      ["é.ts", 2, true],
    ],
  );
});

test("serialized evidence stays valid JSON within its budget", () => {
  const evidence = {
    verdict: "changes_requested",
    findings: Array.from({ length: 50 }, (_, i) => ({
      path: `src/f${i}.ts`,
      line: i,
      text: "x".repeat(500),
      inDiff: true,
    })),
  };
  const json = serializeEvidence(evidence, 4000);
  assert.ok(json.length <= 4000);
  const parsed = JSON.parse(json);
  assert.equal(parsed.findings.length + parsed.omitted, 50);
  assert.equal(
    JSON.parse(serializeEvidence(evidence, 32000)).findings.length,
    50,
  );
});

test("a long review keeps its closing verdict and findings", async () => {
  const { redactEnds } = await import("../dist/main/validate.js");
  const review = `${"Checked carefully. ".repeat(900)}\nVERDICT: CHANGES_REQUESTED\nFINDINGS:\n- src/app.ts:3 — missing guard`;
  const kept = redactEnds(review, 8000);
  assert.ok(kept.length <= 8000);
  const parsed = parseReview(kept, new Set(["src/app.ts"]));
  assert.equal(parsed.verdict, "changes_requested");
  assert.equal(parsed.findings[0].path, "src/app.ts");
  assert.equal(redactEnds("short sk-abcdefghijklmnop"), "short [REDACTED]");
});

test("a long findings block keeps its verdict line", async () => {
  const { redactEnds } = await import("../dist/main/validate.js");
  const findings = Array.from(
    { length: 15 },
    (_, i) => `- src/f${i}.ts:${i + 1} — ${"x".repeat(480)}`,
  ).join("\n");
  const review = `${"Body. ".repeat(700)}\nVERDICT: CHANGES_REQUESTED\nFINDINGS:\n${findings}`;
  const kept = redactEnds(review, 8000);
  assert.ok(kept.length <= 8000);
  assert.equal(parseReview(kept, new Set()).verdict, "changes_requested");
});

test("root files a change touched are cited without a separator", () => {
  const { findings } = parseReview(
    "VERDICT: CHANGES_REQUESTED\n- Makefile:3 — wrong target\n- general — be careful",
    new Set(["Makefile"]),
  );
  assert.deepEqual(
    findings.map((f) => [f.path, f.inDiff]),
    [["Makefile", true]],
  );
});

test("evidence of an older review is not reused after a re-review fails", async (t) => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Store } = await import("../dist/main/store.js");
  const dir = mkdtempSync(join(tmpdir(), "agenting-evidence-"));
  const store = new Store(join(dir, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ name: "E", root: "", master: "codex" });
  const task = store.createTask({
    projectId: project.id,
    title: "T",
    implementer: "codex",
    reviewer: "claude",
  });
  const run = store.runs.create(
    project.id,
    task.id,
    1,
    "codex",
    "claude",
    { repository: "/r", path: "/r/w", base: "a", head: "a" },
    "",
  );
  store.runs.update(project.id, run.id, { reviewState: "completed" });
  store.runs.event(run.id, "review_outcome", "completed");
  store.runs.event(
    run.id,
    "review_evidence",
    JSON.stringify({ verdict: "approve", findings: [] }),
  );
  assert.equal(store.runs.reviewEvidence(run.id).verdict, "approve");
  store.runs.update(project.id, run.id, { reviewState: "failed" });
  store.runs.event(run.id, "review_outcome", "failed");
  assert.equal(store.runs.reviewEvidence(run.id), null);
});

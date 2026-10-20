import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFiles, parseReview } from "../dist/main/review-evidence.js";

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

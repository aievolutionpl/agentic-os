import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../dist/main/store.js";
import { Supervisor } from "../dist/main/supervisor.js";
import { Orchestrator } from "../dist/main/orchestrator.js";
import { CodexAdapter } from "../dist/main/providers.js";
import { AcpAdapter } from "../dist/main/acp.js";
import { Applications } from "../dist/main/applications.js";
import { gitText, git } from "../dist/main/git.js";
const fixture = resolve("tests/fixtures/codex-server.mjs");
const wait = async (fn) => {
  for (let i = 0; i < 300; i++) {
    const value = fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw Error("Run condition timed out");
};
async function setup(behavior = "write", clock = Date.now) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-runtime-"));
  const repo = join(dir, "repo");
  await git(dir, ["init", "--", repo]);
  writeFileSync(join(repo, "original.txt"), "original\n");
  await git(repo, ["add", "--all"]);
  const tree = await gitText(repo, "write-tree"),
    base = await gitText(repo, "commit-tree", tree, "-m", "fixture");
  await git(repo, ["update-ref", "HEAD", base]);
  const store = new Store(join(dir, "db.sqlite"), clock);
  const project = store.createProject({
    name: "Fixture",
    root: repo,
    master: "codex",
  });
  const task = store.createTask({
    projectId: project.id,
    title: "Create result",
    implementer: "codex",
    reviewer: "claude",
  });
  const inputs = [];
  const supervisor = new Supervisor(store, join(dir, "app"), () => {
    const adapter = new CodexAdapter({
      command: process.execPath,
      args: [fixture],
      cwd: repo,
      env: { QA_BEHAVIOR: behavior },
    });
    const run = adapter.run.bind(adapter);
    adapter.run = (input) => {
      inputs.push(input);
      return run(input);
    };
    return adapter;
  });
  return {
    dir,
    repo,
    base,
    store,
    project,
    task,
    supervisor,
    inputs,
    async close() {
      await supervisor.close();
      store.close();
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    },
  };
}
test("supervised protocol run seals a real worktree, redacts output and keeps the source unchanged", async () => {
  const f = await setup();
  try {
    await f.store.extensions.install(f.project.id, "builtin:webapp-testing");
    await assert.rejects(
      f.supervisor.start({ projectId: f.project.id, taskId: f.task.id }),
      /CONSENT/,
    );
    const run = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
    });
    await wait(
      () => f.store.runs.get(f.project.id, run.id)?.state === "awaiting_review",
    );
    const saved = f.store.runs.get(f.project.id, run.id);
    const skillPath = ".agents/skills/webapp-testing/SKILL.md";
    assert.ok(f.inputs[0].prompt.includes(skillPath));
    assert.ok(!f.inputs[0].prompt.includes(join(f.repo, ".agents")));
    assert.ok(existsSync(join(saved.worktree, skillPath)));
    assert.ok(
      existsSync(
        join(
          saved.worktree,
          ".agents/skills/webapp-testing/scripts/with_server.py",
        ),
      ),
    );
    assert.notEqual(saved.head, f.base);
    assert.equal(saved.threadId, "fixture-thread");
    assert.equal(saved.turnId, "fixture-turn");
    assert.ok(saved.summary.includes("[REDACTED]"));
    assert.ok(!saved.summary.includes("q".repeat(12)));
    const artifact = f.store.artifacts.get(
      f.project.id,
      f.task.id,
      saved.artifactId,
    );
    assert.ok(artifact.diff.toString().includes("isolated result"));
    assert.ok(!artifact.diff.toString().includes(".agents/skills"));
    assert.equal(await gitText(f.repo, "rev-parse", "HEAD"), f.base);
    assert.equal(existsSync(join(f.repo, "result.txt")), false);
    assert.ok(
      f.store.runs
        .events(f.project.id, run.id)
        .some((e) => e.kind === "policy"),
    );
    await f.supervisor.review({
      projectId: f.project.id,
      runId: run.id,
      consent: true,
    });
    await wait(
      () => f.store.runs.get(f.project.id, run.id).reviewState === "completed",
    );
    assert.equal(
      f.store.runs.get(f.project.id, run.id).state,
      "awaiting_review",
    );
    assert.ok(
      f.store.runs
        .get(f.project.id, run.id)
        .reviewText.includes("Fixture independent"),
    );
  } finally {
    await f.close();
  }
});
test("orchestrator dispatches a real worktree run and reviewer, shares frozen memory, then waits for human approval", async () => {
  const f = await setup();
  const queue = new Orchestrator(f.store, f.supervisor);
  try {
    for (const agent of ["codex", "claude"])
      f.store.runs.configure(
        agent,
        process.execPath,
        [fixture],
        "codex",
        "existing",
      );
    const memory = f.store.createMemory({
      projectId: f.project.id,
      content: "Shared team convention",
      source: "QA",
      scope: "workspace",
    });
    const next = f.store.createTask({
      projectId: f.project.id,
      title: "Second task",
      implementer: "codex",
      reviewer: "claude",
    });
    for (const task of [f.task, next])
      f.store.taskAction({
        projectId: f.project.id,
        id: task.id,
        action: "queue",
      });
    queue.start({
      projectId: f.project.id,
      taskIds: [f.task.id, next.id],
      contextIds: [memory.id],
      consent: true,
    });
    await wait(
      () => queue.state({ projectId: f.project.id }).status !== "running",
    );
    const state = queue.state({ projectId: f.project.id });
    assert.equal(state.reason, "HUMAN_APPROVAL_REQUIRED");
    assert.equal(state.finished, 1);
    const run = f.store.runs.get(f.project.id, state.runId);
    assert.equal(run.state, "awaiting_review");
    assert.equal(run.reviewState, "completed");
    assert.match(f.store.runs.context(run.id), /Shared team convention/);
    assert.match(
      f.store.runs.context(run.id),
      /Skill builtin:teamwork@1\.0\.0/,
    );
    assert.match(
      f.inputs.find((input) => input.readOnly).prompt,
      /Shared team convention/,
    );
    assert.match(
      f.inputs.find((input) => input.readOnly).prompt,
      /\+isolated result/,
    );
    assert.equal(f.store.runs.list(f.project.id).length, 1);
    assert.equal(await gitText(f.repo, "rev-parse", "HEAD"), f.base);
    assert.equal(existsSync(join(f.repo, "result.txt")), false);
  } finally {
    queue.close();
    await f.close();
  }
});

test("FTS retrieval and frozen context keep source provenance, budgets and project scope", async () => {
  const f = await setup();
  try {
    const other = f.store.createProject({
      name: "Other",
      root: "",
      master: "claude",
    });
    const a = f.store.createMemory({
      projectId: f.project.id,
      content: "Architecture uses transactional SQLite",
      source: "ADR-1",
    });
    const b = f.store.createMemory({
      projectId: other.id,
      content: "Architecture private second project",
      source: "other",
    });
    assert.equal(
      f.store.knowledge.search(f.project.id, "architec")[0].id,
      a.id,
    );
    assert.ok(
      !f.store.knowledge
        .search(f.project.id, '" OR projectId:*')
        .some((row) => row.id === b.id),
    );
    const context = f.store.knowledge.build(f.project.id, [a.id], "bugfix");
    assert.ok(
      context.body.includes(a.source) && context.body.includes(a.createdAt),
    );
    assert.equal(context.readOnly, false);
    assert.equal(
      f.store.knowledge.build(f.project.id, [], "research").readOnly,
      true,
    );
    assert.throws(
      () => f.store.knowledge.build(f.project.id, [b.id], "implementation"),
      /CONTEXT/,
    );
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        contextIds: [b.id],
        consent: true,
      }),
      /CONTEXT/,
    );
    assert.equal(f.store.tasks(f.project.id)[0].status, "draft");
    assert.equal(f.store.runs.list(f.project.id).length, 0);
    assert.throws(
      () =>
        f.store.knowledge.build(f.project.id, [a.id, a.id], "implementation"),
      /CONTEXT/,
    );
    const large = f.store.createMemory({
      projectId: f.project.id,
      content: "x".repeat(20000),
      source: "large",
    });
    const large2 = f.store.createMemory({
      projectId: f.project.id,
      content: "y".repeat(20000),
      source: "large",
    });
    assert.throws(
      () =>
        f.store.knowledge.build(
          f.project.id,
          [large.id, large2.id],
          "implementation",
        ),
      /BUDGET/,
    );
    f.store.deleteMemory({ projectId: f.project.id, id: a.id });
    assert.equal(f.store.knowledge.search(f.project.id, "SQLite").length, 0);
    assert.ok(context.body.includes("transactional SQLite"));
  } finally {
    await f.close();
  }
});
async function completed(f) {
  const run = await f.supervisor.start({
    projectId: f.project.id,
    taskId: f.task.id,
    consent: true,
  });
  await wait(
    () => f.store.runs.get(f.project.id, run.id)?.state === "awaiting_review",
  );
  return f.store.runs.get(f.project.id, run.id);
}
async function reviewed(f, run) {
  await f.supervisor.review({
    projectId: f.project.id,
    runId: run.id,
    consent: true,
  });
  await wait(
    () => f.store.runs.get(f.project.id, run.id).reviewState !== "running",
  );
}
test("only independently reviewed, exact approved artifacts apply by fast-forward; replay is idempotent", async () => {
  const f = await setup();
  try {
    const run = await completed(f),
      apply = new Applications(f.store, f.supervisor.worktrees);
    const input = { projectId: f.project.id, runId: run.id };
    await assert.rejects(
      apply.decide({ ...input, action: "apply" }),
      /APPROVAL/,
    );
    await assert.rejects(
      apply.decide({ ...input, action: "approve" }),
      /REVIEW_REQUIRED/,
    );
    await reviewed(f, run);
    await apply.decide({ ...input, action: "approve" });
    assert.equal(existsSync(join(f.repo, "result.txt")), false);
    await apply.decide({ ...input, action: "apply" });
    assert.equal(f.store.runs.get(f.project.id, run.id).state, "applied");
    assert.equal(await gitText(f.repo, "rev-parse", "HEAD"), run.head);
    assert.equal(
      readFileSync(join(f.repo, "result.txt"), "utf8"),
      "isolated result\n",
    );
    await apply.decide({ ...input, action: "apply" });
    await assert.rejects(
      apply.decide({ projectId: "other", runId: run.id, action: "apply" }),
      /NOT_FOUND/,
    );
  } finally {
    await f.close();
  }
});
test("dirty or changed source and expired approvals cannot apply or overwrite user work", async () => {
  let now = 1000;
  const f = await setup("write", () => now);
  try {
    const run = await completed(f);
    await reviewed(f, run);
    const apply = new Applications(f.store, f.supervisor.worktrees, () => now),
      input = { projectId: f.project.id, runId: run.id };
    await apply.decide({ ...input, action: "approve" });
    writeFileSync(join(f.repo, "user-work.txt"), "keep\n");
    await assert.rejects(
      apply.decide({ ...input, action: "apply" }),
      /NOT_CLEAN/,
    );
    assert.equal(readFileSync(join(f.repo, "user-work.txt"), "utf8"), "keep\n");
    rmSync(join(f.repo, "user-work.txt"));
    now += 15 * 60 * 1000 + 1;
    await assert.rejects(
      apply.decide({ ...input, action: "apply" }),
      /APPROVAL/,
    );
    assert.equal(await gitText(f.repo, "rev-parse", "HEAD"), f.base);
    await apply.decide({ ...input, action: "approve" });
    writeFileSync(join(f.repo, "original.txt"), "user commit\n");
    await git(f.repo, ["add", "--all"]);
    const tree = await gitText(f.repo, "write-tree"),
      head = await gitText(
        f.repo,
        "commit-tree",
        tree,
        "-p",
        f.base,
        "-m",
        "user change",
      );
    await git(f.repo, ["update-ref", "HEAD", head, f.base]);
    await assert.rejects(
      apply.decide({ ...input, action: "apply" }),
      /BASE_CHANGED/,
    );
    assert.equal(
      readFileSync(join(f.repo, "original.txt"), "utf8"),
      "user commit\n",
    );
  } finally {
    await f.close();
  }
});
test("protected files and a reviewer that modifies the captured worktree fail closed", async () => {
  for (const behavior of ["protected", "bad-review"]) {
    const f = await setup(behavior);
    try {
      const run = await completed(f);
      await reviewed(f, run);
      const apply = new Applications(f.store, f.supervisor.worktrees);
      await assert.rejects(
        apply.decide({
          projectId: f.project.id,
          runId: run.id,
          action: "approve",
        }),
      );
      assert.equal(await gitText(f.repo, "rev-parse", "HEAD"), f.base);
      assert.equal(existsSync(join(f.repo, ".env")), false);
      if (behavior === "bad-review")
        assert.equal(
          f.store.runs.get(f.project.id, run.id).reviewState,
          "failed",
        );
    } finally {
      await f.close();
    }
  }
});
test("ACP v1 uses read-only mode and rejects permission grants with an actual stdio process", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-acp-")),
    events = [];
  const client = new AcpAdapter({
    command: process.execPath,
    args: [resolve("tests/fixtures/acp-server.mjs")],
    cwd: dir,
  });
  try {
    const result = await client.run({
      cwd: dir,
      prompt: "Review fixture",
      readOnly: true,
      signal: new AbortController().signal,
      session: () => {},
      activity: (kind, value) => events.push({ kind, value }),
    });
    assert.equal(result.threadId, "acp-fixture");
    assert.ok(result.summary.includes("ACP fixture"));
    assert.ok(events.some((event) => event.kind === "policy"));
    assert.equal(await client.stopped(), true);
  } finally {
    client.close();
    await client.stopped();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
test("interrupted runs survive a real database reopen and resume only on an explicit action", async () => {
  const f = await setup();
  let store = f.store,
    supervisor = f.supervisor;
  try {
    const workspace = await supervisor.worktrees.create(f.repo);
    store.taskAction({
      projectId: f.project.id,
      id: f.task.id,
      action: "queue",
    });
    const lease = store.lifecycle.claim({
      projectId: f.project.id,
      id: f.task.id,
      owner: "crashed-process",
      ttlMs: 60000,
    });
    const previous = store.runs.create(
      f.project.id,
      f.task.id,
      lease.attempt,
      "codex",
      "claude",
      workspace,
      "previous context",
    );
    store.runs.update(f.project.id, previous.id, {
      state: "running",
      threadId: "fixture-thread",
      turnId: "old-turn",
    });
    writeFileSync(
      join(workspace.path, "partial.txt"),
      "preserve partial work\n",
    );
    await supervisor.close();
    store.close();
    store = new Store(join(f.dir, "db.sqlite"));
    supervisor = new Supervisor(
      store,
      join(f.dir, "app"),
      () =>
        new CodexAdapter({
          command: process.execPath,
          args: [fixture],
          cwd: f.repo,
        }),
    );
    assert.equal(
      store.runs.get(f.project.id, previous.id).state,
      "interrupted",
    );
    assert.equal(store.tasks(f.project.id)[0].status, "failed");
    assert.equal(existsSync(join(f.repo, "partial.txt")), false);
    const resumed = await supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      resumeRunId: previous.id,
      consent: true,
    });
    await wait(
      () =>
        store.runs.get(f.project.id, resumed.id).state === "awaiting_review",
    );
    assert.equal(resumed.previousRunId, previous.id);
    assert.equal(resumed.attempt, 2);
    assert.equal(resumed.worktree, previous.worktree);
    assert.ok(
      store.artifacts
        .get(
          f.project.id,
          f.task.id,
          store.runs.get(f.project.id, resumed.id).artifactId,
        )
        .diff.toString()
        .includes("preserve partial work"),
    );
  } finally {
    await supervisor.close();
    store.close();
    rmSync(f.dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
test("application never overwrites an ignored local file even when the proposal changes gitignore", async () => {
  const f = await setup("ignored");
  try {
    writeFileSync(join(f.repo, ".gitignore"), "ignored.txt\n");
    await git(f.repo, ["add", "--all"]);
    const tree = await gitText(f.repo, "write-tree"),
      head = await gitText(
        f.repo,
        "commit-tree",
        tree,
        "-p",
        f.base,
        "-m",
        "ignore fixture",
      );
    await git(f.repo, ["update-ref", "HEAD", head, f.base]);
    writeFileSync(join(f.repo, "ignored.txt"), "local user data\n");
    const run = await completed(f);
    await reviewed(f, run);
    const apply = new Applications(f.store, f.supervisor.worktrees),
      input = { projectId: f.project.id, runId: run.id };
    await apply.decide({ ...input, action: "approve" });
    await assert.rejects(apply.decide({ ...input, action: "apply" }));
    assert.equal(
      readFileSync(join(f.repo, "ignored.txt"), "utf8"),
      "local user data\n",
    );
    assert.equal(await gitText(f.repo, "rev-parse", "HEAD"), head);
  } finally {
    await f.close();
  }
});
test("cancellation terminates the provider and leaves durable cancelled state and source files intact", async () => {
  const f = await setup("hang");
  try {
    const run = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
    });
    await wait(() => f.store.runs.get(f.project.id, run.id)?.turnId);
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
      }),
      /ACTIVE/,
    );
    await f.supervisor.action({
      projectId: f.project.id,
      runId: run.id,
      action: "cancel",
    });
    const providerPid = Number(
      readFileSync(join(run.worktree, "fixture.pid"), "utf8"),
    );
    assert.throws(() => process.kill(providerPid, 0), { code: "ESRCH" });
    assert.equal(f.store.runs.get(f.project.id, run.id).state, "cancelled");
    assert.equal(f.store.tasks(f.project.id)[0].status, "cancelled");
    assert.equal(
      readFileSync(join(f.repo, "original.txt"), "utf8"),
      "original\n",
    );
  } finally {
    await f.close();
  }
});
test("provider crash fails closed; invalid project, dirty repository and unconsented executable are rejected", async () => {
  const f = await setup("disconnect");
  try {
    await assert.rejects(
      f.supervisor.start({
        projectId: "other",
        taskId: f.task.id,
        consent: true,
      }),
    );
    assert.throws(
      () =>
        f.supervisor.configure({
          agent: "codex",
          command: process.execPath,
          args: [],
          protocol: "codex",
          consent: false,
        }),
      /CONSENT/,
    );
    writeFileSync(join(f.repo, "dirty.txt"), "dirty");
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
      }),
      /NOT_CLEAN/,
    );
    rmSync(join(f.repo, "dirty.txt"));
    const run = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
    });
    await wait(
      () => f.store.runs.get(f.project.id, run.id)?.state === "failed",
    );
    assert.equal(f.store.tasks(f.project.id)[0].status, "failed");
    await assert.rejects(
      f.supervisor.action({
        projectId: "other",
        runId: run.id,
        action: "cancel",
      }),
      /NOT_FOUND/,
    );
  } finally {
    await f.close();
  }
});
test("a policy refusal stops a task run before any run, worktree or process exists", async () => {
  const f = await setup();
  try {
    const gated = [];
    f.supervisor.gate = async (agent) => {
      gated.push(agent);
      throw Error("POLICY_PAID_API_DISABLED");
    };
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
      }),
      /POLICY_PAID_API_DISABLED/,
    );
    assert.deepEqual(gated, ["codex"]);
    assert.equal(f.inputs.length, 0);
    assert.deepEqual(f.store.runs.list(f.project.id, f.task.id), []);
    // The refusal is not sticky: once the rule allows it, the same task starts.
    f.supervisor.gate = async () => {};
    const run = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
    });
    await wait(
      () => f.store.runs.get(f.project.id, run.id)?.state === "awaiting_review",
    );
    // The refused attempt spent nothing; the real run left one ledger row.
    const rows = f.store.usage.recent();
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].role, rows[0].agent, rows[0].runId, rows[0].outcome],
      ["implementer", "codex", run.id, "completed"],
    );
  } finally {
    await f.close();
  }
});

test("reviewer evidence drives a bounded, explicitly started revision of the same worktree", async () => {
  const f = await setup("revise");
  try {
    const first = await completed(f);
    await reviewed(f, first);
    const review = f.inputs.find((i) => i.readOnly);
    assert.match(review.prompt, /VERDICT: <verdict>/);
    const evidence = f.store.runs.reviewEvidence(first.id);
    assert.equal(evidence.verdict, "changes_requested");
    assert.deepEqual(
      evidence.findings.map((x) => [x.path, x.line, x.inDiff]),
      [
        ["result.txt", 1, true],
        ["docs/missing.md", null, false],
      ],
    );

    const second = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
      reviseRunId: first.id,
    });
    await wait(
      () =>
        f.store.runs.get(f.project.id, second.id)?.state === "awaiting_review",
    );
    const revised = f.store.runs.get(f.project.id, second.id);
    const task = f.store.tasks(f.project.id).find((t) => t.id === f.task.id);
    assert.equal(task.status, "completed");
    assert.equal(
      task.awaitingApproval,
      true,
      "a result waiting for approval does not let dependents run",
    );
    assert.equal(revised.previousRunId, first.id);
    assert.equal(revised.worktree, first.worktree, "same isolated worktree");
    assert.equal(revised.base, first.base);
    assert.equal(f.store.runs.get(f.project.id, first.id).state, "rejected");
    const prompt = f.inputs.filter((i) => !i.readOnly).at(-1).prompt;
    assert.match(prompt, /This is a revision/);
    assert.match(prompt, /result\.txt:1 — content must say revised/);
    const diff = f.store.artifacts
      .get(f.project.id, f.task.id, revised.artifactId)
      .diff.toString("utf8");
    assert.match(diff, /\+revised result/);
    assert.doesNotMatch(
      diff,
      /isolated result/,
      "one cumulative diff from base",
    );
    assert.equal(
      existsSync(join(f.repo, "result.txt")),
      false,
      "source untouched",
    );

    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
        reviseRunId: revised.id,
      }),
      /INVALID_REVISION/,
      "no revision before the new result is reviewed",
    );
    await reviewed(f, revised);
    const third = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
      reviseRunId: revised.id,
    });
    await wait(
      () =>
        f.store.runs.get(f.project.id, third.id)?.state === "awaiting_review",
    );
    await reviewed(f, f.store.runs.get(f.project.id, third.id));
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
        reviseRunId: third.id,
      }),
      /REVISION_LIMIT_REACHED/,
    );
    assert.equal(
      f.store.tasks(f.project.id).find((t) => t.id === f.task.id).attempt,
      3,
    );
  } finally {
    await f.close();
  }
});

test("a revision refused by the source check leaves the reviewed worktree intact", async () => {
  const f = await setup("revise");
  try {
    const first = await completed(f);
    await reviewed(f, first);
    writeFileSync(join(f.repo, "dirty.txt"), "local edit");
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
        reviseRunId: first.id,
      }),
      /REPOSITORY_NOT_CLEAN/,
    );
    assert.equal(
      f.store.runs.get(f.project.id, first.id).state,
      "awaiting_review",
    );
    assert.equal(
      await gitText(first.worktree, "rev-parse", "HEAD"),
      first.head,
      "worktree not reset",
    );
    rmSync(join(f.repo, "dirty.txt"));
    const second = await f.supervisor.start({
      projectId: f.project.id,
      taskId: f.task.id,
      consent: true,
      reviseRunId: first.id,
    });
    assert.equal(
      f.store.runs.context(second.id),
      f.store.runs.context(first.id),
      "the frozen context is reused",
    );
    await wait(
      () =>
        f.store.runs.get(f.project.id, second.id)?.state === "awaiting_review",
    );
  } finally {
    await f.close();
  }
});

test("a revision is refused once a dependent task has started", async () => {
  const f = await setup("revise");
  try {
    const first = await completed(f);
    await reviewed(f, first);
    const child = f.store.createTask({
      projectId: f.project.id,
      title: "Builds on the first result",
      implementer: "codex",
      reviewer: "claude",
    });
    f.store.taskAction({
      projectId: f.project.id,
      id: child.id,
      action: "dependencies",
      dependencyIds: [f.task.id],
    });
    f.store.runs.create(
      f.project.id,
      child.id,
      1,
      "codex",
      "claude",
      {
        repository: f.repo,
        path: first.worktree,
        base: first.base,
        head: first.base,
      },
      "",
    );
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
        reviseRunId: first.id,
      }),
      /REVISION_DEPENDENTS_STARTED/,
    );
    assert.equal(
      f.store.runs.get(f.project.id, first.id).state,
      "awaiting_review",
    );
    assert.equal(
      await gitText(first.worktree, "rev-parse", "HEAD"),
      first.head,
      "the reviewed worktree is untouched",
    );
  } finally {
    await f.close();
  }
});

test("a review without a changes-requested verdict cannot start a revision", async () => {
  const f = await setup();
  try {
    const run = await completed(f);
    await reviewed(f, run);
    assert.equal(f.store.runs.reviewEvidence(run.id).verdict, "unknown");
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: f.task.id,
        consent: true,
        reviseRunId: run.id,
      }),
      /INVALID_REVISION/,
    );
    assert.equal(
      f.store.runs.get(f.project.id, run.id).state,
      "awaiting_review",
    );
  } finally {
    await f.close();
  }
});

test("a read-only workflow is refused for an agent without a read-only mode", async () => {
  const f = await setup();
  try {
    const task = f.store.createTask({
      projectId: f.project.id,
      title: "Research with Hermes",
      implementer: "hermes",
      reviewer: "claude",
    });
    await assert.rejects(
      f.supervisor.start({
        projectId: f.project.id,
        taskId: task.id,
        consent: true,
        workflow: "research",
      }),
      /READ_ONLY_MODE_UNSUPPORTED/,
    );
    assert.equal(f.store.runs.list(f.project.id, task.id).length, 0);
  } finally {
    await f.close();
  }
});

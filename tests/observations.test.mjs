import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CliAdapter, claudeLimit } from "../dist/main/cli-provider.js";
import {
  readObservations,
  recordObservation,
} from "../dist/main/observations.js";
import { observedQuota } from "../dist/main/quota.js";

const fixture = resolve("tests/fixtures/native-cli.mjs");
async function run(protocol) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-observe-"));
  const observed = [];
  const activity = [];
  try {
    await new CliAdapter(
      {
        command: process.execPath,
        args: [fixture],
        cwd: dir,
        env: { QA_PROTOCOL: protocol, QA_BEHAVIOR: "stream" },
      },
      protocol,
      (o) => observed.push(o),
    ).run({
      cwd: dir,
      prompt: "test task",
      readOnly: false,
      signal: new AbortController().signal,
      session() {},
      activity: (...a) => activity.push(a),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { observed, activity };
}

test("Antigravity's documented step_update stream becomes live activity and full token usage", async () => {
  const { observed, activity } = await run("antigravity-cli");
  assert.deepEqual(
    activity.filter(([k]) => k === "message").map(([, t]) => t),
    ["Part one, part two."],
    "text_delta fragments are joined and shown once the step is done",
  );
  assert.deepEqual(
    activity.filter(([k]) => k === "tool").map(([, t]) => t),
    ["run_command"],
  );
  assert.deepEqual(observed, [
    { kind: "tokens", input: 10418, output: 589, total: 11007 },
  ]);
});

test("Claude's rate_limit_event is recorded as a limit window, not guessed", async () => {
  const { observed } = await run("claude-cli");
  assert.deepEqual(observed[0], {
    kind: "limit",
    window: "five_hour",
    status: "allowed_warning",
    resetsAt: 4102444800000,
    utilization: 0.82,
  });
  assert.equal(observed[1].kind, "tokens");
  // Missing utilization stays unknown; snake_case and millisecond resets are accepted.
  assert.deepEqual(
    claudeLimit({
      rate_limit_info: {
        status: "allowed",
        resets_at: 4102444800000,
        rate_limit_type: "seven_day",
      },
    }),
    {
      kind: "limit",
      window: "seven_day",
      status: "allowed",
      resetsAt: 4102444800000,
      utilization: null,
    },
  );
  assert.equal(claudeLimit({ rate_limit_info: { status: 3 } }), null);
});

test("observations build an honest quota card: expired windows drop, unknown stays unknown", () => {
  const dir = mkdtempSync(join(tmpdir(), "agenting-observe-"));
  try {
    const now = new Date(2026, 9, 20, 12).getTime();
    recordObservation(
      dir,
      "claude",
      { kind: "tokens", input: 1, output: 2, total: 300 },
      now,
    );
    recordObservation(
      dir,
      "claude",
      { kind: "tokens", input: 1, output: 2, total: 200 },
      now,
    );
    recordObservation(
      dir,
      "claude",
      {
        kind: "limit",
        window: "five_hour",
        status: "allowed_warning",
        resetsAt: now + 3600e3,
        utilization: 0.9,
      },
      now,
    );
    recordObservation(
      dir,
      "claude",
      {
        kind: "limit",
        window: "seven_day",
        status: "allowed",
        resetsAt: now + 86400e3,
        utilization: null,
      },
      now,
    );
    recordObservation(
      dir,
      "claude",
      {
        kind: "limit",
        window: "seven_day_opus",
        status: "rejected",
        resetsAt: now - 1,
        utilization: 1,
      },
      now,
    );
    const observed = readObservations(dir).claude;
    const card = observedQuota(
      "claude",
      "Claude Code",
      observed,
      "max",
      "CLAUDE_USE_OFFICIAL_USAGE",
      now,
    );
    assert.equal(card.plan, "max");
    assert.equal(card.source, "cli-stream");
    assert.equal(
      card.status,
      "warning",
      "the expired rejected window no longer counts",
    );
    assert.deepEqual(
      card.metrics.map((m) => [m.id, m.usedValue, m.limitValue]),
      [
        ["limit-five_hour", 90, 100],
        ["limit-seven_day", null, null],
        ["tokens-today", 500, null],
      ],
    );
    assert.deepEqual(card.usageTrend, [500]);
    assert.equal(card.detail, "CLAUDE_LIMITS_FROM_RUNS");
    const empty = observedQuota(
      "antigravity",
      "Antigravity",
      undefined,
      null,
      "ANTIGRAVITY_USE_OFFICIAL_USAGE",
      now,
    );
    assert.deepEqual(
      [empty.source, empty.detail, empty.metrics.length],
      ["unavailable", "ANTIGRAVITY_USE_OFFICIAL_USAGE", 0],
    );
    assert.ok(
      !readFileSync(join(dir, "provider-observations.json"), "utf8").includes(
        "@",
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

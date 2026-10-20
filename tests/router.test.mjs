import test from "node:test";
import assert from "node:assert/strict";
import { route } from "../dist/main/router.js";

const AGENTS = [
  "codex",
  "claude",
  "opencode",
  "gemini",
  "hermes",
  "local",
  "antigravity",
];
// A healthy subscription agent; scenarios override single facts.
const fact = (agent, over = {}) => ({
  agent,
  configured: true,
  check: "connected",
  quota: "active",
  paid: false,
  policy: "allow",
  successes: 0,
  lastFailed: false,
  ...over,
});
const facts = (over = {}) =>
  AGENTS.map((a) => fact(a, over[a] ?? { configured: false }));
const req = (over = {}) => ({
  mode: "balanced",
  role: "implementer",
  readOnly: false,
  ...over,
});
const rejectedFor = (d, agent) =>
  d.rejected.find((r) => r.agent === agent)?.reasons ?? [];

const scenarios = [
  ["nothing connected → no choice", req(), facts(), null, "NO_ELIGIBLE_AGENT"],
  ["one connected agent is chosen", req(), facts({ codex: {} }), "codex"],
  [
    "missing CLI (not configured) is rejected",
    req(),
    facts({ codex: {}, claude: { configured: false } }),
    "codex",
  ],
  [
    "expired sign-in is rejected",
    req(),
    facts({ codex: { check: "needs-auth" }, claude: {} }),
    "claude",
  ],
  [
    "failing handshake is rejected",
    req(),
    facts({ codex: { check: "unavailable" }, claude: {} }),
    "claude",
  ],
  [
    "unchecked connection loses to a verified one",
    req(),
    facts({ codex: { check: null }, claude: {} }),
    "claude",
  ],
  [
    "unchecked connection is still eligible alone",
    req(),
    facts({ codex: { check: null } }),
    "codex",
  ],
  [
    "reviewer needs read-only mode",
    req({ role: "reviewer", author: "claude" }),
    facts({ hermes: { successes: 5 }, codex: {}, claude: {} }),
    "codex",
  ],
  [
    "author never reviews itself",
    req({ role: "reviewer", author: "codex" }),
    facts({ codex: {}, claude: {} }),
    "claude",
  ],
  [
    "read-only step skips agents without read-only mode",
    req({ readOnly: true }),
    facts({ hermes: { successes: 5 }, gemini: {} }),
    "gemini",
  ],
  [
    "exhausted quota is rejected",
    req(),
    facts({ codex: { quota: "exhausted", successes: 5 }, claude: {} }),
    "claude",
  ],
  [
    "unknown quota scores below an active one",
    req(),
    facts({ codex: { quota: "unknown" }, claude: {} }),
    "claude",
  ],
  [
    "stale quota (unknown) is never treated as available",
    req(),
    facts({ codex: { quota: "unknown" } }),
    "codex",
  ],
  [
    "low quota (429 territory) is avoided when possible",
    req(),
    facts({ codex: { quota: "warning" }, claude: {} }),
    "claude",
  ],
  [
    "policy deny removes the agent",
    req(),
    facts({ codex: { policy: "deny", successes: 5 }, claude: {} }),
    "claude",
  ],
  [
    "needs approval scores lower but stays eligible",
    req(),
    facts({ opencode: { policy: "approve" }, claude: {} }),
    "claude",
  ],
  [
    "subscription-first avoids paid per token",
    req({ mode: "subscription-first" }),
    facts({ opencode: { paid: true, successes: 5 }, claude: { successes: 1 } }),
    "claude",
  ],
  [
    "quality-first prefers proven runs even when paid",
    req({ mode: "quality-first" }),
    facts({ opencode: { paid: true, successes: 5 }, claude: { successes: 1 } }),
    "opencode",
  ],
  [
    "balanced weighs proof against cost",
    req(),
    facts({ opencode: { paid: true, successes: 5 }, claude: { successes: 1 } }),
    "opencode",
  ],
  [
    "a recent failure lowers the score",
    req(),
    facts({ codex: { lastFailed: true }, claude: {} }),
    "claude",
  ],
  [
    "ties break by the fixed agent order",
    req(),
    facts({ claude: {}, codex: {} }),
    "codex",
  ],
  [
    "proof caps at five runs",
    req(),
    facts({
      codex: { successes: 50, quota: "unknown" },
      claude: { successes: 5 },
    }),
    "claude",
  ],
  [
    "manual mode keeps an eligible choice",
    req({ mode: "manual", preferred: "claude" }),
    facts({ codex: { successes: 5 }, claude: {} }),
    "claude",
    "MANUAL_CHOICE",
  ],
  [
    "manual mode refuses an ineligible choice",
    req({ mode: "manual", preferred: "claude" }),
    facts({ codex: {}, claude: { check: "needs-auth" } }),
    null,
    "MANUAL_CHOICE_REJECTED",
  ],
  [
    "manual mode without a choice asks for one",
    req({ mode: "manual" }),
    facts({ codex: {} }),
    null,
    "MANUAL_CHOICE_REQUIRED",
  ],
];

for (const [name, request, f, choice, reason] of scenarios)
  test(`router: ${name}`, () => {
    const d = route(request, f);
    assert.equal(d.choice, choice);
    if (reason) assert.equal(d.reason, reason);
    // Every agent is accounted for exactly once, with reasons.
    assert.equal(d.ranked.length + d.rejected.length, AGENTS.length);
    for (const r of d.rejected) assert.ok(r.reasons.length);
    for (const r of d.ranked)
      assert.ok(r.reasons.every((x) => /^[+-]\d+ [A-Z_0-9]+$/.test(x)));
  });

test("router: identical facts always give the identical decision", () => {
  const f = facts({
    codex: { successes: 2 },
    claude: { successes: 2 },
    gemini: { quota: "unknown" },
  });
  const a = route(req(), f),
    b = route(req(), [...f].reverse());
  assert.deepEqual(a, b);
});

test("router: rejection reasons are explicit and combined", () => {
  const d = route(
    req({ role: "reviewer", author: "antigravity" }),
    facts({
      antigravity: { check: "needs-auth", quota: "exhausted", policy: "deny" },
    }),
  );
  assert.deepEqual(rejectedFor(d, "antigravity"), [
    "SIGN_IN_REQUIRED",
    "NO_READ_ONLY_MODE",
    "SAME_AS_AUTHOR",
    "QUOTA_EXHAUSTED",
    "POLICY_DENIED",
  ]);
  assert.deepEqual(rejectedFor(d, "hermes"), ["NOT_CONFIGURED"]);
});

test("policy reasons explain a refusal and an approval requirement", () => {
  const denied = route(
    req(),
    facts({
      codex: {},
      opencode: {
        paid: true,
        policy: "deny",
        policyReasons: ["POLICY_BUDGET_EXCEEDED"],
      },
    }),
  );
  assert.deepEqual(rejectedFor(denied, "opencode"), [
    "POLICY_DENIED",
    "POLICY_BUDGET_EXCEEDED",
  ]);
  const asks = route(
    req({ mode: "quality-first" }),
    facts({
      opencode: {
        paid: true,
        policy: "approve",
        policyReasons: ["POLICY_APPROVAL_REQUIRED", "POLICY_SPEND_UNKNOWN"],
      },
    }),
  );
  const ranked = asks.ranked.find((r) => r.agent === "opencode");
  assert.ok(ranked.reasons.includes("-1 NEEDS_APPROVAL"));
  assert.ok(ranked.reasons.includes("0 POLICY_SPEND_UNKNOWN"));
  assert.ok(
    !ranked.reasons.some((r) => r.endsWith(" POLICY_APPROVAL_REQUIRED")),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync,
  symlinkSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { LimitBridge } from "../dist/main/limit-bridge.js";
import {
  antigravityLimitMetrics,
  claudeLimitMetrics,
  openRouterQuota,
  scanAllQuotas,
} from "../dist/main/quota.js";

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "agenting-bridge-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"),
    data = join(root, "data");
  mkdirSync(home, { recursive: true });
  const bridge = new LimitBridge(data, process.execPath, {}, home);
  return { root, home, data, bridge };
}
const claudeSettings = (home) => join(home, ".claude", "settings.json");
const relay = (data, agent, input) =>
  spawnSync(
    process.execPath,
    [join(data, "limit-bridge", "relay.mjs"), agent],
    { input: JSON.stringify(input), encoding: "utf8", timeout: 10000 },
  );

test("linking needs consent and keeps every other setting", (t) => {
  const { home, bridge } = setup(t);
  mkdirSync(join(home, ".claude"));
  writeFileSync(
    claudeSettings(home),
    JSON.stringify({ model: "opus", permissions: { allow: ["Bash(ls)"] } }),
  );
  assert.throws(() => bridge.install({ agent: "claude" }), /CONSENT/);
  assert.throws(
    () => bridge.install({ agent: "codex", consent: true }),
    /INVALID_INPUT/,
  );
  const status = bridge.install({ agent: "claude", consent: true });
  assert.equal(status.installed, true);
  const settings = JSON.parse(readFileSync(claudeSettings(home), "utf8"));
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
  assert.equal(settings.statusLine.type, "command");
  assert.equal(settings.statusLine.command, status.command);
  assert.equal(
    bridge.install({ agent: "claude", consent: true }).installed,
    true,
    "linking twice is a no-op",
  );
  bridge.remove({ agent: "claude" });
  assert.deepEqual(JSON.parse(readFileSync(claudeSettings(home), "utf8")), {
    model: "opus",
    permissions: { allow: ["Bash(ls)"] },
  });
});

test("a user's own status line is chained and restored exactly", (t) => {
  const { home, data, bridge } = setup(t);
  mkdirSync(join(home, ".claude"));
  const mine = { type: "command", command: "echo mine", padding: 1 };
  writeFileSync(claudeSettings(home), JSON.stringify({ statusLine: mine }));
  const status = bridge.install({ agent: "claude", consent: true });
  assert.equal(status.previous, "echo mine");
  const linked = JSON.parse(readFileSync(claudeSettings(home), "utf8"));
  assert.equal(linked.statusLine.padding, 1, "the user's padding is kept");
  if (process.platform !== "win32") {
    const out = relay(data, "claude", { rate_limits: {} });
    assert.equal(
      out.stdout.trim(),
      "mine",
      "the previous command still renders",
    );
  }
  bridge.remove({ agent: "claude" });
  assert.deepEqual(
    JSON.parse(readFileSync(claudeSettings(home), "utf8")).statusLine,
    mine,
  );
});

test("an unreadable settings file is never overwritten", (t) => {
  const { home, bridge } = setup(t);
  mkdirSync(join(home, ".claude"));
  writeFileSync(claudeSettings(home), "{ not json");
  assert.throws(
    () => bridge.install({ agent: "claude", consent: true }),
    /BRIDGE_SETTINGS_UNREADABLE/,
  );
  assert.equal(readFileSync(claudeSettings(home), "utf8"), "{ not json");
  assert.equal(bridge.status("claude").readable, false);
});

test("the relay keeps only quota numbers from Claude Code's status line", (t) => {
  const { data, bridge } = setup(t);
  bridge.install({ agent: "claude", consent: true });
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const out = relay(data, "claude", {
    session_id: "secret-session",
    transcript_path: "/home/me/.claude/projects/x.jsonl",
    workspace: { current_dir: "/home/me/private" },
    rate_limits: {
      five_hour: { used_percentage: 23.5, resets_at: reset },
      seven_day: { used_percentage: 41.2, resets_at: reset + 86400 },
    },
  });
  assert.equal(out.status, 0);
  assert.equal(out.stdout, "5h 24% · 7d 41%");
  const stored = readFileSync(
    join(data, "limit-bridge", "claude-limits.json"),
    "utf8",
  );
  assert.doesNotMatch(stored, /secret-session|private|transcript/);
  const reading = bridge.readings().claude;
  assert.equal(reading.windows.five_hour.usedPercent, 23.5);
  assert.equal(reading.windows.five_hour.resetsAt, reset * 1000);
  // A render without limits (start of a session) keeps the last reading.
  relay(data, "claude", { model: { display_name: "Opus" } });
  assert.ok(bridge.readings().claude.windows.seven_day);
});

test("the relay keeps Antigravity's quota pools and plan, never the e-mail", (t) => {
  const { home, data, bridge } = setup(t);
  const status = bridge.install({ agent: "antigravity", consent: true });
  const settings = JSON.parse(
    readFileSync(
      join(home, ".gemini", "antigravity-cli", "settings.json"),
      "utf8",
    ),
  );
  assert.equal(settings.statusLine.stack_with_default, true);
  assert.equal(settings.statusLine.command, status.command);
  const out = relay(data, "antigravity", {
    email: "developer@email.com",
    plan_tier: "Pro",
    quota: {
      "gemini-weekly": {
        remaining_fraction: 0.9378,
        reset_time: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /gemini-weekly 94% left/);
  assert.doesNotMatch(
    readFileSync(join(data, "limit-bridge", "antigravity-limits.json"), "utf8"),
    /email/,
  );
  const reading = bridge.readings().antigravity;
  assert.equal(reading.plan, "Pro");
  const [pool] = antigravityLimitMetrics(reading);
  assert.equal(pool.label, "Gemini · weekly");
  assert.equal(pool.remainingPercent, 93.8);
  bridge.remove({ agent: "antigravity" });
  assert.equal(bridge.readings().antigravity, undefined);
  assert.equal(
    existsSync(join(data, "limit-bridge", "antigravity-limits.json")),
    false,
  );
});

test("malformed readings are ignored and expired windows are dropped", (t) => {
  const { data, bridge } = setup(t);
  mkdirSync(join(data, "limit-bridge"), { recursive: true });
  writeFileSync(
    join(data, "limit-bridge", "claude-limits.json"),
    JSON.stringify({
      at: Date.now(),
      windows: {
        five_hour: { usedPercent: "lots", resetsAt: 1 },
        "bad id!": { usedPercent: 1, resetsAt: 1 },
        seven_day: { usedPercent: 50, resetsAt: Date.now() - 1000 },
      },
    }),
  );
  const reading = bridge.readings().claude;
  assert.deepEqual(Object.keys(reading.windows), ["seven_day"]);
  assert.deepEqual(
    claudeLimitMetrics(reading),
    [],
    "an expired window is gone",
  );
});

test("OpenRouter shows the account balance and the key's spend windows", () => {
  const card = openRouterQuota(
    {
      data: {
        usage: 30,
        limit: null,
        usage_daily: 1.5,
        usage_weekly: 4,
        usage_monthly: 12,
      },
    },
    { data: { total_credits: 50, total_usage: 37.6 } },
  );
  assert.equal(card.balanceUsd, 12.4);
  assert.equal(card.metrics[0].id, "balance");
  assert.equal(card.metrics[0].limitValue, 50);
  assert.deepEqual(
    card.metrics.map((m) => m.id),
    ["balance", "today", "week", "month"],
  );
  assert.equal(card.detail, "OPENROUTER_ACCOUNT_BALANCE");
  const keyOnly = openRouterQuota({ data: { usage: 3 } }, null);
  assert.equal(keyOnly.balanceUsd, null);
  assert.equal(keyOnly.detail, "API_KEY_BUDGET_NOT_ACCOUNT_BALANCE");
});

test("cards use status line limits and OpenRouter billing when available", async (t) => {
  const { data } = setup(t);
  const reset = Date.now() + 3600000;
  const cards = await scanAllQuotas(data, {
    openrouter: async () =>
      openRouterQuota(
        { data: { usage: 1 } },
        { data: { total_credits: 10, total_usage: 2 } },
      ),
    statusLines: () => ({
      claude: {
        at: Date.now(),
        windows: {
          five_hour: { usedPercent: 92, resetsAt: reset },
          seven_day: { usedPercent: 40, resetsAt: reset },
        },
      },
    }),
    viaOpenRouter: () => ["opencode"],
    claudePlan: async () => "max",
  });
  const claude = cards.find((c) => c.id === "claude");
  assert.equal(claude.source, "cli-statusline");
  assert.equal(claude.status, "warning");
  assert.equal(claude.plan, "max");
  assert.equal(claude.metrics[0].label, "Session · 5 h");
  const opencode = cards.find((c) => c.id === "opencode");
  assert.equal(opencode.via, "openrouter");
  assert.equal(opencode.balanceUsd, 8);
  assert.equal(cards.find((c) => c.id === "hermes").source, "unavailable");
});

test("an OpenRouter management key reads the balance and never reaches OpenCode", async (t) => {
  const { data } = setup(t);
  const { OpenRouterConnection } = await import("../dist/main/openrouter.js");
  const secrets = {
    available: () => true,
    encrypt: (s) => Buffer.from(`enc:${s}`),
    decrypt: (b) => b.toString().slice(4),
  };
  const calls = [];
  const router = new OpenRouterConnection(data, secrets, async (path, key) => {
    calls.push([path, key]);
    if (path === "/credits" && key !== "sk-or-mgmt-abcdefghijklmnopq")
      throw Error("OPENROUTER_UNAVAILABLE");
    return { data: { total_credits: 5, total_usage: 1 } };
  });
  const inference = "sk-or-run-abcdefghijklmnopqrs";
  router.save({ apiKey: inference, model: "org/model", consent: true });
  assert.equal(await router.credits(), null, "an inference key may be refused");
  router.save({
    managementKey: "sk-or-mgmt-abcdefghijklmnopq",
    model: "org/model",
    consent: true,
  });
  assert.equal(router.settings().balanceKey, true);
  assert.equal((await router.credits()).data.total_credits, 5);
  assert.equal(router.environment().OPENROUTER_API_KEY, inference);
  assert.doesNotMatch(JSON.stringify(router.environment()), /mgmt/);
  router.save({ managementKey: "", model: "org/model:free", consent: true });
  assert.equal(router.settings().balanceKey, false);
  assert.equal(router.freeModel(), true);
});

test("linking keeps the settings file's permissions and enables a suspended line", (t) => {
  const { home, data, bridge } = setup(t);
  const dir = join(home, ".gemini", "antigravity-cli");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "settings.json");
  const mine = { type: "command", command: "echo mine", enabled: false };
  writeFileSync(path, JSON.stringify({ statusLine: mine }), { mode: 0o600 });
  bridge.install({ agent: "antigravity", consent: true });
  const linked = JSON.parse(readFileSync(path, "utf8")).statusLine;
  assert.equal(linked.enabled, undefined, "the link is not suspended");
  if (process.platform !== "win32") {
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const out = relay(data, "antigravity", {});
    assert.equal(out.stdout, "", "a suspended line of the user is not run");
  }
  bridge.remove({ agent: "antigravity" });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).statusLine, mine);
  if (process.platform !== "win32")
    assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("Hermes with its own OpenRouter key shows the balance for reference only", async (t) => {
  const { data } = setup(t);
  const cards = await scanAllQuotas(data, {
    openrouter: async () =>
      openRouterQuota(
        { data: { usage: 1 } },
        { data: { total_credits: 0, total_usage: 0 } },
      ),
    viaOpenRouter: () => ["opencode"],
    ownOpenRouterKey: () => ["hermes"],
  });
  const hermes = cards.find((c) => c.id === "hermes");
  assert.equal(hermes.detail, "OWN_OPENROUTER_KEY");
  assert.equal(
    hermes.status,
    "active",
    "another account's balance never marks Hermes exhausted",
  );
  assert.equal(
    cards.find((c) => c.id === "opencode").detail,
    "BILLED_VIA_OPENROUTER",
  );
});

test("a symlinked settings file is updated at its target and stays a link", (t) => {
  if (process.platform === "win32") return;
  const { home, root, bridge } = setup(t);
  const dotfiles = join(root, "dotfiles");
  mkdirSync(dotfiles);
  writeFileSync(
    join(dotfiles, "claude.json"),
    JSON.stringify({ model: "opus" }),
  );
  mkdirSync(join(home, ".claude"));
  symlinkSync(join(dotfiles, "claude.json"), claudeSettings(home));
  bridge.install({ agent: "claude", consent: true });
  assert.ok(lstatSync(claudeSettings(home)).isSymbolicLink());
  assert.ok(
    JSON.parse(readFileSync(join(dotfiles, "claude.json"), "utf8")).statusLine,
  );
  bridge.remove({ agent: "claude" });
  assert.ok(lstatSync(claudeSettings(home)).isSymbolicLink());
  assert.deepEqual(
    JSON.parse(readFileSync(join(dotfiles, "claude.json"), "utf8")),
    { model: "opus" },
  );
});

test("an empty account balance alone never marks OpenRouter exhausted", () => {
  const card = openRouterQuota(
    { data: { usage: 2, limit: 10, limit_remaining: 8 } },
    { data: { total_credits: 5, total_usage: 5 } },
  );
  assert.equal(card.balanceUsd, 0);
  assert.equal(card.status, "active", "the key itself still has budget");
  const spent = openRouterQuota(
    { data: { usage: 10, limit: 10, limit_remaining: 0 } },
    { data: { total_credits: 50, total_usage: 1 } },
  );
  assert.equal(spent.status, "exhausted", "the key's own limit binds");
});

test("one empty Antigravity pool warns; all empty pools exhaust", async (t) => {
  const { data } = setup(t);
  const reset = Date.now() + 3600000;
  const scan = (buckets) =>
    scanAllQuotas(data, {
      statusLines: () => ({
        antigravity: { at: Date.now(), plan: null, buckets },
      }),
    }).then((cards) => cards.find((c) => c.id === "antigravity"));
  const one = await scan({
    "gemini-pro": { remainingFraction: 0, resetsAt: reset },
    "claude-sonnet": { remainingFraction: 0.6, resetsAt: reset },
  });
  assert.equal(one.status, "warning", "another pool may still serve the run");
  const all = await scan({
    "gemini-pro": { remainingFraction: 0, resetsAt: reset },
    "claude-sonnet": { remainingFraction: 0, resetsAt: reset },
  });
  assert.equal(all.status, "exhausted");
});

test("the Windows command runs the relay through PowerShell", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agenting-bridge-win-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bridge = new LimitBridge(
    "C:\\Users\\Jo Doe\\AppData\\Agenting",
    "C:\\Program Files\\Agenting\\Agenting.exe",
    {},
    root,
    "win32",
  );
  assert.equal(
    bridge.command("claude"),
    'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:/Users/Jo Doe/AppData/Agenting/limit-bridge/relay.ps1" claude',
  );
});

test("a previous command that leaves a process behind cannot hang the relay", (t) => {
  if (process.platform === "win32") return;
  const { home, data, bridge } = setup(t);
  mkdirSync(join(home, ".claude"));
  writeFileSync(
    claudeSettings(home),
    JSON.stringify({
      statusLine: { type: "command", command: "echo early; sleep 30" },
    }),
  );
  bridge.install({ agent: "claude", consent: true });
  const started = Date.now();
  const out = relay(data, "claude", { rate_limits: {} });
  assert.ok(Date.now() - started < 8000, "the three-second cap holds");
  assert.equal(out.stdout.trim(), "early");
});

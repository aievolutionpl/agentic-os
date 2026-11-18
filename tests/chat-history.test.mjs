import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Compile the real renderer helper (not a copy).
const dir = resolve(".tmp-test");
mkdirSync(dir, { recursive: true });
const out = join(dir, "chat-history.cjs");
writeFileSync(
  out,
  buildSync({
    entryPoints: ["src/renderer/chat-history.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    logLevel: "silent",
  }).outputFiles[0].text,
);
const h = await import(pathToFileURL(out).href);

const chat = (over = {}) => ({
  id: "c1",
  title: "Plan wdrożenia",
  projectId: "p",
  agent: "codex",
  mode: "chat",
  source: "default",
  root: "/r",
  workspace: "/r",
  status: "idle",
  messages: [],
  contextIds: [],
  skillIds: [],
  activity: [],
  error: null,
  updatedAt: 0,
  ...over,
});

test("search matches titles without a snippet and message bodies with one, ignoring diacritics", () => {
  const c = chat({
    messages: [
      { id: "m", role: "assistant", content: "Najpierw uruchom migrację bazy, potem zrestartuj serwer.", at: 0, status: "complete" },
    ],
  });
  assert.deepEqual(h.matchChat(c, ""), { hit: true });
  assert.deepEqual(h.matchChat(c, "wdrozenia"), { hit: true });
  const body = h.matchChat(c, "migracje");
  assert.equal(body.hit, true);
  assert.match(body.snippet, /migrację bazy/);
  assert.equal(h.matchChat(c, "plan migrację").hit, true, "terms may span title and body");
  assert.equal(h.matchChat(c, "kubernetes").hit, false);
  assert.equal(h.matchChat(c, "codex", "Codex").hit, true);
});

test("long message hits are trimmed with ellipses", () => {
  const content = `${"a ".repeat(100)}needle${" b".repeat(100)}`;
  const { snippet } = h.matchChat(chat({ messages: [{ id: "m", role: "user", content, at: 0, status: "complete" }] }), "needle");
  assert.ok(snippet.startsWith("…") && snippet.endsWith("…"));
  assert.ok(snippet.length < 120);
});

test("history groups pinned first, then recency buckets, newest first", () => {
  const now = new Date("2026-11-18T15:00:00").getTime(),
    DAY = 86_400_000;
  const groups = h.groupChats(
    [
      chat({ id: "old", updatedAt: now - 90 * DAY }),
      chat({ id: "today-1", updatedAt: now - 1000 }),
      chat({ id: "pin", updatedAt: now - 60 * DAY, pinned: true }),
      chat({ id: "today-2", updatedAt: now - 10 }),
      chat({ id: "yday", updatedAt: now - DAY }),
      chat({ id: "week", updatedAt: now - 4 * DAY }),
      chat({ id: "month", updatedAt: now - 20 * DAY }),
    ],
    now,
    false,
  );
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((c) => c.id)]),
    [
      ["pinned", ["pin"]],
      ["today", ["today-2", "today-1"]],
      ["yesterday", ["yday"]],
      ["week", ["week"]],
      ["month", ["month"]],
      ["older", ["old"]],
    ],
  );
  assert.equal(h.groupChats([chat({ updatedAt: now })], now, true)[0].label, "Dziś");
});

test("templates never discard a draft and stored templates are validated", () => {
  assert.equal(h.insertTemplate("", "T"), "T");
  assert.equal(h.insertTemplate("my notes  ", "T"), "T\n\nmy notes");
  assert.equal(h.insertTemplate("T\n\nmy notes", "T"), "T\n\nmy notes");
  assert.equal(h.insertTemplate("x".repeat(11_995), "Template"), null, "over the send limit");
  assert.equal(h.insertTemplate("", "y".repeat(12_000)).length, 12_000);
  assert.deepEqual(h.parseTemplates("not json"), []);
  assert.deepEqual(h.parseTemplates('{"a":1}'), []);
  assert.deepEqual(
    h.parseTemplates(JSON.stringify([{ name: " A ", prompt: "x" }, { name: "", prompt: "y" }, { name: "B" }, null])),
    [{ name: "A", prompt: "x" }],
  );
  let list = h.upsertTemplate([], "Review", "one");
  list = h.upsertTemplate(list, "Other", "two");
  list = h.upsertTemplate(list, "review", "three");
  assert.deepEqual(list.map((t) => [t.name, t.prompt]), [["review", "three"], ["Other", "two"]]);
  assert.equal(h.upsertTemplate(list, "  ", "x"), list);
  for (let i = 0; i < 30; i++) list = h.upsertTemplate(list, `t${i}`, "p");
  assert.equal(list.length, h.TEMPLATE_LIMIT);
});

test("stats count messages, words and an approximate token figure", () => {
  const s = h.chatStats(chat({ messages: [
    { id: "a", role: "user", content: "one two three", at: 0, status: "complete" },
    { id: "b", role: "assistant", content: "four", at: 0, status: "complete" },
  ] }));
  assert.deepEqual(s, { messages: 2, words: 4, tokens: 4 });
});

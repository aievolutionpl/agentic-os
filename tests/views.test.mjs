import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contrast } from "../scripts/contrast-math.mjs";
import { THEMES } from "../dist/shared.js";

// Compile the real router and theme catalog (not copies).
const dir = resolve(".tmp-test");
mkdirSync(dir, { recursive: true });
async function load(entry, name) {
  const out = join(dir, name);
  const built = buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    external: ["react", "react-dom", "lucide-react"],
    loader: { ".png": "empty", ".svg": "empty", ".css": "empty", ".ttf": "empty" },
    write: false,
    logLevel: "silent",
  });
  writeFileSync(out, built.outputFiles[0].text);
  return import(pathToFileURL(out).href);
}
const views = await load("src/renderer/views.ts", "views.cjs");
const { THEME_CHOICES } = await load("src/renderer/theme-catalog.ts", "theme-catalog.cjs");
const ALL = ["center", "project", "quota", "connections", "chat", "skills", "schedule", "plugins", "shared-memory", "harness", "inbox", "terminal"];

test("every screen has one label per language; only the project view is named by its project", () => {
  for (const language of ["pl", "en"])
    for (const view of ALL) {
      const label = views.viewLabel(view, language);
      if (view === "project") assert.equal(label, null);
      else assert.ok(label && label.trim(), `${view} ${language}`);
    }
  assert.equal(views.viewLabel("inbox", "pl"), "Praca i pytania");
  assert.equal(views.viewLabel("center", "en"), "Control Center");
});

test("Alt shortcuts are unique digits and point at real screens", () => {
  const keys = Object.values(views.VIEW_SHORTCUTS);
  assert.equal(new Set(keys).size, keys.length);
  for (const [view, key] of Object.entries(views.VIEW_SHORTCUTS)) {
    assert.ok(ALL.includes(view), view);
    assert.match(key, /^\d$/);
  }
  for (const view of views.SECONDARY_VIEWS) assert.ok(ALL.includes(view));
});

test("back history skips repeats, never records a no-op and stays bounded", () => {
  let stack = [];
  stack = views.pushHistory(stack, "chat", "chat");
  assert.deepEqual(stack, []);
  stack = views.pushHistory(stack, "chat", "terminal");
  stack = views.pushHistory(stack, "terminal", "plugins");
  assert.deepEqual(stack, ["chat", "terminal"]);
  assert.deepEqual(views.pushHistory(["chat"], "chat", "quota"), ["chat"]);
  for (let i = 0; i < 100; i++) stack = views.pushHistory(stack, i % 2 ? "chat" : "quota", i % 2 ? "quota" : "chat");
  assert.equal(stack.length, 30);
});

test("theme picker lists every persisted palette exactly once, including Matrix Terminal", () => {
  assert.deepEqual(THEME_CHOICES.map((choice) => choice.value).sort(), [...THEMES].sort());
  assert.equal(THEME_CHOICES.find((choice) => choice.value === "matrix")?.label, "Matrix Terminal");
  const css = readdirSync("src/renderer").filter((file) => file.endsWith(".css")).map((file) => readFileSync(join("src/renderer", file), "utf8")).join("\n");
  for (const theme of THEMES) assert.ok(css.includes(`html[data-theme="${theme}"] {`), theme);
  assert.match(readFileSync("src/renderer/TerminalPanel.tsx", "utf8"), /\n {2}matrix: \{background:/);
});

test("Matrix Terminal tokens meet WCAG AA for text, navigation and the primary action", () => {
  const block = readFileSync("src/renderer/matrix.css", "utf8").match(/html\[data-theme="matrix"\] \{([^}]*)\}/)[1];
  const token = (name) => {
    const hex = block.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, "i"))[1];
    return [...hex.slice(1).match(/../g).map((part) => parseInt(part, 16)), 1];
  };
  const pairs = [["text", "bg"], ["text", "surface"], ["text-muted", "bg"], ["text-muted", "surface"], ["text-muted", "surface-hover"], ["text-faint", "surface"], ["accent", "surface"], ["accent-fg", "accent"], ["accent-fg", "accent-hover"], ["nav-text", "nav-end"], ["nav-muted", "nav-end"], ["memory-accent", "surface"], ["planning-accent", "surface"], ["creative-accent", "surface"], ["danger", "surface"], ["warning", "surface"]];
  for (const [fg, bg] of pairs) assert.ok(contrast(token(fg), token(bg)) >= 4.5, `${fg} on ${bg}`);
});

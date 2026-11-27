import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Compile the real component (not a copy).
const dir = resolve(".tmp-test");
mkdirSync(dir, { recursive: true });
const out = join(dir, "chat-message-view.cjs");
const built = buildSync({
  entryPoints: ["src/renderer/ChatMessageView.tsx"],
  bundle: true,
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react-dom"],
  loader: { ".svg": "text", ".png": "dataurl", ".css": "empty" },
  write: false,
  logLevel: "silent",
});
writeFileSync(out, built.outputFiles[0].text);
const { ChatMessageView, sameMessageProps } = await import(pathToFileURL(out).href);

const message = (over = {}) => ({
  id: "m1",
  role: "assistant",
  content: "Gotowe **plan**.",
  at: Date.UTC(2026, 10, 27, 12, 0),
  status: "complete",
  ...over,
});
const onAction = () => {};
const props = (over = {}) => ({ message: message(), agent: "codex", language: "pl", onAction, ...over });

test("unchanged message data counts as equal even with a new object", () => {
  assert.equal(sameMessageProps(props(), props({ message: message() })), true);
  assert.equal(
    sameMessageProps(
      props({ message: message({ attachments: [{ name: "a.txt", bytes: 3 }] }) }),
      props({ message: message({ attachments: [{ name: "a.txt", bytes: 3 }] }) }),
    ),
    true,
  );
});

test("any visible change re-renders the message", () => {
  const base = props();
  for (const changed of [
    props({ message: message({ content: "Inna treść" }) }),
    props({ message: message({ status: "streaming" }) }),
    props({ message: message({ attachments: [{ name: "b.txt", bytes: 1 }] }) }),
    props({ agent: "claude" }),
    props({ language: "en" }),
    props({ onAction: () => {} }),
  ])
    assert.equal(sameMessageProps(base, changed), false);
});

test("a completed assistant reply renders its text and all four actions", () => {
  const html = renderToStaticMarkup(React.createElement(ChatMessageView, props()));
  assert.match(html, /<strong>plan<\/strong>/);
  for (const label of ["Zapamiętaj", "Utwórz zadanie", "Druga opinia", "Kopiuj"])
    assert.ok(html.includes(label), label);
});

test("a streaming reply shows progress and no actions", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatMessageView, props({ message: message({ content: "", status: "streaming" }), language: "en" })),
  );
  assert.ok(html.includes("Agent is working"));
  assert.ok(!html.includes("message-actions"));
});

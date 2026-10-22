import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Compile the real component (not a copy) so the test fails if it stops
// rendering a headline, a next step or the raw code behind a disclosure.
const dir = resolve(".tmp-test");
mkdirSync(dir, { recursive: true });
const out = join(dir, "error-note.cjs");
const built = buildSync({
  entryPoints: ["src/renderer/ErrorNote.tsx"],
  bundle: true,
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react-dom"],
  write: false,
  logLevel: "silent",
});
writeFileSync(out, built.outputFiles[0].text);
const { ErrorNote } = await import(pathToFileURL(out).href);

test("renders a headline, a next step and the raw code in a disclosure", () => {
  const html = renderToStaticMarkup(
    React.createElement(ErrorNote, {
      value: "Error: PROVIDER_NOT_CONFIGURED",
      pl: true,
    }),
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Agent nie jest podłączony/);
  assert.match(html, /Połączenia/);
  assert.match(html, /<details/);
  assert.match(html, /PROVIDER_NOT_CONFIGURED/);
  assert.match(html, /Szczegóły techniczne/);
});

test("renders English copy and a neutral headline for unknown codes", () => {
  const html = renderToStaticMarkup(
    React.createElement(ErrorNote, {
      value: "SOMETHING_NEW_FAILED",
      pl: false,
    }),
  );
  assert.match(html, /The operation failed/);
  assert.match(html, /Technical details/);
  assert.match(html, /SOMETHING_NEW_FAILED/);
  assert.doesNotMatch(html, /UNKNOWN<\/code>/, "raw code must be shown, not the sentinel");
});

test("keeps an optional action next to the message", () => {
  const html = renderToStaticMarkup(
    React.createElement(ErrorNote, {
      value: "POLICY_APPROVAL_REQUIRED",
      pl: true,
      action: React.createElement("button", null, "Zatwierdź"),
    }),
  );
  assert.match(html, /error-note-action/);
  assert.match(html, /Zatwierdź/);
});

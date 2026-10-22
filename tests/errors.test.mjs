import { test } from "node:test";
import assert from "node:assert/strict";
import { explainError } from "../dist/shared.js";

test("explains a known code with a headline and a next step", () => {
  const pl = explainError("PROVIDER_NOT_CONFIGURED", true);
  assert.equal(pl.code, "PROVIDER_NOT_CONFIGURED");
  assert.equal(pl.title, "Agent nie jest podłączony");
  assert.match(pl.hint, /Połączenia/);

  const en = explainError("PROVIDER_NOT_CONFIGURED", false);
  assert.equal(en.code, "PROVIDER_NOT_CONFIGURED");
  assert.match(en.hint, /Connections/);
});

test("finds the code inside a wrapped error message and keeps the raw text", () => {
  const value = "Error: RUN_CANCELLED — stopped by the operator";
  const result = explainError(value, false);
  assert.equal(result.code, "RUN_CANCELLED");
  assert.equal(result.raw, value);
  assert.match(result.title, /cancelled/i);
});

test("prefers the longest matching code", () => {
  // TERMINAL_LIMIT must win over any shorter code that is a substring of it.
  const result = explainError("TERMINAL_LIMIT", true);
  assert.equal(result.code, "TERMINAL_LIMIT");
  assert.match(result.hint, /sesje/i);
});

test("falls back to a generic explanation for unknown codes", () => {
  const result = explainError("SOMETHING_NEW_FAILED", true);
  assert.equal(result.code, "UNKNOWN");
  assert.equal(result.title, "Operacja nie powiodła się");
  assert.equal(result.raw, "SOMETHING_NEW_FAILED");
  assert.match(result.hint, /Szczegóły|spróbuj/i);
});

test("never returns an empty headline for an empty value", () => {
  const result = explainError("", false);
  assert.equal(result.code, "UNKNOWN");
  assert.ok(result.title.length > 0);
  assert.ok(result.hint.length > 0);
});

test("every catalog entry has distinct Polish and English copy", () => {
  const codes = [
    "PROVIDER_NOT_CONFIGURED",
    "POLICY_APPROVAL_REQUIRED",
    "BUDGET_EXCEEDED",
    "STOP_UNCONFIRMED",
    "WORKTREE_CHANGED",
    "INVALID_INPUT",
  ];
  for (const code of codes) {
    const pl = explainError(code, true);
    const en = explainError(code, false);
    assert.equal(pl.code, code);
    assert.notEqual(pl.title, en.title, `${code} title should be localized`);
    assert.notEqual(pl.hint, en.hint, `${code} hint should be localized`);
    assert.ok(!pl.title.includes(code), `${code} title must not be a raw code`);
  }
});

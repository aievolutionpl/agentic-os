import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedSender } from "../dist/main/security.js";
test("only exact local main frame gets app IPC", () => {
  const local = "file:///app/dist/renderer/index.html";
  assert.equal(trustedSender(local, true, local), true);
  for (const [url, main] of [
    ["https://evil.test", true],
    [local, false],
    [local + "?redirect=evil", true],
    ["file:///other/index.html", true],
    [undefined, true],
  ])
    assert.equal(trustedSender(url, main, local), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { Terminals } from "../dist/main/terminals.js";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "agenting-terminal-test-"));
  const project = join(dir, "project with spaces");
  mkdirSync(project);
  const terminals = new Terminals(dir, (id) => {
    if (id !== "project") throw Error("unknown project");
    return project;
  });
  t.after(async () => {
    await terminals.dispose();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return { terminals, project };
}
const open = (extra = {}) => ({ consent: true, cols: 100, rows: 24, ...extra });
test("native terminal startup failure leaves no phantom session and permits a later retry", async (t) => {
  const { terminals } = setup(t);
  const pty = createRequire(import.meta.url)("node-pty");
  const failedSpawn = t.mock.method(pty, "spawn", () => {
    throw Error("native startup failure");
  });
  assert.throws(() => terminals.open(open()), /TERMINAL_START_FAILED/);
  assert.deepEqual(terminals.list(), []);
  failedSpawn.mock.restore();
  const session = terminals.open(open());
  assert.equal(session.state, "running");
});
async function until(terminals, id, predicate, initial = 0) {
  let cursor = initial,
    output = "",
    reset = false;
  // A cold Windows runner can take well over 5 s before PowerShell reads
  // its first input under ConPTY; give the real shell up to a minute.
  for (let n = 0; n < 2400; n++) {
    const result = terminals.read({ id, cursor });
    cursor = result.cursor;
    output += result.data;
    reset ||= result.reset;
    if (predicate(output, result)) return { output, cursor, reset };
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error(`Terminal did not reach expected state: ${output.slice(-300)}`);
}

test("terminal requires explicit consent and a known directory; rejects renderer-selected executables and invalid input", async (t) => {
  const { terminals } = setup(t);
  assert.throws(() => terminals.open({ cols: 80, rows: 24 }), /CONSENT/);
  assert.throws(
    () => terminals.open(open({ command: "arbitrary" })),
    /INVALID_INPUT/,
  );
  assert.throws(() => terminals.open(open({ projectId: "missing" })), /FOLDER/);
  assert.throws(() => terminals.open(open({ cols: 900 })), /INVALID_SIZE/);
  const session = terminals.open(open());
  assert.throws(
    () => terminals.write({ id: session.id, data: "x".repeat(16385) }),
    /INPUT_TOO_LARGE/,
  );
  assert.throws(
    () => terminals.write({ id: "missing", data: "x" }),
    /NOT_FOUND/,
  );
  assert.throws(
    () => terminals.read({ id: session.id, cursor: -1 }),
    /INVALID_CURSOR/,
  );
  assert.throws(
    () => terminals.read({ id: session.id, cursor: Number.MAX_SAFE_INTEGER }),
    /INVALID_CURSOR/,
  );
  assert.throws(
    () => terminals.resize({ id: session.id, cols: 80, rows: 0 }),
    /INVALID_SIZE/,
  );
});

test("real PTY runs in the chosen directory, accepts resize and Ctrl+C, and preserves independent sessions", async (t) => {
  const { terminals, project } = setup(t);
  const first = terminals.open(open({ projectId: "project" }));
  const second = terminals.open(open());
  assert.equal(first.cwd, realpathSync(project));
  assert.notEqual(first.cwd, second.cwd);
  terminals.resize({ id: first.id, cols: 90, rows: 30 });
  terminals.write({
    id: first.id,
    data: "node -e \"console.log('PTY_'+'READY',process.cwd())\"\r",
  });
  const ready = await until(terminals, first.id, (s) =>
    s.includes("PTY_READY"),
  );
  assert.ok(ready.output.includes(project));
  terminals.write({
    id: first.id,
    data: "node -e \"console.log('LONG_'+'RUN');setInterval(()=>{},1000)\"\r",
  });
  const running = await until(
    terminals,
    first.id,
    (s) => s.includes("LONG_RUN"),
    ready.cursor,
  );
  terminals.write({ id: first.id, data: "\x03" });
  terminals.write({
    id: first.id,
    data: "node -e \"console.log('AFTER_'+'INTERRUPT')\"\r",
  });
  await until(
    terminals,
    first.id,
    (s) => s.includes("AFTER_INTERRUPT"),
    running.cursor,
  );
  terminals.write({
    id: second.id,
    data: "node -e \"console.log('OTHER_'+'SESSION')\"\r",
  });
  await until(terminals, second.id, (s) => s.includes("OTHER_SESSION"));
  terminals.write({ id: first.id, data: "exit\r" });
  await until(terminals, first.id, (_, s) => s.state === "exited");
  assert.throws(() => terminals.write({ id: first.id, data: "x" }), /EXITED/);
  assert.equal(
    terminals.list().find((s) => s.id === second.id).state,
    "running",
  );
  await terminals.close({ id: first.id });
  assert.equal(terminals.list().length, 1);
});

test("terminal output and session count are bounded, shutdown removes all shells", async (t) => {
  const { terminals } = setup(t);
  const session = terminals.open(open());
  terminals.write({
    id: session.id,
    data: "node -e \"process.stdout.write('x'.repeat(260000)+'END_'+'OUTPUT')\"; exit\r",
  });
  // Concurrent readers can consume more than the ring limit over time.
  // Wait for the producer to finish before checking the retained output.
  await until(terminals, session.id, (_, state) => state.state === "exited");
  const result = await until(terminals, session.id, (s) =>
    s.includes("END_OUTPUT"),
  );
  assert.equal(result.reset, true);
  assert.ok(result.output.length <= 200000);
  for (let n = 1; n < 6; n++) terminals.open(open());
  assert.throws(() => terminals.open(open()), /TERMINAL_LIMIT/);
  await terminals.dispose();
  assert.deepEqual(terminals.list(), []);
  assert.throws(() => terminals.open(open()), /CLOSED/);
});

# Durable lifecycle evidence — 2026-10-19

All commands from `/home/aibot/apps/agenting-os`, installed Node v22.22.2. Logs are real command output. No provider inference.

| Command | Result | Log |
|---|---|---|
| `npm test` before implementation | 6/6 PASS | slice-baseline.log |
| `node --test --experimental-test-isolation=none tests/lifecycle.test.mjs` before implementation | 3 expected failures: missing taskAction | lifecycle-red.log |
| `npm test` final (includes pretest build) | 15/15 PASS | slice-tests.log |
| `npm run typecheck` | exit 0 | slice-typecheck.log |
| `npm run build` | exit 0 | slice-build.log |
| `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron --test --experimental-test-isolation=none tests/security.test.mjs tests/store.test.mjs tests/lifecycle.test.mjs` | 13/13 PASS | slice-electron-node.log |
| `npm run smoke` | exit 1, Process failed to launch | slice-smoke.log + smoke-result.json |

Both UI tests use built React assets in JSDOM, real temporary SQLite, a supplied API bridge and native-dialog shims. They do not exercise real preload IPC, layout, visual contrast or Electron windows. Concurrent claim test uses two real worker threads/connections released together. Migration test injects a rejecting SQLite trigger to verify state/event atomic rollback; this is not a physical disk-full test. Expiry tests use a controlled clock; no real agent execution is represented.

The first red attempt with process-isolated Node testing only returned a harness failure; the recorded red log was rerun using the repository's existing isolation=none setting and shows missing API failures. During development the new UI harness needed the same JSDOM dialog shim as the baseline test; final suite passes.

# Execution ledger

2026-10-19 Linux / Node v22.22.2 / npm 10.9.7.
- Read BUILD_BRIEF.md; master plan all 965 lines read in bounded chunks (initial combined output truncated, reread chunks).
- Skill lookup: writing-plans/testing/UI-routing absent; frontend-design, accessibility, browser-use and agent-reach read.
- curl -IL --max-time 15 https://registry.npmjs.org/react: exit 6, DNS failure.
- gh api repos/electron/electron: exit 1, network connection failed.
- git init: exit 1, .git/hooks read-only filesystem. No remote configured, no push.
- npm install --offline --ignore-scripts: initial failures ENOTCACHED and EROFS; see install logs. Cache copied read-only source to writable /tmp/agenting-npm-cache; direct tarballs/overrides allow offline installation.
- node --test tests/*.test.mjs before service implementation: failed ERR_MODULE_NOT_FOUND, evidence tdd-red.log.

Subsequent commands and results recorded in build/typecheck/test/smoke logs. Windows execution is unavailable here.

Final outcomes:
- npm install --offline --ignore-scripts --no-audit --no-fund --cache=/tmp/agenting-npm-cache: PASS, exact cached tarballs; final install-final.log.
- npm run build: PASS (build.log; also rebuilt by npm test pretest).
- npm run typecheck: PASS (typecheck.log).
- npm test: PASS 6 tests, 0 failures (tests.log). Includes DOM emulator + real SQLite, NOT Chromium E2E.
- node --test --test-isolation=none: unsupported flag on Node 22; corrected to --experimental-test-isolation=none. Prior tests-detailed.log includes intermediate UI test failures; tests.log is final.
- xvfb-run -a npm run smoke: FAILED before app startup, Chromium host syscall denial (smoke.log).
- AGENTING_TEST_NO_SANDBOX=1 DEBUG=pw:browser xvfb-run -a npm run smoke: same Chromium failure (smoke-host.log and smoke-no-zygote.log). Flags confined to test harness.
- browser-use --doctor: no running browser, daemon or active connections (browser-doctor.log). No remote/paid browser started.
- node scripts/notices.mjs: generated inventory for 97 installed packages; original available license texts retained, missing notices explicitly flagged.

- /home/aibot/.hermes/hermes-agent/node_modules/.bin/prettier --write selected source/test/config files: PASS (format.log); formatting only in this workspace.
- ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron --test --experimental-test-isolation=none tests/security.test.mjs tests/store.test.mjs: PASS, 5 tests in Electron's bundled Node, without Chromium (electron-node-tests.log).
- npm ci --prefix /tmp/agenting-install-check --offline --ignore-scripts --no-audit --no-fund --cache=/tmp/agenting-npm-cache: PASS, 97 packages from copied package.json/package-lock.json; no binary download (clean-install.log).
- Final npm run typecheck, npm test, npm run build after formatting: exit 0, 6 tests/0 failures, production assets built. Final authoritative logs: typecheck.log, tests.log, build.log.

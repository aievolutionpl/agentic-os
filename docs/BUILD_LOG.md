# Build log — 2026-10-19

1. Read brief + full master plan. Recorded SPEC, PLAN, STATUS, KANBAN before implementation. Existing project contained no source. Writing-plans/testing/UI-routing skills absent; read frontend-design, accessibility, browser-use and agent-reach.
2. Inspected local MIT Hermes Electron source reference and installed dependency licenses; network source lookup failed. Selected Electron + React + strict TS + built-in SQLite with ADR. No reference code copied.
3. Wrote persistence/isolation/validation/quota tests, ran red (missing module). Implemented SQLite WAL schema with project FKs and prepared statements. Corrected SQLite null-prototype preference serialization after failing test.
4. Built main-only persistence, fixed preload API, exact main-frame guard, sandbox/context isolation, no Node/webview, permissions denied, navigation/popups/network denied. No secret, shell or remote-operation channels.
5. Implemented bilingual project sidebar, draft task composer with interchangeable Codex/Claude implementer/reviewer roles, scoped memory/search/source/delete confirmation, integrations/unknown quota, persisted theme/language.
6. Offline npm install: initial metadata/read-only failures; copied cache to /tmp; pinned cached tarballs and compatible transitive dependencies. Lifecycle scripts disabled. Extracted preexisting cached Electron 43.1.0 Linux runtime only into this project's node_modules. Package-lock stores integrity. No paid/network provider calls or login changes.
7. Build/typecheck passed. Six tests passed including built React UI + actual SQLite bridge and restart. JSDOM native dialog open/close shim used; not visual or Electron evidence. Test assertions wait for React effects before checking language after restart.
8. Real Electron smoke attempted under Xvfb: host denies Chromium socket shutdown, fatal before app initialization. Repeated with test-only no-sandbox/no-zygote flags; unchanged outcome. Production sandbox enabled. Browser-use doctor has no browser/daemon. No screenshots produced, no desktop pass claimed.
9. git init failed: .git is mounted read-only. No remote/push. Dependency notices/inventory generated; packages omitting license texts flagged for pre-release review.

10. Final formatting, strict typecheck, production build and all six tests pass. Clean isolated offline npm ci installs 97 packages from lockfile. Electron bundled Node mode passes all five domain/security tests and SQLite; desktop Chromium launch remains blocked.

## 2026-10-19 — bounded durable lifecycle
Read NEXT_SLICE, BUILD_BRIEF, full master plan, STATUS/PLAN and available preparation reviews. Inspected relevant installed Hermes source read-only, MIT license and revision; mapped implemented/proposed architecture. Fixed review-confirmed stale smoke success evidence first. Recorded failing lifecycle tests before implementation; kept all existing tests untouched.

Added original lifecycle module with schema migration, transactions, dependency cycle/scope validation, atomic lease claims, heartbeat and token fencing, expired failure recovery, three-attempt explicit retry and journal. Localized narrow planning actions and persisted journal/state in existing React UI. No provider runner wired. Added migration/rollback/concurrency/restart/domain/UI tests. Final: 15 tests pass; typecheck/build pass; Electron Node 13 tests pass. Real desktop launch fails before interaction and is recorded failed. No native Windows verification, no release claim or push.

## 2026-10-19 12:5x — desktop smoke unblocked
- Root cause: no $DISPLAY, not syscall restriction. `xvfb-run -a npm run smoke` launches real Electron.
- Fixed stale smoke expectations after lifecycle slice (taskAction IPC key), added real taskAction malformed-input rejection assertion, scoped default-master lookup to main, added aria-label to both role selects.
- Added `npm run smoke:headless`. Evidence: docs/evidence/smoke-xvfb-*.log. build/typecheck/15 tests/smoke all PASS.

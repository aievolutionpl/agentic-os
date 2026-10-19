# Bounded adapter contract correction — 2026-10-19 (stopped)

## Done
- Preserved current baseline; verified original adapter snapshot hashes; self-reviewed adapter diff/security. See `docs/audit/adapter-contract-review.md`.
- Smoke contract validates seven unprobed identities and two honest provider states, including missing/unknown installations, unknown auth/quota and disabled execution.
- TDD fix: failed/timed-out auth-status capability now false. Four deterministic smoke-contract scenarios added; all prior tests retained.
- `npm run typecheck` exit 0; `npm test` exit 0 (26/26, production pretest build); explicit `npm run build` exit 0. Logs: `docs/evidence/adapter-contract-slice/`.

## Blocked / unverified
- `xvfb-run -a npm run smoke` and DEBUG diagnostic both exit 1 before first window; sandbox_host_linux.cc:41 Operation not permitted. No bypass or flags/settings changes. Existing Playwright-generated --no-sandbox flag visible in diagnostic; no rendered success claimed.
- Windows **UNVERIFIED**; independent review and real corrected smoke remain pending.

## Changed / next
- Changed: `src/main/adapters.ts`, `scripts/smoke.mjs`, `tests/adapters.test.mjs`, new `scripts/integration-contract.mjs`, audit doc, STATUS/KANBAN and new slice evidence; standard smoke-result.json regenerated, prior copy preserved; local dist rebuilt. No package/lockfile changes.
- Stop here. Next authorized slice: allowed-host real smoke and exact diff review; fix only observed failures. No inference, paid API, auth/login change, Hermes config/cron change, dependencies, workers, git init or public push.

---

# Current bounded adapter slice — 2026-10-19

## Done
- Reviewed contrast scripts against preserved snapshots; security findings recorded in `docs/audit/contrast-slice-security.md`.
- Preserved pre-edit adapter-slice files and SHA-256 manifest under `docs/evidence/adapter-slice/before/`.
- TDD read-only Codex/Claude adapters: fixed version/help/auth-status argv, `shell:false`, no stdin, 2-second timeout, bounded discarded output, no raw stdout/stderr in renderer/logs, auth unknown without documented machine-readable output, execution disabled, quota unknown/null.
- Minimal Integrations UI now shows only local installation/probe capability metadata for Codex and Claude; it never shows auth as authenticated or a quota value.
- `npm run probe:adapters` exit 0: Codex 0.159.1 and Claude Code 2.1.269 detected; all six fixed probes passed; auth and quota remain unknown.
- `npm run typecheck` exit 0; `npm test` exit 0 (22/22); `npm run build` exit 0.

## Blocked / not done
- `xvfb-run -a npm run smoke` exit 1 before app startup. Electron fatal: `sandbox_host_linux.cc:41 ... Operation not permitted (1)`; direct launch also SIGTRAP. Evidence in `docs/evidence/adapter-slice/`. Prior supervisor smoke/contrast PASS is historical and not re-certified by this run.
- Windows, independent diff review, provider execution, authentication changes, paid calls, inferred quota and public push remain unverified/disabled.

## Changed files
- `package.json`, `src/shared.ts`, `src/main/adapters.ts`, `src/main/index.ts`, `src/renderer/i18n.ts`, `src/renderer/main.tsx`, `tests/adapters.test.mjs`, `scripts/probe-adapters.mjs`, `docs/audit/contrast-slice-security.md`, `docs/STATUS.md`, `docs/KANBAN.md`, and `docs/evidence/adapter-slice/`.
- No dependency or lockfile change; no Hermes/config/cron change.

## Stop condition / next bounded task
- Stop after this slice. Next: allowed-host Electron smoke and independent hash/diff review; do not enable execution or login changes.

# Bounded contrast QA checkpoint — 2026-10-19

## Done in this slice
- Preserved pre-edit source/document snapshots and SHA-256 manifest: `docs/evidence/contrast-slice/before/`.
- Added contrast math + DOM collector + dedicated actual Electron QA matrix (dark/light, mobile 360/390, tablet 768/1024, tasks/memory/integrations/project dialog); structured ratios and screenshot capture paths. Text AA 4.5:1 / large 3:1; correct transparency/group-opacity compositing; complex paint fails unresolved.
- TDD missing-module red then 5/5 green; full `npm test` exit 0, **20/20**; `npm run typecheck` exit 0. Logs in `docs/evidence/contrast-slice/`.
- Changed-file list: `package.json`, new `scripts/contrast-math.mjs`, `scripts/contrast-dom.mjs`, `scripts/contrast-qa.mjs`, `tests/contrast.test.mjs`, `docs/STATUS.md`, `docs/KANBAN.md`; evidence directory added and standard `docs/evidence/smoke-result.json` regenerated. Source hashes/diff targets in `contrast-slice/changed-files.json`. Existing source/UI colours preserved; no actual contrast fixes justified without rendering.

## Blocked / not done
- `xvfb-run -a npm run smoke` **exit 1** and `xvfb-run -a npm run qa:contrast` **exit 1**: Chromium launch fatal `shutdown: Operation not permitted (1)` before rendering. Diagnostic launch log and structured blocked result retained. **Zero measured rendered screens or new screenshots.** Harness matrix is not yet validated end to end. Earlier historical smoke PASS does not override this failure.
- Windows, independent diff review and measured rendered contrast remain **UNVERIFIED**. Text harness does not certify non-text contrast, native popup menus or every interaction state.

## Next bounded task (not executed)
- Resolve Electron launch on an allowed host, rerun smoke and `qa:contrast`, inspect PNG/JSON evidence and fix only observed contrast failures. Review exact source differences against snapshots. Stop this slice here; no provider execution, dependencies/config/auth changes, paid calls, push or workers.

---

# Current slice — 2026-10-19

## Done
- Read-only Hermes architecture/license mapping and review triage; no code reuse.
- Fix stale smoke PASS reporting, including unhandled launch failure exit.
- Preserve existing app and 6 original tests; add schema v2 migration and transactional lifecycle/events.
- Scoped dependency DAG, readiness, atomic claims, lease token fencing/heartbeat/expiry, durable failure and explicit retry capped at 3 attempts.
- PL/EN theme-compatible persisted task state/journal with queue/cancel/retry/dependencies/refresh; execution disabled.
- Verification: 15/15 tests, typecheck/build PASS, Electron Node 13/13; logs in docs/evidence/slice-*.
- Real desktop smoke now PASSES under `xvfb-run` (missing `$DISPLAY` was the blocker, not syscalls): real Electron window, 10-handler IPC surface, `taskAction` malformed-input rejection, isolation flags, restart persistence, PL/EN + theme, responsive widths, zero console errors. Added `npm run smoke:headless`; evidence `docs/evidence/smoke-xvfb-*.log`.
- A11y fix from that run: both role selects got explicit `aria-label` (label-wrapped option text polluted the accessible name).

## Blocked / still unverified
- Native Windows upgrade/startup (no installer), pixel-level contrast/visual audit, independent new-slice review, release/license gates.

## Exact next task
- Screenshot visual QA + measured WCAG contrast ratios from the Xvfb run; then read-only Codex/Claude adapters (network reachable again); then v1→v2 migration/restart on native Windows.
- Then read-only Codex/Claude adapter capabilities; execution only after isolation, process supervision and exact-diff approval gates. No paid fallback.

---

# Historical baseline kanban
## Done for bounded slice
- Read requirements/skills; write spec/plan/status before code; record desktop ADR.
- Failing tests first; SQLite WAL project/task/memory persistence and scope guards.
- Electron main/preload trust boundary; React PL/EN and light/dark UI.
- Task drafts with Codex/Claude role swap; sourced memory search/delete confirmation.
- Truthful unconfigured integrations / unknown quota.
- Offline dependency installation, notices, build, strict typecheck and six passing tests.
## Blocked / verification gates
- Real Electron/visual smoke: host Chromium syscall restriction.
- Native Windows launch/packaging: Windows unavailable.
- Local git initialization: .git mounted read-only.
- Current upstream/CVE/license completion: network unavailable; missing package license text flagged.
- Independent review still pending; no release certification.
## Next
- Run committed smoke harness and Windows launch; fix any actual runtime/visual findings.
- Official Codex/Claude read-only capability probes and supported quota provenance.
- Isolated worktrees, bounded execution/cancellation, reviewed exact-diff approval.
- Persistent separate Chromium without Node/preload; visible automation and safe selected import.
- Curated developer/UI/browser skill registry with source/license and scope.
- OpenRouter/custom API workers with main-only OS-backed secrets and hard approval budget.

## Slice 4 — artifact-bound approvals (complete bounded implementation)
- Done: `Approvals.decide` references persisted artifact identity, recomputes hash from BLOB bytes, checks scope/current attempt atomically; caller diff/hash rejected; matches checks artifact ID.
- Done: transactional schema v5, unbound legacy history preserved, insert guard, migration rollback/restart/negative tests and real captured artifact binding. Typecheck and production build PASS; 30/30 tests PASS.
- Blocked: real Electron smoke exits 1 before window (`Process failed to launch!`). Windows **UNVERIFIED**; independent review pending. Evidence: `docs/evidence/artifact-approval/`.
- Next: supervisor allowed-host smoke and preserved-diff review. No apply/execution/IPC/dependency/config/auth/push enabled. Slice stops here.

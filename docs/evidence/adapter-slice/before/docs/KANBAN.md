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

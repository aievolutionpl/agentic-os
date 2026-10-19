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

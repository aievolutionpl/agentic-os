# Bounded adapter contract correction — 2026-10-19

This slice stops here; whole-app completion is not claimed. Windows remains **UNVERIFIED**. No other writers or workers, inference, paid API, login/auth change, Hermes config/cron change, dependency change, git init or public push.

- Preserved pre-edit files/hashes in `docs/evidence/adapter-contract-slice/before/`; original adapter snapshots preserved and verified (`sha256sum -c docs/evidence/adapter-slice/before/manifest.sha256`, exit 0). Review: [adapter-contract-review.md](audit/adapter-contract-review.md), self-review only; diff retained in evidence.
- Replaced obsolete nine-label smoke assertion with identity/field contract checks: seven unprobed integrations, two probe-dependent providers; missing/unknown installation accepted honestly; auth/quota unknown and execution disabled. DTO and rendered observations checked separately because snapshot calls reprobe the host. Four deterministic scenarios cover installed, unavailable/ENOENT, timeout and nonzero failure, plus rejection checks. These tests do not establish real UI success.
- TDD corrected observed false capability: failed/timed-out auth-status no longer yields capability=true or contributes to “Passed.” `node --test --experimental-test-isolation=none tests/adapters.test.mjs` before fix: exit 1, true !== false; [red log](evidence/adapter-contract-slice/tdd-red.log).
- `npm run typecheck`: **exit 0** ([log](evidence/adapter-contract-slice/typecheck.log)).
- `npm test` (includes pretest production build): **exit 0, 26 passed / 0 failed**, preserving prior 22 tests ([log](evidence/adapter-contract-slice/tests.log)).
- Explicit `npm run build`: **exit 0** ([log](evidence/adapter-contract-slice/build.log)).
- `xvfb-run -a npm run smoke`: **exit 1 before first window** ([log](evidence/adapter-contract-slice/smoke.log)); `DEBUG=pw:browser xvfb-run -a npm run smoke`: **exit 1**, fatal `sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)` ([diagnostic](evidence/adapter-contract-slice/smoke-diagnostic.log)). No workaround attempted or sandbox settings/flags changed. Diagnostic exposes the existing Playwright-generated `--no-sandbox` flag; no successful rendered checks or screenshots this run. Supervisor's seven-versus-nine failure remains historical evidence of the obsolete assertion, not a new pass.

Changed files: `src/main/adapters.ts`, `scripts/smoke.mjs`, new `scripts/integration-contract.mjs`, `tests/adapters.test.mjs`, new `docs/audit/adapter-contract-review.md`, `docs/STATUS.md`, `docs/KANBAN.md`; evidence added under `docs/evidence/adapter-contract-slice/`. Standard `docs/evidence/smoke-result.json` regenerated as failed; prior copy preserved. Local ignored `dist/` rebuilt. Package/lockfile and renderer source unchanged in this slice.

Next bounded step: supervisor reruns real smoke on an allowed host and reviews exact diff/PNG evidence; investigate only observed contract/UI failures. Retain execution/auth/quota boundaries. Windows startup/upgrade remains a separate unverified gate. No further work in this slice.

---

# Read-only provider adapter slice — 2026-10-19

This bounded slice is complete and stops here. No provider execution, inference, paid API call, login change, Hermes configuration/cron edit, dependency change, new worker, git initialization or public push occurred. Windows remains **UNVERIFIED** and the whole app is not claimed complete.

- Reviewed the contrast harness against the preserved `docs/evidence/contrast-slice/before/` snapshots. Findings are documented in [contrast-slice-security.md](audit/contrast-slice-security.md): temporary profile paths, raw exception text and user-entered labels can enter diagnostic evidence. The harness has no provider/shell/IPC path; no contrast colour change was made.
- Preserved this slice's pre-edit files and SHA-256 entries in [adapter-slice/before](evidence/adapter-slice/before/). No applicable `AGENTS.md` exists in this project.
- Added main-process-only, read-only Codex/Claude probes with fixed argv: `--version`, `--help`, `codex login status`, and `claude auth status`; `spawn` uses `shell:false`, a 2-second timeout, no stdin, and bounded internal capture. Raw stdout/stderr are discarded and never returned to the renderer or logs. Auth is deliberately `unknown` because no documented machine-readable result was available. Execution capability is always false. Quota remains `unknown` with null remaining/unit/source/observedAt/resetAt.
- Actual `npm run probe:adapters`: **exit 0**. Codex `0.159.1` and Claude Code `2.1.269` were locally detected; version/help/auth-status commands passed; auth remained unknown; no quota was measured. Redacted result: [probe-result.json](evidence/adapter-slice/probe-result.json), safe console log: [probe.log](evidence/adapter-slice/probe.log).
- TDD adapter tests: **2 new tests pass** for fixed command allowlist, 2-second timeout contract, missing/timed-out handling, secret non-propagation, unknown auth and unknown quota.
- `npm run typecheck`: **exit 0**, [log](evidence/adapter-slice/typecheck.log).
- `npm test`: **exit 0, 22 passed / 0 failed**, including the prior 20 tests and 2 adapter tests, [log](evidence/adapter-slice/tests.log).
- `npm run build`: **exit 0**, [log](evidence/adapter-slice/build.log).
- `xvfb-run -a npm run smoke`: **exit 1 before first window**. Direct diagnostic confirms Electron fatal `content/browser/sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)` and SIGTRAP; [smoke.log](evidence/adapter-slice/smoke.log), [smoke-diagnostic.log](evidence/adapter-slice/smoke-diagnostic.log), [electron-direct.log](evidence/adapter-slice/electron-direct.log). The supervisor's earlier smoke/contrast PASS is retained as historical evidence; this run did not establish a new smoke pass and no sandbox bypass was attempted.

Changed files in this slice: `package.json`, `src/shared.ts`, `src/main/adapters.ts`, `src/main/index.ts`, `src/renderer/i18n.ts`, `src/renderer/main.tsx`, `tests/adapters.test.mjs`, `scripts/probe-adapters.mjs`, `docs/audit/contrast-slice-security.md`, `docs/STATUS.md`, `docs/KANBAN.md`, plus evidence under `docs/evidence/adapter-slice/`. Existing `docs/evidence/smoke-result.json` was regenerated by the failed smoke attempt. No dependency or lockfile change.

Exact next bounded slice: resolve Electron launch on an allowed host and rerun the real smoke/UI checks, then independently review this adapter diff against the preserved hashes. Keep execution, login changes, inference and quota claims disabled until an explicitly authorized slice proves isolation, approval and provider-result handling.

# Supervisor independent verification — 2026-10-19 12:34 UTC

No active project Codex worker found. Independently executed `npm run typecheck && npm test && xvfb-run -a npm run smoke && xvfb-run -a npm run qa:contrast`: exit 0; production build and 20/20 tests PASS, real Electron smoke PASS, contrast matrix PASS. Current structured evidence is `docs/evidence/contrast-slice/result.json` with real PNG captures. Earlier launch restriction did not reproduce outside the worker sandbox; no sandbox/security settings changed. Text contrast evidence is not a full visual/accessibility certification. Windows remains UNVERIFIED. Next bounded subscription worker: review source changes against preserved snapshots and implement read-only Codex/Claude installation/auth/capability adapters, with no inference, authentication changes, paid calls or execution. No concurrent writers.

# Bounded contrast regression slice — 2026-10-19 (historical worker sandbox blocker; supervisor rerun passed)

This entry supersedes the earlier next-task statement only for this slice. Existing app/lifecycle work is preserved. No renderer/main source, CSS, dependencies, provider execution, login, Hermes configuration, cron, secrets or other projects changed. No workers spawned. Windows remains **UNVERIFIED**. No independent review claimed.

- Before source edits, copied all existing `src/`, `scripts/`, `tests/`, `package.json`, STATUS and KANBAN into [contrast-slice/before](evidence/contrast-slice/before/), with SHA-256 [manifest](evidence/contrast-slice/before/manifest.json). Git remains absent; no git initialization attempted.
- Added `npm run qa:contrast`: actual Electron/Playwright renderer collection of computed text and placeholder foregrounds, ancestor backgrounds and opacity; source-over alpha and group opacity compositing; WCAG relative luminance without ratio rounding. AA threshold 4.5:1, large text 3:1 at >=24 CSS px normal or >=18 2/3 CSS px with weight >=700. Disabled controls recorded but exempt. Complex image/filter/blend/shadow paint is unresolved and fails the check rather than silently passing. Decorative aria-hidden text is excluded.
- Planned matrix: dark/light × 360/390 mobile and 768/1024 tablet widths × tasks, memory, integrations and project dialog, plus initial empty state. Per-screen JSON includes measured styles, composite colours, ratios, thresholds, failures, viewport and overflow; captures full-page PNGs. Isolated temporary local profile only, no provider calls. Native popup menus, non-text boundaries/focus, every interactive state, and general WCAG conformance are outside this text-contrast check.
- **TDD:** [red](evidence/contrast-slice/tdd-red.log) proves missing new module fails before implementation. [Collector red](evidence/contrast-slice/collector-red.log) records an intermediate JSDOM named-colour fixture failure; fixture corrected to the RGB serialization Chromium returns. [Green](evidence/contrast-slice/tdd-green.log): 5/5 contrast tests pass, including reference ratios, transparency, group opacity, threshold boundaries and collector routing. JSDOM collector tests stub geometry and are **not rendered-UI evidence**.
- `npm run typecheck`: **exit 0**, [log](evidence/contrast-slice/typecheck.log).
- `npm test`: **exit 0, 20 passed / 0 failed**, including existing 15 tests and production pretest build; [log](evidence/contrast-slice/tests.log).
- `xvfb-run -a npm run smoke`: **exit 1**, Electron fails before app startup; [log](evidence/contrast-slice/smoke.log). Standard smoke also updates its existing `docs/evidence/smoke-result.json` to failed. Earlier screenshots remain historical evidence.
- `xvfb-run -a npm run qa:contrast`: **exit 1 / BLOCKED**, **0 rendered screens, 0 measurements, 0 new screenshots**. [Structured result](evidence/contrast-slice/result.json), [final log](evidence/contrast-slice/qa-final.log), [diagnostic launch log](evidence/contrast-slice/launch-debug.log). Chromium fatal: `content/browser/sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)`. Xvfb alone does not resolve this session's host restriction; earlier successful smoke does not establish success here. No auth/network blocker encountered. No sandbox configuration changed or restriction bypassed.
- No actual rendered contrast failures could be established; **no UI colour fixes made**. Harness matrix and screenshot path remain unverified until Electron can start. This slice stops here with the launch blocker, rather than claiming measured QA passed.

Changed source/document files (complete): `package.json` (test registration + qa script); new `scripts/contrast-math.mjs`, `scripts/contrast-dom.mjs`, `scripts/contrast-qa.mjs`, `tests/contrast.test.mjs`; `docs/STATUS.md`, `docs/KANBAN.md`. Evidence added under `docs/evidence/contrast-slice/` (snapshots, hashes, red/green/full-suite/launch logs and structured blocked result); standard smoke regenerated `docs/evidence/smoke-result.json`. Build regenerated ignored/local `dist/` assets via existing pretest. See [changed-files.json](evidence/contrast-slice/changed-files.json) for baseline hashes and review targets.

Exact next action for a subsequent authorized slice: on a host where Electron launches, run `npm run typecheck`, `npm test`, `xvfb-run -a npm run smoke`, then `xvfb-run -a npm run qa:contrast`; inspect the generated PNGs and JSON, fix only observed contrast failures, rerun and independently compare against the preserved source snapshots. Do not start provider adapters as part of this slice.

---

# Status — desktop smoke passing under Xvfb (2026-10-19 12:5x)

Existing Electron/React app and all six original tests preserved. Original task lifecycle module, SQLite v1→v2 migration, scoped dependency DAG, transactional journal, atomic execution leases, owner/token fencing, heartbeat, expiry failure and explicit bounded retry are implemented. UI reads persisted statuses/events and supports dependency selection, queue, cancel, retry and refresh in PL/EN with existing themes. Queueing is intent only: execution, provider inference, quotas and exact-diff approvals are NOT simulated or enabled.

## Verified evidence for this slice
- `npm test`: **15 passed / 0 failed** (all 6 baseline tests + 9 new tests). See [slice-tests.log](evidence/slice-tests.log).
- `npm run typecheck`: **PASS**. See [slice-typecheck.log](evidence/slice-typecheck.log).
- `npm run build`: **PASS**. See [slice-build.log](evidence/slice-build.log).
- Electron bundled Node: **13 domain/security tests passed**, no Chromium claim. See [slice-electron-node.log](evidence/slice-electron-node.log).
- `npm run smoke`: **PASS — real Electron desktop window** under `xvfb-run` (the earlier "Chromium cannot start" blocker was a missing `$DISPLAY`, not a syscall restriction). Covers real IPC surface (10 handlers incl. new `taskAction`), `taskAction` rejection on malformed input, contextIsolation/sandbox flags, project + draft task creation, restart persistence, PL/EN + theme, 9 unconfigured integrations, responsive widths and zero console errors. Evidence: [smoke-xvfb](evidence/). Headless entry point added: `npm run smoke:headless`.
- Re-verified after the smoke fixes: `npm run typecheck` PASS, `npm test` 15/15, `xvfb-run -a npm run smoke` PASS. `hermes verify --json` cannot run here: its bootstrap `npm install` is refused with `EALLOWREMOTE` (remote package fetch disabled in this npm config), so verification is the npm-based suite above.
- Accessibility fix found by the smoke run: both role `<select>` controls (composer + project default master) now carry explicit `aria-label`, because label-wrapped option text polluted the accessible name.
- Original baseline reproduced: 6/6, [slice-baseline.log](evidence/slice-baseline.log). TDD red evidence: [lifecycle-red.log](evidence/lifecycle-red.log), missing lifecycle API before implementation.
- New coverage includes full connection shutdown/reopen, migration preserving projects/memory/preferences/tasks, simultaneous Worker-thread claimants on separate SQLite connections, heartbeat/expiry/fencing, three-attempt cap, invalid transitions, cycles, cross-project edges and writes, journal-write failure rollback, persisted PL/EN UI and restart.

Hermes source was inspected read-only; license and revision documented in [HERMES_MAPPING](architecture/HERMES_MAPPING.md). No copied source or new dependencies. No Hermes/config/credential/cron changes, authentication, inference, push or provider capability probes. Existing private runtime data not ingested. [ADR 002](adr/002-task-lifecycle.md) records implemented vs proposed boundaries.

## Supervisor checkpoint — 2026-10-19
- No active Codex/Node build worker found with this project cwd; original worker.log is historical baseline, not current progress.
- Independently reran `npm run typecheck && npm test && xvfb-run -a npm run smoke`: exit 0; 15/15 tests, production pretest build and real Electron smoke PASS.
- `codex login status`: ChatGPT subscription authenticated. `codex exec --help` inspected before next bounded workspace-write worker.
- `git status --short`: not a git repository; diff-based review currently unavailable. Next worker must preserve baseline and provide explicit changed-file evidence, no push/config changes.
- Next bounded worker: measured visual/contrast QA and automated regression evidence; provider execution remains disabled. Windows remains UNVERIFIED.

## Limits and exact next step
Native Windows launch is still UNVERIFIED (no installer); this host runs Linux Electron under Xvfb only. No pixel-level visual/contrast audit yet — smoke asserts DOM/roles/responsive widths, not rendered colour ratios. No independent approval of this slice is claimed. Expiry reconciliation runs on project-data refresh; no dispatcher or background agent exists. Journal reads are unpaginated. SQLite metadata is unencrypted. Downgrade requires a backup because the old app rejects schema v2.

Next (ordered, bounded): 1) screenshot-based visual QA + measured contrast ratios from the Xvfb run (render frames to PNG, compute WCAG ratios rather than judging by eye); 2) read-only Codex/Claude capability adapters (network is reachable again — `https://registry.npmjs.org` returned 200 on 2026-10-19); 3) v1→v2 upgrade/restart on native Windows with evidence. Execution stays disabled and claims inaccessible to the renderer until isolated worktrees, process supervision, side-effect reconciliation and exact-diff approvals are tested.

---

# Historical baseline — first bounded slice

Working code: Electron host, narrow sandboxed preload IPC, React interface, SQLite WAL local projects, project-scoped draft tasks and memory with source/date, memory search and confirmed deletion, default Codex/Claude roles and per-draft swap, persistent PL/EN and light/dark. Nine integration entries accurately unconfigured; quota amount/unit/source/measurement/reset null. Agent execution is deliberately unavailable.

## Verification
- `npm run build`: PASS; TypeScript main/preload and Vite production assets generated.
- `npm run typecheck`: PASS; strict main and renderer typecheck.
- `npm test`: PASS, 6 tests, 0 failures; pretest rebuilds production assets. Includes SQLite restart, scope/deletion, malformed input and independent-role validation, unknown quota, IPC sender policy, built React UI with real SQLite bridge, persisted settings, inert script-like memory.
- `npm run notices`: local dependency inventory and original available license texts retained.
- Clean `npm ci --offline --ignore-scripts` in isolated /tmp directory: PASS, 97 packages installed from lockfile. Electron binary download intentionally excluded.
- Electron bundled Node runtime: PASS, 5 domain/security tests with `ELECTRON_RUN_AS_NODE=1`; this verifies SQLite/runtime compatibility, not Chromium desktop launch.
- Real Electron smoke: BLOCKED before app startup, Chromium fatal socket shutdown `Operation not permitted`. Evidence in `docs/evidence/smoke*.log`. JSDOM does not establish browser layout, contrast, native dialog/focus, real IPC or Electron runtime success.
- Windows launch/packaging: UNVERIFIED. No installer supplied.

## Blockers / release limitations
Network DNS/connectivity prevents online upstream audit and provider docs/probes. Dependencies installed from existing local cache with exact tarball URLs and lock integrity. Latest CVE review unavailable. Several upstream package tarballs omit license text; inventory flags them. Independent external-agent review remains pending; no self-review labelled independent.

`.git` mounted read-only; `git init` failed. No commits, remote setup or push performed. Writable source remains in this directory. This host cannot launch Chromium under current syscall restrictions; visual QA/screenshots and actual Electron/Windows launch still required. Local metadata is unencrypted; credential input/storage is not implemented.

## Precise next task
On a host permitting Chromium, run `npm ci`, `npm test`, `npm run typecheck`, `npm run smoke`; exercise on Windows with a fresh userData directory and preserve screenshots/evidence. Then add official Codex/Claude read-only installation/auth/capability probes (no login changes or paid calls), followed by isolated worktree execution, test/reviewer artifacts and user approval bound to exact diff hash before applying. Persistent separate Chromium with visible automation, supported user-selected session import and curated skill library remain staged.

## Supervisor independent checkpoint — 2026-10-19T12:51:45.626115+00:00

Adapter worker exited; no active project Codex writer found. Independent `npm run typecheck && npm test && xvfb-run -a npm run smoke`: typecheck PASS, production build PASS, 22/22 tests PASS; actual Electron launches but smoke FAILS scripts/smoke.mjs:166 (7 unconfigured labels vs obsolete expectation 9 after two read-only probes). This is a real regression in the UI test contract, not the historical sandbox launch blocker. Subscription login verified as ChatGPT; current `codex exec --help` inspected. Next bounded worker fixes deterministic integration smoke coverage and reviews adapter security against snapshots; no inference/login changes/paid API. Windows UNVERIFIED.

## Supervisor checkpoint — 2026-10-19 (kolejny)
Aktywny worker Codex PID 1875723 (cwd projektu). Niezależnie: typecheck PASS, 26/26 testów PASS, xvfb Electron smoke PASS (regresja 7 vs 9 naprawiona). Windows UNVERIFIED. Brak concurrent writera.

## Supervisor checkpoint — 2026-10-19T14:40:45+01:00
Poprzedni worker padł od razu (brak --skip-git-repo-check). Nowy worker PID 1889225 (workspace-write, slice: exact-diff approval model, NEXT_SLICE2.md). Brak równoległych writerów. Windows UNVERIFIED.

## Supervisor checkpoint — 2026-10-19T14:42:20+01:00
Poprzedni worker nie ruszył (brak pliku zadania). Nowy worker Codex (workspace-write, --skip-git-repo-check) działa: slice exact-diff approval model (NEXT_SLICE2.md). Brak równoległych writerów. Windows UNVERIFIED.

## Bounded exact-diff approval record model — 2026-10-19

Implemented one Linux-verifiable slice: internal main-process `Approvals` metadata API, SQLite schema v3 (transactional v2→v3 migration; v1 continues through v2), immutable approval/rejection records bound to project, task, current attempt and SHA-256 of exact nonempty Buffer bytes (maximum 10 MiB). Generated UUID identifies each decision; approver is a validated local attribution string, **not authenticated identity**. Expiry is mandatory. Unknown record fields, supplied hashes, malformed decisions/IDs/attempts/expiry and cross-project task writes are rejected. Hash matching rejects changed bytes, wrong scope/attempt, rejected decisions and expiry at the boundary. SQLite enforces scoped task foreign keys, hash/decision constraints and update/delete rejection. Diff contents are not stored.

This is a record model, **not an execution approval gate**: no apply/consume, dispatcher, provider execution, filesystem changes, auth changes, paid API, push, dependencies or configuration changes. No IPC/preload/renderer additions; records are absent from `projectData`. A match is metadata only, not execution authorization or a TOCTOU-safe apply mechanism. Windows remains **UNVERIFIED**; no approval UI/rendered behavior or independent review claimed.

Verification: initial TDD red in [red.log](evidence/approval-model/red.log) (missing API). Final required sequence `npm run typecheck && npm test && xvfb-run -a npm run smoke`: typecheck **exit 0**, production pretest build **exit 0**, tests **28/28 PASS**, smoke **exit 1 before window launch**, `Process failed to launch!`. Logs: [typecheck](evidence/approval-model/typecheck.log), [tests](evidence/approval-model/tests.log), [smoke](evidence/approval-model/smoke.log). No cause beyond the reported launch failure is asserted; no sandbox/config workaround attempted. Standard smoke-result.json was regenerated by the smoke harness. Tests cover restart persistence, prior-schema data preservation, exact bytes/newlines, invalid input, cross-project scope, current-attempt fencing, expiry, rejection, SQL immutability and disabled task/UI effects.

Changed implementation: new `src/main/approvals.ts`, `src/main/store.ts`, `src/main/lifecycle.ts`; tests appended to existing `tests/store.test.mjs` (no test/config changes). Pre-edit copies and SHA-256 manifest are under `docs/evidence/approval-model/`.

Exact next bounded step: on an allowed Linux host rerun `npm run typecheck && npm test && xvfb-run -a npm run smoke` and review this schema/API diff against the preserved baseline. After that gate, implement isolated-worktree diff artifact capture with persisted base/target identity and reproducible exact-byte hashing, with tests, still without execution/apply or renderer approval claims. Native Windows upgrade/startup remains a separate unverified gate.

## Supervisor checkpoint — 2026-10-19T14:58:53+01:00
Worker zakończył. Niezależnie: typecheck PASS, 28/28 testów PASS, xvfb smoke PASS. Start workera: NEXT_SLICE3.md (diff artifact capture). Windows UNVERIFIED.

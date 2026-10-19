# Selectable Master Agent — 2026-10-19

Added model-driven goal planning, validated six-step DAGs, persistent mission/context journals (schema v10), atomic task binding, sequential delegation, quota checks, independent reviews including no-change research, human Git application gates, final Master evaluation and explicit memory writeback. The new project tab visualizes the architecture supplied by the user. Added Gemini/Hermes ACP and separate local OpenCode model profiles; live compatibility is stated separately from configuration.

Codex supervised threads preserve sign-in while overriding inherited external tools and checking MCP runtime status before inference. The live integration probe exposed and drove fixes for ambient MCP writes and missing research review. See [Master audit](MASTER_AGENT_AUDIT.md) and [research](research/master-agent-2026-10-19.md). Earlier sections below describe previous checkpoints.

# Agent workspace upgrade — 2026-10-19

Implemented a redesigned AI Evolution Polska Control Center, four execution provider configurations, native Claude/Antigravity adapters, optional OpenCode/OpenRouter integration, OS-encrypted API-key persistence, authoritative-or-unknown quota displays, explicitly shared FTS5 memory, a team skill and a finite supervised queue. Local Git projects work without a GitHub remote. Schema v9 preserves v1–v8 data and defaults old memory to private project scope.

Current scope, evidence and limitations: [workspace audit](WORKSPACE_AUDIT.md), [research decisions](research/agent-workspace-2026-10-19.md), and the root README. Historical entries below describe earlier checkpoints. This increment is a separate branch/PR; earlier merge authorization does not apply to it.

---

# Stage 0.5 (historical checkpoint) — Control Center and connector detection — 2026-10-19

First slice of plan v3 ([docs/plan-v3](plan-v3/AGENTING_OS_PLAN_V3.md)). Added a connector registry that detects Codex, Claude Code, Gemini CLI, Hermes, OpenCode, Antigravity, Ollama, LM Studio and the GitHub CLI on this computer, using only fixed read-only version/status commands and loopback HTTP probes. The new **Control Center** screen shows each connector's state (`ready`, `needs-auth`, `needs-install`, `experimental`, `unsupported`, `degraded`), version, sign-in method/plan where the official CLI states it, adapter status, local models, an exact local run counter, and suggested next steps. Provider limits are shown as **Unknown** — no verified official source exists yet, and nothing is estimated. `ready` means detected, signed in and backed by an execution adapter in this build; no smoke test has been run, and the UI says so. Fixed a Windows bug where npm-installed CLIs (`.cmd` shims) were reported as "not detected" by the older Integrations probe. Windows: typecheck PASS, **49/49** tests PASS (6 new), Electron smoke PASS, contrast QA PASS, `npm audit` 0 vulnerabilities. Captures with measured contrast (EN/PL, dark/light, 1440/1024/390) are in [docs/evidence/control-center](evidence/control-center). Not done yet: connection wizard/login actions, smoke tests per connector, quota readers, cost ledger, router, orchestrator, API-key vault, extended settings — see the plan roadmap.

---

# Stage 0.4 — extensions and distribution — 2026-10-19

Completed the requested three-stage implementation. Added project-scoped versioned skills, explicitly trusted/manual MCP stdio tools, isolated persistent project browsers, unsigned Windows x64 NSIS packaging, CI and open-source guidance. Current documentation starts at the root README. Native Windows: full **43/43** regression suite, typecheck/build, Electron UI and browser isolation checks passed. Package and contrast details are recorded in [0.4 evidence](evidence/release-04/README.md). No authenticated model call was needed for these checks; signed release and installer lifecycle testing remain future work.

---

# Stage 0.3 — collaboration and context — 2026-10-19

Implemented scoped FTS5 retrieval, provenance-backed bounded context snapshots/preview, four workflow profiles, ACP v1 integration, independent review checks and explicit exact-artifact approval/application. Read-only recovery inspects committed state without replaying operations. Native Windows: typecheck/build PASS, **40/40 tests PASS**, real Electron smoke PASS with the host clipboard availability limitation reported separately. See [stage evidence](evidence/stage-03/README.md). Stage 0.4 follows: MCP/skills, browser, open-source documentation and distribution.

---

# Stage 0.2 — supervised execution — 2026-10-19

Implemented managed worktrees, Codex app-server, durable runs, streaming summary/activity, real process cancellation, explicit recovery, artifact capture and a task execution/review panel. Existing source repositories remain unchanged until the later apply step. Native Windows: build/typecheck PASS, full 33/33 suite PASS, runtime cancellation/dead-PID checks PASS, real Electron smoke PASS and installed app-server handshake/account-read PASS without inference. See [stage evidence](evidence/stage-02/README.md).

Current owner authorization includes all three roadmap stages, GitHub publication/merge and README. Earlier no-push/pause notes below are historical. ACP/context/apply and extensibility/distribution follow in stages 0.3 and 0.4. No paid model run or login was performed during implementation.

---

# Product UI polish — 2026-10-19

Implemented the owner's presentation-only brief. Full-height 256px sidebar, fixed 56px top bar, shared theme/spacing/type tokens, custom listboxes, compact composer and task rows, native modal task drawer, cancellation confirmation, feedback toasts, timeline, mobile navigation, keyboard shortcuts and copy-path action. No backend, data-model, IPC or dependency changes in this increment. Existing provider execution remains disabled.

Native Windows: typecheck/build PASS, 30/30 tests PASS, actual Electron smoke PASS, 2533 rendered text measurements over 75 screens PASS with no horizontal overflow. Both themes captured before/after at 1440/1024/390. Evidence, exact files and limitations: [UI polish](evidence/ui-polish/README.md). Independent review, screen-reader certification, installer and release QA remain pending.

---

# Workspace UI continuation — 2026-10-19

Owner resumed development after the handoff. Implemented the handoff's first recommendation: local Inter typography, neutral dark/light workspace, quieter project sidebar/composer, expandable technical details/journal, task title search/status filters with reset, per-project session input across tab/project switches, named dialogs and compact navigation/focus return. Fixed a startup preference/snapshot race found by real Electron QA.

Native Windows exposed an incomplete lockfile, DOS 8.3 path comparison in artifact capture, SQLite cleanup ordering in two tests and global autocrlf-dependent fixture bytes. Fixed without weakening worktree guards, changing schemas or upgrading dependency versions. Native Windows now passes typecheck, build, 30/30 tests, extended Electron smoke and 1986 text contrast measurements across 41 screens. Evidence, tested versions and limits: [workspace refresh](evidence/workspace-refresh/README.md).

No final logo selection, provider execution, patch application, secret storage, automation schedule changes, login changes, paid calls or remote push. Installer, updates, release certification and independent review remain pending. Next bounded increment is supervised isolated execution → artifact → independent review → human decision. Older entries below are history and do not override this checkpoint.

---

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

## Bounded isolated-worktree diff artifact capture — 2026-10-19

Completed NEXT_SLICE3.md as an internal main-process API (`Store.artifacts.capture/get`), without IPC or renderer additions. SQLite schema v4 transactionally adds immutable scoped diff artifacts. Each artifact stores project/task/current attempt, canonical repository/worktree paths, full base/target commit IDs, exact binary patch bytes (BLOB, nonempty, maximum 10 MiB), SHA-256 computed directly over those bytes, UUID and capture time. Existing approval records remain metadata only; no execution/apply/approval-consumption gate is enabled.

Capture accepts an **existing linked worktree** sharing Git common-dir with the project's configured repository; it does not create worktrees or run agents. Base/target must be full commit IDs; target must equal worktree HEAD. Ordinary repository worktrees, dirty tracked/index/untracked state, wrong repository/task/project/attempt, symbolic refs, empty diffs and supplied hashes are rejected. Git calls use asynchronous execFile without a shell, bounded buffers and 5-second per-command timeout, sanitized inherited Git environment, disabled external diff/textconv, explicit binary/full-index and formatting flags. Hash reproduction uses the persisted bytes directly; regeneration across Git versions/repository attribute/config changes is not claimed. Before/after clean/HEAD observations are checks, not filesystem locking or a TOCTOU-safe apply mechanism. Worktrees are not an OS security sandbox. Existing committed changes only are captured; ignored files are outside the artifact.

Tests use an actual temporary repository and detached linked worktree, CRLF and binary changes, repeated byte-for-byte captures and independent SHA-256 recomputation, invalid scope/attempt/ref/target/worktree/hash rejection, untracked-file rejection, SQL update/delete rejection and database restart equality. Prior migration test now verifies v2→v4 preservation. No UI success or independent review claimed. Windows remains **UNVERIFIED**.

Evidence: pre-edit snapshots and SHA-256 manifest in [before](evidence/diff-artifact/before/); initial [TDD red](evidence/diff-artifact/red.log) (missing API). An intermediate run exposed host `spawnSync git EPERM`; asynchronous execFile succeeded, so capture uses async calls. Final exact required sequence `npm run typecheck && npm test && xvfb-run -a npm run smoke`: typecheck **exit 0**, pretest production build **exit 0**, tests **29/29 PASS**, smoke **exit 1 before window launch**, `Process failed to launch!`. Logs: [typecheck](evidence/diff-artifact/typecheck.log), [tests](evidence/diff-artifact/tests.log), [smoke](evidence/diff-artifact/smoke.log). No launch-cause inference or sandbox workaround. Standard smoke-result.json regenerated by existing harness.

Changed implementation: new `src/main/artifacts.ts`, `src/main/store.ts`, `src/main/lifecycle.ts`, `tests/store.test.mjs`; documentation/evidence appended here. No dependency/config/auth changes, provider inference, apply, push or project Git initialization. Git initialization/commits in tests are confined to disposable temporary fixtures.

Next bounded step: supervisor reruns required checks on an Electron-capable host and reviews the artifact API/schema against snapshots. Future work must separately bind reviewed artifact identity to any approval/apply mechanism and handle filesystem races; this slice does not authorize those operations.

## Supervisor checkpoint — 2026-10-19T15:16:26+01:00
Slice3 niezależnie: typecheck PASS, 29/29, xvfb smoke PASS. Start NEXT_SLICE4.md (approval-artifact binding). Windows UNVERIFIED.

## Slice 4 — artifact-bound approval decisions — 2026-10-19

Completed the bounded internal model change from `NEXT_SLICE4.md`. `Approvals.decide` requires `artifactId`; the former caller-byte `record` API is removed. Caller-supplied `diff`, hashes and other unknown fields are rejected. Inside `BEGIN IMMEDIATE`, the API reads persisted artifact bytes scoped to project/task/attempt and the task's current attempt, recomputes SHA-256 over the exact BLOB and inserts an immutable decision with that artifact identity. A database insert trigger additionally rejects absent or mismatched artifact scope/attempt/hash. `matches` now requires the artifact ID as well as exact bytes, scope, current attempt, approved decision and unexpired timestamp. A separate artifact containing identical bytes cannot reuse the decision.

Schema v5 transactionally adds a nullable artifact foreign key and insert guard. Existing v4 approvals remain immutable historical records with `artifactId=null`; they are never implicitly rebound and cannot match. v1/v2/v3 upgrade paths continue through v4/v5; later schema versions remain rejected. Migration rollback is tested by forcing a trigger-name conflict after ALTER TABLE, checking that version 4, columns and historical records survive, then successfully migrating. Restart equality, v2 data preservation, missing/wrong-task/wrong-project/stale-attempt artifacts, expiry/rejection, caller input rejection, immutable records and real Git-captured binary/CRLF artifact binding are covered. SQL-seeded artifacts in isolated model fixtures are test data only.

Final required command sequence: `npm run typecheck && npm test && xvfb-run -a npm run smoke`:
- Typecheck **exit 0**: [typecheck.log](evidence/artifact-approval/typecheck.log).
- Tests **exit 0, 30/30 PASS**, including production pretest build: [tests.log](evidence/artifact-approval/tests.log).
- Smoke **exit 1 before first window**, `Process failed to launch!`: [smoke.log](evidence/artifact-approval/smoke.log). No UI success, screenshots or launch-cause inference claimed; no sandbox workaround attempted. Existing standard smoke-result.json regenerated as failed.

TDD red (missing `decide` and old schema) is in [red.log](evidence/artifact-approval/red.log). An intermediate test failure came from a separate SQLite connection retaining the old schema; the migration fixture now reopens that connection before checking the new insert trigger. Evidence retained in `intermediate-tests.log`. Pre-edit files/hashes and reviewable diff are in [artifact-approval](evidence/artifact-approval/). Self-review only; independent review remains pending.

Changed implementation: `src/main/approvals.ts`, `src/main/store.ts`, `src/main/lifecycle.ts`, `tests/store.test.mjs`; STATUS/KANBAN and evidence. No apply, execution, approval consumption, IPC/renderer, dependency, config, auth, provider inference, paid API or push changes. Approver remains a local attribution string, not authenticated identity. This model does not establish a filesystem race-safe apply gate. Windows remains **UNVERIFIED**. Stop this slice here. Next: supervisor reruns smoke on an allowed host and reviews the exact diff; any future apply/consumption design is a separate slice.

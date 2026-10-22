# Workspace refresh — native Windows evidence

2026-10-19. Continuation explicitly requested by the owner after the handoff pause.

## Scope

- Preserve Electron/React/TypeScript, existing SQLite schema and IPC trust boundaries.
- Use bundled local Inter; neutral dark/light surfaces, quieter project navigation, task-first composer, expandable task details and journal. The simple workspace glyph is not an approved final logo.
- Search task titles, filter by actual persisted status, clear filters, explain empty search results. Queued dependency/failure information stays visible without expanding details.
- Keep unsaved task text per project during the current renderer session, including across tabs and failed saves. Saving a draft persists it in SQLite. Unsaved text does not survive app restart.
- Compact project picker below 761px; selection returns keyboard focus to the toggle. Name both native dialogs. Prevent preference changes until the initial snapshot is loaded, fixing a reproduced startup race.
- Fix Windows DOS 8.3 path aliases with `realpathSync.native`, keeping exact canonical comparisons and all worktree rejection guards. Two migration test cleanups now close SQLite handles before removing directories. Git fixture explicitly sets `core.autocrlf=false` to preserve CRLF/binary test bytes independently of global config.
- Repair lockfile's absent `cssstyle/node_modules/cssom@0.3.8` entry; no dependency version upgrades or new UI libraries.
- Retain the [upstream Inter license](https://github.com/rsms/inter/blob/master/LICENSE.txt) in `public/licenses/Inter-OFL.txt`, copied by Vite into the renderer build. Verified bundled font metadata: Inter Variable 4.000, copyright The Inter Project Authors, OFL URL. No new font binary downloaded.

## Commands and actual outcomes

Host: native Windows (`win32`), Node **26.10.0**, npm **11.19.1**, Electron **43.1.0**. This is source-app validation, not installer or release certification.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS after the seven-line lockfile correction | 98 packages installed; baseline failure was `Missing: cssom@0.3.8 from lock file` |
| `npm run typecheck` | PASS | [typecheck.log](typecheck.log) |
| `npm test` (includes production build) | PASS, 30/30 | [tests.log](tests.log) |
| `npm run smoke` | PASS, real sandboxed Electron | [smoke.log](smoke.log), [smoke-result.json](smoke-result.json) |
| `npm run qa:contrast` | PASS, 1986 measurements, 41 screens, zero text failures or horizontal overflow | [contrast.log](contrast.log), [contrast/result.json.gz](contrast/result.json.gz) |

Baseline on this Windows host was 27/30 tests: two `EPERM` cleanup failures and `NOT_ISOLATED_WORKTREE`. After canonicalizing DOS aliases the Git fixture exposed an independent global `autocrlf` dependency (`WORKTREE_CHANGED`); fixing the fixture made all tests pass. Startup language selection also exposed an existing preference/snapshot race during contrast QA; disabled startup controls and a delayed-snapshot DOM regression cover it.

The DOM regression additionally covers failed saves retaining text, scoped session drafts, task search/status reset and the existing persistence, isolation, inert script text and deletion journeys. The real Electron smoke covers CRUD/restart, IPC rejection, sandbox settings, preferences, filters, cross-project draft retention, compact navigation/focus, long names with expanded details and reflow at 320/390/768/1280/1440. Earlier root `docs/evidence/desktop-*.png` and `smoke-result.json` were regenerated during initial Windows smoke runs; this folder contains the latest extended run.

Visually inspected actual renders: dark desktop, light desktop, 320px task layout and 390px native dialog. The contrast audit measures visible text/placeholders at 320/390/768/1280/1440 in both themes; disabled controls are exempt. It does not certify all interaction states, non-text contrast, native select popups, screen readers or overall WCAG conformance. Fixtures are temporary QA data; no providers execute tasks.

## Limits and next step

Self-review only; no independent agent review in this continuation. No installer, updates, minimum-Node-version run, paid API call, login change, execution/apply gate, secret storage, browser session integration or remote push. Existing historical Linux evidence is retained; this continuation was not rerun on Linux.

Next bounded implementation: a supervised, cancellable Codex run in an isolated worktree with redacted event streaming and durable attempt/result provenance, followed by independent review and artifact-bound human decision. Review supported CLI contracts before implementing; keep patch application a separate safety boundary.

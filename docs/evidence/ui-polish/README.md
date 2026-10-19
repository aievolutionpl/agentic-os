# Product UI polish — 2026-10-19

This increment implements the owner's UI brief on top of local commit `ff54ff609a173791d08feaa2e5d6fa51cf2ab3b7`. It changes presentation and interaction feedback; backend, SQLite schema, shared DTOs, IPC, package manifest and lockfile are unchanged.

## Implemented

- Local Inter with `cv11` / `ss01`, 14px base, shared color/spacing/type/radius tokens, one brand accent, neutral light/dark surfaces and reduced-motion support.
- Full-height 256px sidebar, project initials, one persistent New project entry, footer at the bottom and native modal navigation below 761px.
- 56px top bar with breadcrumb, actual local save status, custom language listbox and labelled theme icon. Project path chip copies the persisted path; errors receive feedback.
- Smaller composer with a minimum of three text lines, auto-resize, keyboard-accessible agent preference, role swap, empty-save disabled and `Ctrl+Enter` / `⌘Enter` save. Existing per-project session drafts remain intact.
- Task search with `/`, custom status listbox, compact rows, role initials, persisted status badges and relative timestamps calculated from real events. Click a title/row to open its native modal details drawer; the square icon is an open-details button, not a fake completion checkbox.
- Existing queue/retry/cancel/dependency actions use the same APIs. Cancellation needs confirmation. No Undo is offered because the existing domain API cannot reverse cancellation. No `Needs review` state was invented. An active lease is still labelled **Lease active**, rather than implying connected agent execution.
- Empty-state composer CTA, loading skeletons, dismissible lifecycle callout stored only as UI preference in localStorage, bottom-right action toasts and collapsible event timeline. Execution-disabled information remains visible in the composer even if the callout is dismissed.
- Custom listboxes support arrows, Home/End, typeahead, Escape, outside click and Tab. Native dialogs provide focus containment, Escape and return focus. Visible focus styles and icon labels/tooltips are included.

## Verification

Native Windows (`win32`), Node 26.10.0, npm 11.19.1, Electron 43.1.0. No dependency added or upgraded.

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, 30/30, includes production build |
| `npm run smoke` | PASS, real sandboxed Electron; [result](smoke/smoke-result.json) |
| `npm run qa:contrast` | PASS, 2533 text measurements over 75 screens, zero failures/overflow; [result](contrast/result.json) |
| `node scripts/ui-capture.mjs after` | PASS, six final screens; [result](after/result.json) |

The smoke preserves CRUD, project isolation, inert script text, persisted settings, restart and security checks. It additionally verifies custom-listbox keyboard movement/cancellation, focus return, `/` search, `Ctrl+Enter` save, actual system clipboard content, abandoned and confirmed cancellation, callout dismissal across reload, empty-state focus and long-name reflow. Reflow also covers 320/768/1280px; dialogs and dropdowns are measured at 320/390/768/1024/1440 in both themes.

Real keyboard testing exposed focus loss when controls were temporarily disabled during asynchronous preference saves. The renderer now restores focus only if the user has not moved elsewhere. The smoke asserts focus returns to the language control after saving. Copying uses a trusted synchronous `copy` event with explicit `text/plain`, without relaxing existing session permissions. Earlier diagnostics also found native clipboard write/read temporarily unavailable on this host, including direct main-process writes. The harness reports that baseline separately; the final run passed both the trusted UI payload and actual system readback (`nativeAvailable: true`).

Contrast measurement uses actual rendered foreground/background colors, alpha and group opacity. Disabled controls are exempt. The collector selects the upper confirmation dialog when a task panel is also open, covered by a DOM regression. This is text/placeholder ratio verification, **not full WCAG certification**: non-text contrast, screen readers and every possible interaction state require further review. Source-app testing does not certify an installer or minimum Node version. This increment was not rerun on Linux.

## Before / after

Captured before production UI edits and after the final build, from the same temporary SQLite fixture. Fixtures contain draft, queued and cancelled tasks; they do not represent agent execution. Each image is 960px high. Actual event timestamps differ between capture runs.

| Theme / width | Before | After |
| --- | --- | --- |
| Dark / 1440 | [PNG](before/dark-1440.png) | [PNG](after/dark-1440.png) |
| Dark / 1024 | [PNG](before/dark-1024.png) | [PNG](after/dark-1024.png) |
| Dark / 390 | [PNG](before/dark-390.png) | [PNG](after/dark-390.png) |
| Light / 1440 | [PNG](before/light-1440.png) | [PNG](after/light-1440.png) |
| Light / 1024 | [PNG](before/light-1024.png) | [PNG](after/light-1024.png) |
| Light / 390 | [PNG](before/light-390.png) | [PNG](after/light-390.png) |

Extra rendered states are under `contrast/`, including task panel, listbox, cancellation, new project, memory, integrations and mobile navigation. Visually inspected desktop, tablet, mobile panel and confirmation screenshots. Historical evidence under `workspace-refresh/` is retained.

## Changed files

| Files | Purpose |
| --- | --- |
| `src/renderer/main.tsx` | Shell, composer, preferences, memory/integrations presentation and feedback |
| `src/renderer/TaskBoard.tsx` (new) | Task rows, details drawer, filters, confirmations and timeline |
| `src/renderer/ui.tsx` (new) | Icons, custom listbox, native modal, viewport hook, role/time helpers |
| `src/renderer/style.css` | Tokens, themes, layout, component states and responsiveness |
| `src/renderer/i18n.ts` | Matched PL/EN microcopy; persisted language preference preserved |
| `scripts/smoke.mjs` | Real Electron journeys adapted to custom controls and drawer |
| `scripts/contrast-qa.mjs`, `scripts/contrast-dom.mjs` | Expanded rendered-state matrix and top-dialog collection |
| `scripts/ui-capture.mjs` (new) | Repeatable before/after capture fixture |
| `tests/ui.test.mjs`, `tests/lifecycle-ui.test.mjs`, `tests/contrast.test.mjs` | Preserve regression coverage with new controls and nested-dialog check |
| `README.md`, `HANDOFF_PL.md`, `docs/STATUS.md`, `docs/KANBAN.md`, this folder | Current capabilities, handoff and evidence |

No external UI component code was copied; existing React/CSS and bundled Inter/license were reused. No remote push. No paid calls, provider login changes, Hermes changes, execution/apply enablement or secret handling changes. Self-review only; independent review and owner visual feedback remain open.

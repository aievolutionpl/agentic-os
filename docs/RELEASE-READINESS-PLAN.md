# Release readiness work plan

Status: implementation in progress. No new official release is authorized.

## Existing foundation

The application already has a PTY terminal, provider adapters, chat history,
workspace policies, a deterministic routing preview, Polish/English documentation,
and responsive themes. Extend these components instead of replacing them.

## Delivery sequence

- [x] Inspect current changes and fetch main.
- [x] Confirm naming: Jev is the decision-model role; Antigravity uses the existing adapter.
- [ ] Complete responsive UI, theme, composer and voice regression checks.
- [x] Add explicit CLI installation with preflight, terminal output, exit status,
  cancellation, retry and post-install detection.
- [x] Improve installation/login/connection/first-task guidance and error states.
- [x] Add task-aware routing and optional Jev decision model. Validate choices
  against eligible candidates; preserve workspace policy and manual override.
- [x] Test invalid decisions, unavailable agents, timeout and bounded fallback.
- [x] Capture current UI evidence, update PL/EN documentation and changelog.
- [ ] Run typecheck, lint, tests, dependency audit and UI suites.
- [ ] Push a reviewable PR, check CI (including Windows package), merge only green.

## Constraints

No automatic install at startup. No credential scraping or invented model IDs.
No silent paid fallback. Jev cannot change permissions. A terminal opening does
not prove installation; a connection check does not prove a successful real task.
Do not publish release installers during this work.

## Sources and design decisions

- Codex CLI: https://learn.chatgpt.com/docs/codex/cli
- Claude installation: https://code.claude.com/docs/en/setup
- Antigravity installation: https://antigravity.google/docs/cli/install/
- https://github.com/chaseai-yt/claudex-loop — independent review and bounded
  handoff are conceptual references; no code copied.
- https://github.com/farion1231/cc-switch — provider switching is a conceptual
  reference; preserve this application's adapter architecture; no code copied.

Use the official login flow. Subscription access and separately billed API access
must remain distinct. Installation commands are maintained in one backend catalog.

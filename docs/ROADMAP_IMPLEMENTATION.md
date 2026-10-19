# Three-stage implementation

Owner authorization (2026-10-19): finish UI, implement the previously proposed 0.2 / 0.3 / 0.4 stages sequentially, publish the complete changes on GitHub and merge them, including a project README. This supersedes earlier pause/no-push instructions. Existing user work and security boundaries remain in force.

## 0.2 — execution and review

Managed Git worktrees; durable supervised runs; Codex app-server adapter; normalized/redacted activity; cancellation, timeout and explicit recovery; independent reviewer adapter and artifact review UI. Run starts are explicit user actions. No paid inference or account login is needed to develop/test the protocol.

Acceptance: real Git/SQLite tests, local protocol fixture tests, read-only installed app-server handshake, Electron UI checks. Clearly distinguish protocol tests from real model inference.

## 0.3 — collaboration and context

Project-scoped source-backed memory retrieval, bounded context snapshots, workflow templates, additional ACP adapter, and exact artifact approval/application with conflict/changed-base checks. No automatic fallback or automatic apply.

Acceptance: cross-project isolation, context budgets/provenance, interrupted-run recovery, tampered/stale/rejected approval denial, real temporary-repository apply tests.

## 0.4 — extensibility and distribution

Explicitly trusted project-scoped MCP stdio tools, isolated persistent browser, versioned skill catalog, open-source governance, Windows packaging and Windows/Linux CI. Preserve third-party licenses and distinguish unsigned test builds from a signed production release.

Acceptance: MCP contract fixtures, browser IPC/permission isolation, extension input validation, full regression suite, native Windows package smoke and public PR checks before merge.

## Delivery

Publish all local UI work and the three stages in a reviewable feature PR. Update README around implemented behavior, setup, architecture, privacy, provider support and limitations. Never include user profiles, credentials, databases, node_modules or build output in Git. Attach the PR to this chat, merge only the tested head, then confirm the remote main commit.

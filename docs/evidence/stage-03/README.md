# Stage 0.3 — context, collaboration and approved application

Native Windows: typecheck/build PASS; **40/40** tests PASS; actual Electron smoke PASS. System clipboard baseline was temporarily unavailable in this smoke profile; the trusted UI copy event and exact payload passed, while system readback is explicitly unverified in its JSON result.

Implemented SQLite FTS5 project-scoped retrieval with transactional index triggers; explicit source/date-backed context selection and preview; a hard 24,000-character budget that rejects oversized context instead of silently dropping it; implementation/bugfix/research/UI-audit workflow profiles. Context is frozen in the run record before provider execution. Research/audit use read-only Codex sandbox policy.

ACP v1 supports a separately installed, explicitly trusted compatible bridge in the Claude role. It validates protocol compatibility and resume capability, requires an advertised read-only mode for review, and denies permission requests and host filesystem/terminal capabilities. **ACP processes are trusted local code and must enforce their own OS isolation**; selecting a protocol mode is not a host-provided security boundary. The configured role does not cryptographically establish provider/model identity. No account was signed in and no real model inference was performed by this development run.

Applications require a completed independent review, a human approval of the exact immutable artifact, a separate explicit apply action, a current task attempt, matching Git bytes/hash, a clean unchanged source base and a fast-forward. Hooks/filters are disabled; ignored local files are not overwritten. Protected credential paths, symlinks/submodules and recognized credential-like diffs fail closed. Repeated successful application is idempotent. Startup reconciliation reads commit state without replaying apply.

New regressions exercise real Git/SQLite for exact application, rejected/stale/expired decisions, dirty/changed source, protected files, a reviewer that writes, ignored-file collisions, context scope/budgets/index deletion and an actual database close/reopen followed by explicit resume. A real stdio ACP fixture verifies read-only negotiation and permission rejection. Fixtures are protocol conformance tests, not authenticated model-quality validation.

Sources: [ACP v1](https://agentclientprotocol.com/protocol/v1/initialization), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [SQLite FTS5](https://sqlite.org/fts5.html). Original implementation; no upstream application source copied.

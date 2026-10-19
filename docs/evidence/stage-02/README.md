# Stage 0.2 — supervised execution foundation

Implemented managed worktrees, shell-free bounded JSON-RPC processes, Codex app-server, durable runs/activity, lease heartbeat, explicit cancellation and crash recovery, artifact capture, independent review entry point and execution UI. Provider configuration requires explicit trust; Codex uses an application-owned profile and fixed host-managed arguments. No secrets are copied from another app or exposed through IPC.

Native Windows verification: typecheck/build PASS; full suite 33/33 PASS; additional runtime rerun 3/3 PASS after adding a real dead-PID assertion for cancellation. Actual Electron smoke PASS. The installed `codex-cli 0.160.1` initialized and handled `account/read` with an empty temporary `CODEX_HOME`: [probe](protocol-probe.json). No login, inference or paid call was performed. Runtime fixtures are explicitly synthetic protocol servers operating on actual temporary Git repositories and SQLite; they are not model-quality or authenticated-provider proof.

Source repository files and HEAD stay unchanged during a run; only its managed worktree is sealed and captured. Permission-escalation requests are denied. Recognized credential patterns are redacted; arbitrary sensitive project content cannot be automatically guaranteed secret-free. Raw provider stderr and command output are not persisted.

Stage 0.3 adds the ACP reviewer implementation, bounded sourced context, templates and exact approved application. Stage 0.4 adds extensibility and native distribution. The earlier UI-only screenshot comparison remains under `ui-polish/before` and `ui-polish/after`; smoke screenshots there were regenerated when testing this increment.

Protocol references: [official Codex app-server](https://learn.chatgpt.com/docs/app-server), generated local schemas from the tested CLI. Implementation is original TypeScript; no upstream application code copied.

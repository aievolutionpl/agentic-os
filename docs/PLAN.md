# Implementation plan

## Current version: 0.4.0

The owner's three-stage continuation is implemented: supervised execution (0.2), scoped context/ACP/exact apply (0.3), and MCP/skills/browser/distribution (0.4). See [authoritative scope](ROADMAP_IMPLEMENTATION.md), [README](../README.md) and [0.4 verification](evidence/release-04/README.md). The earlier sequence below is retained as history.

Next: authenticated compatibility runs against actual providers; signed Windows builds with install/upgrade/uninstall testing; OS-level isolation for third-party executable adapters. No background schedule, automatic paid fallback, cloud account sync or automatic publishing has been added to the application.

## Current continuation — 2026-10-19
Workspace UI refresh and native Windows verification implemented. Keep the existing architecture; use local Inter and semantic CSS tokens. Task search/status filters, per-project session input, expandable details/journal and compact project navigation are working. Lockfile, Windows canonical paths, test cleanup and initial preference loading were repaired. See `docs/evidence/workspace-refresh/README.md` for exact checks and limits.

Next: supervised isolated Codex execution with cancellation/redacted streaming, then independent review of the persisted artifact and human decision. Verify current official CLI contracts first. Do not enable patch application, paid fallback or unattended external actions as part of that increment.

## Original implementation sequence
1. Inspect requirements, skills, available OSS/dependencies and record architecture evidence.
2. Write failing persistence/validation/isolation tests before domain implementation.
3. Implement SQLite service, narrow IPC and secure Electron shell.
4. Build bilingual project/task/memory workspace with settings and honest integration matrix.
5. Run tests, typecheck, build and browser/desktop smoke; record exact outcomes.
6. Next slice: official Codex and Claude read-only capability probes, then isolated worktree execution and reviewed diff approval. Persistent Chromium and curated skill catalog follow with explicit remote trust boundaries.

Design: operator at a Windows laptop reviewing client work, dark navy default with light alternative. Structured productivity layout selected over dark minimal (less navigation context) and editorial (less task density). Palette #0c1020 / #151a2a / #1d2536 / #f1f5f9 / #aab6ca / #6875f5. Segoe UI native typography, left-aligned content, restrained indigo, one prominent task composer, quiet status rows. No synthetic operational metrics.


## NEXT_SLICE override — completed 2026-10-19
The requested next increment superseded the previous probe-first order: implement durable lifecycle and journal before adapters. Shipped schema v2, scoped DAG/readiness, transactional attempts/events, fenced leases/heartbeat/expiry and bounded explicit retry; UI uses persisted state. Tests, typecheck and build pass. See ADR 002 and current STATUS for evidence and exact next step. Execution stays disabled. No broad rewrite or additional provider work in this slice.

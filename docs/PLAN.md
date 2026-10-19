# Implementation plan
1. Inspect requirements, skills, available OSS/dependencies and record architecture evidence.
2. Write failing persistence/validation/isolation tests before domain implementation.
3. Implement SQLite service, narrow IPC and secure Electron shell.
4. Build bilingual project/task/memory workspace with settings and honest integration matrix.
5. Run tests, typecheck, build and browser/desktop smoke; record exact outcomes.
6. Next slice: official Codex and Claude read-only capability probes, then isolated worktree execution and reviewed diff approval. Persistent Chromium and curated skill catalog follow with explicit remote trust boundaries.

Design: operator at a Windows laptop reviewing client work, dark navy default with light alternative. Structured productivity layout selected over dark minimal (less navigation context) and editorial (less task density). Palette #0c1020 / #151a2a / #1d2536 / #f1f5f9 / #aab6ca / #6875f5. Segoe UI native typography, left-aligned content, restrained indigo, one prominent task composer, quiet status rows. No synthetic operational metrics.


## NEXT_SLICE override — completed 2026-10-19
The requested next increment superseded the previous probe-first order: implement durable lifecycle and journal before adapters. Shipped schema v2, scoped DAG/readiness, transactional attempts/events, fenced leases/heartbeat/expiry and bounded explicit retry; UI uses persisted state. Tests, typecheck and build pass. See ADR 002 and current STATUS for evidence and exact next step. Execution stays disabled. No broad rewrite or additional provider work in this slice.

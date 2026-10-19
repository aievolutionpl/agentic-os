# Plan v3 changelog

## 2026-10-19 — v3.0 and first implementation slice
- Plan v3 written; decision: evolve 0.4.0 instead of rebuilding.
- Implemented (stage 0.5, slice 1): `src/main/connectors.ts` registry + scan, `connectorScan` IPC, Control Center UI (EN/PL), exact local run counters, Windows `.cmd` shim fix for CLI probes.
- Deviation from plan chapter 4.3: no connection wizard, smoke test or login action yet; detection only. `ready` is defined as detected + signed in + execution adapter in this build, and the UI states that no smoke test was run.
- Claude Code is reported `experimental / bridge_required` (the CLI is not an ACP server); this matches the README's provider table.
- Antigravity stays `unsupported` even when installed, until an official stable headless mode is proven.

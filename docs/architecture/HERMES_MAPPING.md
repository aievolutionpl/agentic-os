# Hermes mapping — inspection 2026-10-19

Inspected revision: `b3710e60823f108945fce9804201fb3b001a716c` (local source may include local changes).

Read-only reference root: `/home/aibot/.hermes/hermes-agent`. Read `LICENSE`: MIT, copyright 2025 Nous Research. No source copied, imported or executed. No runtime DB, credentials, private memory, configuration or cron contents accessed. Implementation is original TypeScript within the existing Electron/React/SQLite app.

| Area | Inspected source (relative to reference root) | Mapping and scope |
|---|---|---|
| Provider adapters | `hermes_cli/runtime_provider.py` | Central resolution separates backend selection. Proposed separate capability-checked adapters; current app remains unconfigured, no inference. |
| Task graph | `hermes_cli/kanban_db.py`, `kanban_db_context.py` | Parent context and prior attempts inform durable collaboration. This slice: same-project dependency DAG, readiness computed from completed prerequisites. |
| Leases / heartbeats | `hermes_cli/kanban_db_connect.py`, `hermes_cli/kanban_db.py:2143–2370` | SQLite transactional ownership. This slice: atomic claims, attempt token fencing, expiry and heartbeat; no worker dispatcher. |
| Shared scoped memory | `tools/memory_tool_store.py` | File-backed memory reference is not proof of our workspace ACL. Existing app's project-scoped SQLite memory preserved. Rich scopes/retrieval proposed. |
| Skills registry | `tools/skills_tool_plugin.py` | Discovery and supporting skill files. Curated source/license registry proposed, not implemented. |
| Durable events | `hermes_state_timeline.py`, `hermes_cli/kanban_db_context.py` | Snapshot-consistent timeline and attempt context. This slice: transactional task events, attempt number, timestamps, structured failure codes; no provider transcript. |
| Approvals | `tools/write_approval.py` | Staged memory/skill writes are distinct from exact-diff approval. Exact-diff review/apply remains proposed; execution disabled. Do not inherit permissive defaults. |
| Retry / fallback | `agent/turn_retry_state.py`, `agent/retry_utils.py` | Bounded attempt flags and retry delay helpers. This slice: explicit retry, max 3 claims, no automatic retries or provider fallback. |

## Implemented slice contract

Schema v1 drafts migrate without losing projects, tasks, preferences or memory. Statuses: draft → queued → running → completed/failed; draft/queued/failed → cancelled. Running is internal lease metadata, never evidence of provider execution. Expiry records failed/lease_expired, never silently reclaims. Explicit retry returns failed → queued; dependencies are rechecked on claim. Dependencies editable only in draft, cycle checked. Every mutation and corresponding event commit together. A fresh random lease token fences earlier attempts even when owner name repeats.

Only queue/cancel/retry/dependency editing and reads cross renderer IPC. Claim/heartbeat/finish stay in the internal domain, with no production caller until adapters and approval policy exist. No start button or execution simulation. Project is the existing workspace isolation unit. Structured codes avoid arbitrary provider output/secrets in the journal. SQLite is local metadata, not encrypted or tamper-proof against the OS user.

Review triage: astra-review identified stale smoke PASS risk (fix first); remaining IPC/Windows/visual acceptance gaps remain open. qa.md concerns vendored tools outside this app; none are invoked. claude-review.json is a failed prompt-too-long invocation, not an independent approval.

Implementation detail and limits: [ADR 002](../adr/002-task-lifecycle.md). No Hermes source or runtime state was modified.

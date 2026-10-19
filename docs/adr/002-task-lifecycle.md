# ADR 002 — durable lifecycle without execution

2026-10-19, accepted for bounded slice.

Keep the existing Electron, React, SQLite and narrow preload API. Do not introduce a scheduler/provider process before isolated execution and exact-diff approval exist.

Schema v2 rebuilds the draft-only task table transactionally; original IDs and content survive. Existing drafts receive an `imported` event (not a fictional execution). Schema initialization and migration hold SQLite write transactions; unsupported future schemas fail closed.

Lifecycle: draft → queued; queued → running via internal claim; running → completed/failed via matching owner + random token and unexpired lease. Draft/queued/failed may be cancelled. Failed → queued requires explicit retry and fewer than three prior claims. No running cancellation until a real process supervisor can prove termination. Completed means domain outcome supplied by a future trusted adapter; the UI cannot set it. No execution adapter or caller is wired in this slice.

Dependencies are scoped task IDs, editable only before queueing; duplicates, self-reference, foreign projects and cycles are rejected. Queued readiness is derived from persisted completed prerequisites, and checked again under the claim transaction. A cancelled/failed prerequisite keeps its dependents blocked. No automatic dependency retry/cancellation propagation.

Each claim increments attempt and creates a new token. Heartbeat cannot revive expiry or shorten an existing lease. Terminal/expiry changes remove active lease fields and append a structured event in the same transaction. Reads never return lease tokens. Expiry recovery occurs on project-data refresh (including initial selection after restart), not a background scheduler. Expired outcomes are uncertain and never automatically rerun. Retry merely records intent. Future adapters must reconcile possible external side effects before actual execution.

Journal records have monotonically increasing sequence, task/project, attempt, actor, timestamp, kind and allowlisted failure code. Dependency changes and claim/heartbeat expiries have structured details. No provider output, credentials or secret environment is ingested. Prior failure events survive retry. Application exposes no event rewrite/delete API; this is not a tamper-proof audit system against direct DB access.

Project-data reads use a transaction after expiry recovery so task state and journal agree. UI refresh is explicit; live subscriptions/pagination are deferred. Project remains the existing workspace privacy unit; multi-user ACLs are not claimed.

Alternative: scheduler, provider adapters, full graph editor, approval workflow and automatic fallback in one change. Rejected as outside bounded slice. No new package dependencies. Rollback needs a database backup: v1 app intentionally rejects schema v2, avoiding silent loss of lifecycle history.

Verification: tests/lifecycle.test.mjs and tests/lifecycle-ui.test.mjs plus every existing test. Native Electron/Windows gates remain open.

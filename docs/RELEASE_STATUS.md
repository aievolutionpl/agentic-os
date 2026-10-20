# Release status — single source of truth

This is the only document that states the **current** release status. Everything else (`docs/RELEASE_GATES.md`, `docs/STATUS.md` history, `HANDOFF_PL.md`, the root `BUILD_BRIEF.md` / `NEXT_*.md` / `WORKER_RESULT.md` briefs, audits and evidence folders) is a dated historical record. If they disagree with this page, this page wins; if this page disagrees with CI on the current commit, CI wins.

**How status is determined:** by the GitHub Actions `CI` workflow on the exact commit (`verify` on Windows and Linux, Electron smoke, `npm audit`, unsigned Windows installer build). A status claim without a commit SHA and a CI run is not a release claim.

## Current: 0.4.x early release (not 1.0)

| Area | State | Evidence |
| --- | --- | --- |
| Automated tests, typecheck, Electron smoke (Windows + Linux) | Gated by CI on every PR and `main` push | `.github/workflows`, Actions run of the commit |
| Unsigned Windows NSIS installer | Built and uploaded by CI | Actions artifact |
| Signed installer, install/upgrade/uninstall QA in a clean profile | **Not done** | Roadmap v4 / V4.5 |
| Auto-update channel | **Not provided** (only after signing and lifecycle QA) | — |
| OS-level isolation of trusted ACP/MCP processes | **Not provided** | `SECURITY.md` |
| Manual queue survives restart without replay | Implemented (schema v13) | `tests/orchestration-journal.test.mjs` |
| Per-provider capability evidence (detected / profile / sign-in / handshake / real run / roles) | Implemented (schema v14), shown in Control Center | `tests/capabilities.test.mjs` |
| Operator inbox (cross-project decisions), Ctrl/Cmd+K palette, Control Center "Right now" | Implemented, read-only aggregation | `tests/attention.test.mjs` |
| Backup, staged restore (undoable) and redacted diagnostics | Implemented | `tests/backup.test.mjs` |
| Real provider inference | **Per machine, per provider.** Never inferred from configuration. Automated tests make no model calls | Control Center → *Verified capabilities*; `docs/SUBSCRIPTION_CONNECTIONS.md` for dated manual sessions |
| Provider quotas | Codex official data and OpenRouter key budget only; other subscriptions show **Unknown** | OpenQuota |

## Meaning of capability states

- **Detected** — an executable was found by a fixed read-only version probe.
- **Profile** — the user explicitly saved an execution profile with consent.
- **Sign-in** — `Reported by CLI` comes from the provider's own status command; `Verified` only from an explicit connection check in this app.
- **Handshake** — the last explicit connection check (protocol initialize / account read / model catalog). It never runs inference.
- **Real run** — at least one run of this provider actually finished (completed, awaiting review, applied or rejected) on this machine. Interrupted and cancelled runs do not count.
- **Verified** — handshake passed **and** a real run finished. Anything less is shown as `Unverified`, `Needs sign-in`, `Needs connection` or `Not installed`.

## 1.0 gate (Roadmap v4)

Zero unresolved critical/high security or change-integrity issues; fresh install and upgrade tests; signed installer; an explicit matrix of supported providers and modes. See [Roadmap v4](ROADMAP_V4.md).

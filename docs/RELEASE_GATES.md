> **Historical record.** Current release status: [docs/RELEASE_STATUS.md](RELEASE_STATUS.md). This file is kept unchanged as an audit trail.

# Release gates (controller verification, 2026-10-19)

Verdict: NOT RELEASABLE. Nothing was published or pushed.

## Re-run by controller (not copied from the worker)
- npm run typecheck: PASS
- npm test (pretest build): PASS, 6/6
- src/ scan for shell=true / child_process exec: none (only SQLite db.exec)

## Review reports
- team/qa.md: reviewed the plan and vendored tooling only, not the app. Medium finding F1 (with_server.py shell=True) is in vendored tooling, not in app/src. Not applicable to the app; do not use with_server.py with untrusted input.
- team/integrations.md: provider quotas are unverified (live Codex limits, OpenRouter /credits, Antigravity). The app correctly shows quota as unknown.
- team/astra-review.log: INCOMPLETE (stopped after the file listing). No findings.
- team/claude-review.json: FAILED (terminal_reason prompt_too_long). No findings.
=> No independent review of the app exists. Rerun both with a smaller prompt.

## Gates
| Gate | State |
|---|---|
| typecheck / build / unit tests | PASS |
| Real Electron launch + E2E (AT-U1) | BLOCKED: Chromium cannot start in this sandbox |
| Contrast and tap-target measurement | NOT DONE (needs a real browser) |
| AT-S1..S8, AT-F1..F6 | Not covered; the app has no agent execution yet |
| AI-disclosure footer (AT-U2) | MISSING: no disclosure text found in src/ |
| Independent review | MISSING |
| Native Windows | UNVERIFIED |

## Native Windows procedure (run by hand on Windows 11)
1. Node >= 22.16. Copy the repo to C:\work\agenting-os (not a WSL path).
2. npm ci; npm run typecheck; npm test; npm run smoke
3. npm start with a fresh userData directory. Create a project and a draft, add a memory entry, restart, and check they persist. Switch PL/EN and light/dark.
4. Check on tablet and phone widths: tap targets, contrast >= 4.5:1.
5. Save screenshots and logs to docs/evidence/windows/.
6. Packaging and installer are not done. Add them only after steps 1-5 pass.

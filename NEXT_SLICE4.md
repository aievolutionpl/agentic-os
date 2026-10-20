> **Historical record.** Current release status: [docs/RELEASE_STATUS.md](docs/RELEASE_STATUS.md). This file is kept unchanged as an audit trail.

# Slice 4
Bind approval records to diff artifacts: Approvals.decide must reference an artifact id and take the hash from stored artifact bytes (never caller-supplied); reject on artifact scope/attempt mismatch. Schema v5 transactional migration, TDD tests, no apply/execution/IPC/deps/config/auth/push. Run: npm run typecheck && npm test && xvfb-run -a npm run smoke. Append evidence to docs/STATUS.md; Windows stays UNVERIFIED.

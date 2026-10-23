# Harness context studio — local evidence

Verified on Windows, Node 26.10.0, 2026-10-23. Synthetic local fixtures, no live model requests or provider login changes.

| Check | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, 0 errors; 43 existing warnings |
| `node --test --experimental-test-isolation=none tests/*.test.mjs` | 243 passed, 0 failed, 0 skipped |
| `npm run qa:harness-studio` | Passed; real Electron, SQLite, IPC and clipboard |
| `npm run release:audit` | Passed |

[Native UI report](ui-result.json) covers instruction save/conflict/recovery, scoped recall, preview invalidation, keyboard access, explicit project export, PL/EN, tool navigation, 320/390/768/1440 reflow and measured text contrast. [Screenshot](../../images/harness-context.png).

The first regression pass caught the frozen-context parser's requirement that `Workflow:` remain the first line. That contract is preserved and explicitly tested. A Windows wait budget was adjusted for native Git worktree operations; no production timeout or approval gate was loosened. Existing lint blockers in the GitHub process cleanup and MCP JSON editor were corrected.

Live subscription inference, arbitrary third-party models and signed installer distribution are outside this evidence. CI checks the exact pull-request commit separately on Linux and Windows.

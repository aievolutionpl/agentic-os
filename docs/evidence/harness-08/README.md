# Harness verification — Windows, 2026-10-19

| Evidence | Scope |
| --- | --- |
| `tests.log` | Final automated regression suite, including build and chat/memory/quota boundaries. |
| `typecheck.log`, `build.log`, `audit.log` | TypeScript, production bundle and dependency audit. |
| `smoke.log`, `smoke/` | Native Electron application/IPC smoke checks. |
| `ui/result.json`, `ui/*.png` | New chat, memory, skills, connection and quota flows; 30 theme/size captures with rendered text contrast and overflow checks. Provider responses/limits here are deterministic fixtures. |
| `workspace/result.json`, `workspace/*.png` | Regression across 24 existing workspace views under the new font/theme. |
| `tools/result.json`, `tools/*.png` | Real Electron MCP/extension/project-browser UI checks using local fixtures. |
| `live/result.json`, `live/live-conversation.png` | Real Codex and Claude subscription conversations with history, ordinary local directory reading, public GitHub clone and official Codex limits. |

Reproduce without model calls: `npm run typecheck`, `npm test`, `npm run smoke`, `npm run qa:tools`, `npm run qa:workspace`, `npm run qa:harness`. On Linux use Xvfb as configured in CI. Existing QA scripts accept `AGENTING_QA_OUTPUT` where supported; their historical default evidence paths are not a release date assertion.

Opt-in live check: set `AGENTING_SUBSCRIPTION_SMOKE=1`, then run `node scripts/live-chat-smoke.mjs`. It requires installed, authenticated Codex and Claude plus `gh`; it consumes their normal model allowance, uses temporary source files and clones the public octocat/Hello-World fixture. It does not push, edit the source fixture or install runtimes. The live script is intentionally excluded from CI.

Measured contrast is not a complete accessibility certification. A CLI/ACP connection probe is not proof of model access. See [audit and limitations](../../HARNESS_AUDIT.md).

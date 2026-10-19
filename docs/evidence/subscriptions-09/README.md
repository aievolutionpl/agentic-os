# Subscription verification — 2026-10-19

| Evidence | Scope |
| --- | --- |
| `tests.log` | Full 80-test regression suite and production build. |
| `typecheck.log`, `smoke.log` | TypeScript checks and actual Electron IPC/security smoke. |
| `workspace/result.json`, `workspace/*.png` | Existing 24 theme/size UI views, including provider setup; contrast/overflow checks. |
| `harness/result.json`, `harness/*.png` | Existing 30-view chat/memory/skills/connection/quota regression. |
| `live/result.json`, `live/*.png` | Actual Hermes ChatGPT/Codex and Antigravity Google model conversations through native Electron IPC, two turns each, persisted model settings and Gemini consumer-deprecation handling. |

The live test uses existing CLI sign-ins, temporary app data and a small test marker. It records no API keys, OAuth payloads, private source files or full account metadata. Browser callback URLs, auth codes and private installation/debug logs are deliberately excluded from the evidence.

See [connection report and primary sources](../../SUBSCRIPTION_CONNECTIONS.md) for the Google consumer-account migration and integration boundaries. Fixture-only tests and actual subscription inference are separate validation layers.

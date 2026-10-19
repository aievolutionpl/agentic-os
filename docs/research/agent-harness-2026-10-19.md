# Agent harness integration decisions — 2026-10-19

Primary sources were reviewed while extending the existing repository. No entire reference application was imported.

| Source | Applied decision |
| --- | --- |
| [Hermes ACP](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp) | Reuse `hermes acp` and the existing Hermes profile. Probe initialize/session/new without model inference; display available model names. Offer `hermes acp --check` diagnostics. Do not invent a read-only mode. |
| [Hermes native Windows](https://hermes-agent.nousresearch.com/docs/user-guide/windows-native) | Discover `%LOCALAPPDATA%\hermes\bin\hermes.exe` in addition to PATH and common user installations. Do not require WSL by default or download an installer silently. |
| [Agent Skills specification](https://agentskills.io/specification) | Expose inspectable SKILL.md instructions, explicit selection and source/version/license metadata. This release imports a single Markdown file, not every optional resource supported by the wider specification. |
| [obra/superpowers](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3) | Bundle systematic-debugging, verification-before-completion and test-driven-development at this immutable revision. Preserve the MIT license in every resource directory. No bundled script or upstream auto-install hook runs. |
| [Impeccable](https://github.com/pbakaus/impeccable) | Reference for UI craft and focused design guidance. No source copied; the application keeps its original frontend/accessibility skills and supports local imports. |
| [Codex app-server](https://developers.openai.com/codex/app-server/) | Continue the existing official account/limit/thread contract. Reuse CLI-owned sign-in, isolate supervised thread features and preserve global user configuration. Automatic quota polling requests no model completion. |
| [OpenRouter key limits](https://openrouter.ai/docs/api-reference/limits) | Continue using key-budget readings. Treat API credit and subscription allowances as different units and never manufacture token equivalents. |

The implementation follows the existing local-first architecture: Electron main owns process execution, SQLite, credentials and filesystem access; React accesses an explicit, trusted-frame IPC allowlist. Chat is a new persistent controller over the existing Supervisor and provider adapters, rather than a second execution stack.

The earlier [workspace research](agent-workspace-2026-10-19.md) and [Master research](master-agent-2026-10-19.md) cover comparison with Orchestrator, Paperclip, CC Switch and the supervised delegation model.

Live verification on this computer found Codex and Claude authenticated and functional. Gemini's installed package metadata reported 0.1.4 and its distribution had no ACP implementation. Hermes was not detected; its documented integration is implemented but live model execution remains unverified.

# Provider support and skills

The live-provider statements below describe historical checks linked in [HARNESS_AUDIT.md](HARNESS_AUDIT.md) and [SUBSCRIPTION_CONNECTIONS.md](SUBSCRIPTION_CONNECTIONS.md). They were not repeated in the 0.5.0-rc.1 Linux workbench audit. Availability depends on your installed CLI, account and model. Current readiness is shown inside the app.


| Connection | Implemented | Validation / limitations |
| --- | --- | --- |
| Codex app-server | Threads, streaming, steering, cancellation, browser sign-in, existing/isolated profiles, official rate-limit windows | Real subscription read-only file task, local CLI/account probe and protocol fixtures pass. Exact token allowances are not inferred from percentages. |
| Claude Code native CLI | Streaming JSON, CLI-owned login, resume, file reading/editing and read-only reviews | Real subscription read-only file task, auth status and protocol fixtures pass. Requires a CLI supporting `--safe-mode`; shell tools and ambient MCP are disabled. Automatic quota reading is unavailable. |
| Claude / ACP v1 | Compatible ACP bridge, sessions, cancellation, read-only review mode | Legacy configurable bridge retained; fixture-tested. An ordinary `claude` executable is not an ACP server. |
| Gemini CLI / ACP | Native `--acp`, Google OAuth, npm-declared Windows entrypoint and trusted system certificates | CLI 0.64.0 verified. Google no longer serves personal AI Pro/Ultra through Gemini CLI: the app reports migration to Antigravity. Supported organizational Code Assist accounts remain a distinct path; enterprise inference was not tested. Read-only roles require advertised `plan` mode. |
| Hermes / ACP | Native Windows managed-Python bootstrap, `hermes acp`, official ChatGPT/Codex sign-in and session-specific model selection | Real two-turn subscription chat passes with `openai-codex:gpt-6.1-sol`. Explicit app model selection required; global Hermes model is preserved. Worker/chat role only; no read-only guarantee is claimed. |
| OpenCode / OpenRouter | Existing ACP agent loop, model selection, encrypted API key, public model catalog, per-key budget | ACP/vault fixtures and public catalog probe. OpenCode and an API key are required for real inference; no authenticated OpenRouter inference was performed. |
| Local LLM / OpenCode | Separate ACP profile with an explicit OpenAI-compatible loopback endpoint and model; Ollama / LM Studio presets can be entered | Configure `http://127.0.0.1:11434/v1` or `http://127.0.0.1:1234/v1`, model ID and the OpenCode executable. No OpenRouter key is injected. Not live-verified with a local model; server/model compatibility and sufficient context are required. A loopback server can itself route to cloud models; locality depends on its configuration. |
| Antigravity CLI | Official `agy` streaming input/output, OS-keyring Google login, selectable models and cancellation | Native CLI 1.4.2: real two-turn Google model chat passes with `gemini-4-argon-medium`. This is the consumer subscription path replacing Gemini CLI. Read-only/reviewer and resume roles remain rejected. Automatic quotas are unavailable. |
| MCP stdio | Protocol `2025-11-25`, tool pagination, explicit manual calls, bounded text results | Fixture-tested. No HTTP transport, model-driven calls, sampling, elicitation or background execution. Servers validate their argument schemas. |

Read-only installation probes are separate from these execution connections. Authentication and subscription quota are not inferred from installed command names; quota remains **unknown** when no authoritative source is available.

Master and review roles support Codex, Claude, Gemini, OpenCode and the local OpenCode profile when their read-only mode works. Hermes and Antigravity remain implementation-only. ACP permission prompts may authorize one located file edit inside the worktree; outside paths, Git metadata, hardlinks and terminal requests are denied. ACP executables are trusted local programs, not an OS sandbox supplied by Agenting OS.

Codex reads effective configuration through its official app-server, disables ambient MCP/apps/plugins/hooks and internal multi-agent spawning for the supervised thread, and checks runtime MCP status before inference. These overrides do not edit the user's global CLI configuration or copy credentials. Older servers without these contracts fail closed. The same bounded policy applies to existing-profile worker runs and reviews.

## Context and extensions

Memory defaults to its project. An explicitly shared entry is searchable and selectable across the workspace; project-private entries cannot be selected from another project. Selected entries and explicitly pinned entries are included in subsequent contexts. Pinning a workspace entry makes it automatic across projects; pinning a private entry affects its project only. The frozen context retains source, date and scope, is reused for review, and is limited to 20 memory entries and 24,000 characters including skills. This is a single local workspace database, not cloud synchronization between computers.

Four workflows are included: implementation, bug fix, research and UI audit. Research/audit request read-only execution. Six original text skills cover frontend design, source-grounded research, workspace memory curation, evidence-based review, accessible UI and AI Evolution Polska team handoff. Three pinned MIT skills from obra/superpowers add systematic debugging, verification before completion and test-driven development. The searchable sidebar library exposes all nine skills with source/license previews and a local SKILL.md import. Imports contain instructions only; supporting files are not fetched or executed. Individual runs choose skills explicitly; the queue includes the team handoff skill automatically. Each task can select a distinct implementer and supported reviewer.

Conversation keeps at most 12 completed messages in the next prompt and has bounded history/context limits. A stopped or interrupted response is never replayed automatically. Conversation/Planning inspects context and produces answers; use **Create task** to enter the existing implementation/review workflow. Hermes and Antigravity lack verified read-only planning, so their local/GitHub conversations require a separate Git worktree. Read the [harness audit](HARNESS_AUDIT.md) for live-provider evidence and limits, and [visual provenance](research/harness-assets-2026-10-19.md) for bundled art, font and icons.

Import versioned JSON manifests from **Extensions**. Skills contain instructions, not executable scripts:

```json
{
  "kind": "skill",
  "name": "Project conventions",
  "version": "1.0.0",
  "author": "Your team",
  "license": "Apache-2.0",
  "source": "local/project-conventions",
  "instructions": "Reuse the existing architecture and report checks actually run."
}
```

An MCP manifest uses the same metadata with `"kind": "mcp"`, an absolute `command` path and an `args` array instead of `instructions`. Importing does not launch it. Review the executable, arguments, source and license first. Secrets do not belong in a manifest. There is no automatic extension download, executable marketplace or signature verification.


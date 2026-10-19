# Agent workspace research — 19 October 2026

This update builds on the existing Electron, React, SQLite FTS5, Git worktree, Codex app-server, ACP and MCP implementation. It does not replace the repository with a reference application.

## What to reuse

| Reference | Useful capability | Decision in this implementation |
| --- | --- | --- |
| [Orchestrator](https://docs.orchestrator.inc/plugins/agents/codex/) | Native CLI authentication, app-server conversations and isolated workspaces | Keep provider-owned sign-in, offer existing or isolated Codex profiles, preserve local worktree/artifact review. No credential-file scraping. |
| [Paperclip](https://github.com/paperclipai/paperclip) | Agent adapters, task ownership and supervised work | Add a bounded explicit task dispatcher on top of existing lifecycle leases. Pause at failed runs or human approval. Do not embed a second server/database. |
| [CC Switch](https://github.com/farion1231/cc-switch) | Provider setup and model management | Add a unified connection screen and encrypted OpenRouter configuration. Do not overwrite global CLI configuration. |
| [OpenCode ACP](https://docs.opencode.ai/docs/acp/) and [providers](https://docs.opencode.ai/docs/providers/) | An existing agent loop and file tools for OpenRouter models | Launch the trusted installed `opencode acp`, pass the key in the child environment and the selected model in `OPENCODE_CONFIG_CONTENT`. Reuse the current ACP adapter. |
| [Claude Code CLI](https://code.claude.com/docs/en/headless) | Official programmatic execution and CLI-owned authentication | Add native streaming JSON execution. Safe mode retains CLI sign-in; restrict the available tools to file reading/editing and disable implicit MCP. Preserve the older ACP bridge option. |
| [Antigravity headless](https://www.antigravity.google/docs/cli/headless/) | Official stdin/NDJSON execution with cached CLI sign-in | Add an experimental adapter for `agy` stream input/output, with cancellation and result validation. Reject read-only and resume requests because those contracts are not implemented here. |
| [Codex app-server](https://learn.chatgpt.com/docs/app-server) | Account rate-limit windows and optional daily token counts | Read `account/rateLimits/read`, prefer all returned buckets, use their real window durations; optionally read `account/usage/read`. Never interpret percentages as token allowances. |
| [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits) | Public models and authenticated per-key budgets | Read `/models` and `/key` using verified HTTPS. A key budget is not an account balance. Respect `limit_remaining`, including resetting-key semantics. |

## Boundaries discovered in the audit

The previous quota implementation used a TLS agent with certificate verification disabled, directly read provider OAuth files, inspected Antigravity process credentials, generated synthetic usage trends, guessed plans, and presented unavailable Antigravity limits as fully available. Those paths have been removed. Unknown readings now have no numeric gauge or trend. Manual budgets are explicitly labeled, editable and have no invented reset date.

OpenRouter API billing is separate from Claude/ChatGPT/Google subscriptions. A subscription is used through its official native client, not converted to a universal API token. Claude and Antigravity quota readers remain unavailable in this build; their own `/usage` views are the source of truth. Their execution adapters and quota support are separate capabilities.

No source files from Orchestrator, Paperclip or CC Switch were copied. Those projects informed architecture decisions. OpenCode is an optional user-installed process, not a vendored dependency. Existing dependency and font license notices remain in `licenses/`. The added adapter, UI and pictogram code is original under this repository's Apache-2.0 license; pictograms are not official provider logos.

## Validation expectations

Local protocol fixtures verify framing, cancellation, read-only policy requests, failure cases, shared context, encrypted persistence and queue boundaries. They do not establish compatibility with every installed CLI release or a successful paid inference. See the [audit and test report](../WORKSPACE_AUDIT.md) for actual observed results and remaining gaps.

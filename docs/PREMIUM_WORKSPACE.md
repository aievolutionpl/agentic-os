# Workspace update — 2026-10-20

## Conversation and appearance

**Color palette / Kolorystyka** offers Graphite, Light and **Classic · Terra**. Classic uses ivory surfaces, a terracotta accent and a serif welcome heading, following the operator's supplied reference. All palettes persist in SQLite. The composer groups attachments, agent, per-conversation model, workspace and planning. Starter suggestions populate a draft without sending it. Recent-project rows select a workspace.

Models reach the actual provider: Codex thread/turn parameters, ACP session model selection, or native CLI model arguments. A conversation change applies to its next turn, leaving other conversations and the saved default alone. Catalogs come from connection checks; Claude uses its supported Sonnet/Opus/Haiku aliases. Custom model IDs are supported. Availability still depends on the account.

Antigravity remains. Gemini CLI is removed from active pickers, team selection, connections and quota screens. Historical records and compatibility code remain readable; no external CLI or account is uninstalled. Provider artwork is bundled from [Lobe Icons 1.95.1](https://github.com/lobehub/lobe-icons), with its MIT notice. Local LLM uses a device symbol because it is a category, not a brand.

## Automatic local memory

[MCP server-memory 2.0.0](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) supplies the actual `KnowledgeGraphManager`. The app imports it without starting a network service. SQLite owns notes; the engine persists a locked, atomic JSONL graph in the profile's `memory-vault` folder.

- Auto-save runs on startup and every 10 seconds. It keeps one attributed note with the latest completed exchange per conversation and one per completed task result. Unfinished, failed and cancelled replies are excluded. These records are attributed context, not verified facts.
- The graph supports project filtering, keyboard selection, links, zoom, note previews and a persistent auto-save switch. Turning capture off leaves existing notes and Markdown sync available.
- Notes stay project-private unless the operator explicitly chooses workspace scope. Retrieval adds up to four matching notes to a conversation or task, within the existing 20-note / 24,000-character context budget. Pinned and explicitly selected notes take priority.
- Existing Markdown note-body edits sync back. Frontmatter cannot broaden scope or change projects. An unambiguous `[[Title]]` creates an edge. Exported links use UUID filenames with readable aliases so Obsidian can follow them.
- Concurrent app and Markdown edits retain the external edit as a separate conflict note. Deleting a note in the app removes its managed mirror. Unknown files are not imported or deleted. Symlinked storage paths are refused.

The Markdown / Obsidian button opens the local folder; Obsidian is optional and is not installed. The vault is an app-managed mirror. Use SQLite backups for authoritative notes. Recognized credential patterns are redacted; other private conversation content stays local.

The MCP repository is transitioning licenses. Its original combined Apache-2.0/MIT notice is preserved in [licenses/upstream](../licenses/upstream/mcp-servers-LICENSE), rather than labeling the entire package MIT. Source: commit `51b6382a3e827aceb6bce430b1208d69b93d95ea`, retrieved 2026-10-20. TypeScript SDK notices are retained with npm packages; its fallback repository notice is from `46d9c9921b6542e813c1ecc5f9fc964085e8e3bb`.

## Complete skills, one click

The [catalog](../resources/skills/catalog.json) records full Git commits, source URLs, authors, licenses and file counts.

| Source | Packages | License |
| --- | --- | --- |
| [Anthropic skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills) | frontend-design, webapp-testing, mcp-builder, skill-creator | Apache-2.0, retained per package |
| [obra / Superpowers](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills) | systematic-debugging, verification-before-completion, test-driven-development, writing-plans | MIT, retained per package |

Select a project and click **Add to workspace**. The complete pinned package, including references, examples, scripts and license, installs atomically under `.agents/skills/<slug>`. Existing unmanaged folders are preserved; a provenance marker makes repeat installation idempotent. Only that package is added to local Git `info/exclude` so installation does not dirty the source repository or block isolated runs.

Installed skills become available automatically through progressive instruction references in that project's agent context. Isolated task and master worktrees receive the same pinned packages, with paths relative to that workspace, so restricted agents can read the instructions and supporting files. These local copies are excluded from code diffs. Installation records provenance in project memory. A click copies files; scripts execute only when subsequently invoked under existing task/tool rules. Legacy explicit skill IDs and imported instructions remain compatible.

## Work, questions and usage

**Work & questions / Praca i pytania** combines project-filterable Kanban and the existing approval inbox. Queue, working, pending and done derive from tasks and their latest runs. A lease alone never counts as an agent working. Actual events and currently running conversations populate the live strip every three seconds. Selecting a card opens that exact task; the board does not dispatch work or approve changes.

Every configured provider retains a full OpenQuota card even without a readable budget. Codex official windows, OpenRouter key budgets, Claude/Antigravity stream usage and manual subscriptions retain distinct sources. Unknown is not zero or unlimited. Tokens reported inside this app are not a complete account subscription budget.

## Verification

Local Windows: 174 automated tests, TypeScript, npm audit with 0 findings, Electron smoke and `qa:premium`. The new scenario exercises actual IPC with a deterministic Codex fixture: two model selections, auto-memory, complete skill installation and its memory entry, exact-task Kanban navigation, configured quota cards and theme persistence. Classic is checked at 320/390/768/1440 px for overflow and DOM text contrast. Fixtures are labeled example data and perform no live paid inference.

Existing tools/workspace/harness/workbench suites remain release gates. `qa:premium` runs on Windows and Linux CI; Windows packaging must pass its packaged PTY smoke before merge. This does not claim signing, production deployment, an updater or full accessibility certification.

An existing Windows shutdown defect was reproduced and fixed: after confirmed exit, node-pty 1.1.0's remaining I/O worker is disposed without sending a delayed signal to a potentially reused process ID. A child-process regression requires the host to exit naturally. The Ctrl+C test waits for PowerShell's prompt before sending its next command.

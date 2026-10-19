# Chat, memory and subscription harness — 2026-10-19

This increment extends the Master Agent workspace merged in PR #4. It adds a working conversation entry point, persistent shared context, a discoverable skill library and a second visual pass. It is on `codex/conversation-memory-harness`, based on main commit `ede9e74`; publishing this new branch does not merge or deploy the app.

## Implemented behavior

- **Conversation:** choose an agent, Conversation/Planning and default workspace, local directory or GitHub repository. Responses stream, can be stopped, survive app restarts and retain bounded conversation history. Local read-only chats support ordinary directories without Git. GitHub contexts clone through the installed, signed-in `gh` CLI. Nothing pushes from chat.
- **Plan to work:** save a completed reply as an editable, attributed memory entry or create a draft task with a separately selected reviewer. Task execution retains the existing isolated worktree, artifact review and application workflow. Creating a draft does not start inference or apply changes.
- **Memory:** one SQLite FTS5 database; project and workspace scopes; edit, search, pin and delete. Pinned entries automatically enter chats, Master planning and task context. Private project pins never cross project boundaries. Runs and missions keep frozen context; editing memory affects subsequent contexts, not already captured runs. Schema v11 preserves existing data.
- **Skills:** nine bundled instruction skills: six original UI/research/memory/review/accessibility/team skills plus three pinned MIT skills from obra/superpowers. Search, inspect provenance/license and select per conversation or task. Import a user-selected local `SKILL.md` into a project. Imports retain text only; supporting scripts, linked files and arbitrary installers are not executed or automatically fetched.
- **Connections:** one-click configuration of detected executables using existing CLI profiles; explicit connection checks distinguish CLI sign-in from an ACP handshake. Hermes discovery includes its documented native Windows location, with ACP setup diagnostics and the model list reported by the runtime. Existing configurable paths remain supported.
- **OpenQuota:** a shared, deduplicated 60-second cache polls in the background. It refreshes after sign-in/configuration changes and on demand. Codex uses official app-server limits; OpenRouter uses API-key budgets. Percentages are never converted into invented token counts. Other providers stay unknown where no authoritative reader is available. An exhausted OpenRouter budget only gates OpenCode when OpenRouter is actually selected.
- **Visuals:** bundled Sora variable font, Lucide icons, distinct violet sidebar, cyan actions, stronger boundaries/focus states, light/dark palettes, reduced-motion support and two generated illustrations. Assets load locally under the existing CSP.

## Verification

Local Windows checks and raw reports are in [harness-08](evidence/harness-08/README.md):

- Typecheck and production build pass. npm audit reports zero known vulnerabilities at the time of the check.
- **75/75 automated tests pass**, covering migration/restart, cross-project memory isolation, chat history/cancellation, quota provenance, ACP handshake, import bounds and the existing task/application security boundaries.
- Native Electron UI/IPC flows pass: default workspace → conversation → memory → pin → automatic context → second turn → draft task. Nine skill previews and automatic quota reads use deterministic protocol fixtures.
- 30 new UI views at 1440/900/390 px in both themes pass rendered text contrast and horizontal-overflow checks. The 24 existing workspace views and native tools/browser QA also pass. These measurements are not a screen-reader certification.
- **Real subscriptions:** Codex and Claude each read a disposable local README and answer a second turn from conversation history. The source file remains unchanged. A real public GitHub repository clone and official Codex subscription-limit read pass. No API credentials, private repository contents or full account metadata are stored in the evidence.
- Gemini is installed locally as **0.1.4**, which lacks the required ACP implementation; its connection check failed. Hermes was not installed in the detected locations. Their live inference is not claimed.

The first CI run exposed two test-harness portability assumptions: a raw temporary path was compared against its canonical Windows path, and the final Linux screenshot navigated before React had switched from mobile to desktop navigation. The assertions now compare canonical paths, verify turn success before inspecting its prompt, and wait for the responsive navigation transition. Neither fix weakens the application behavior checks. The subsequent exact-commit run remains the release gate.

## Boundaries and remaining provider work

Conversation uses at most 12 completed messages (60,000 history characters), 12,000 characters of new input and 24,000 characters of selected memory/skills. It is reconstructed for each provider call; it is not native provider-session resume. Sessions are capped at 100, with 100 stored messages each. A turn times out after five minutes. Restart marks interrupted responses without replaying them. Deleting chat history preserves its project directory.

Codex and Claude live chat are verified. Gemini, Hermes, OpenCode/OpenRouter inference, local LLM inference and Antigravity require an installed, compatible runtime and the user's account/model configuration. ACP handshake success alone does not prove paid model access. Hermes and Antigravity have no verified read-only mode, so planning/reviewer roles are rejected and local/GitHub conversation requires a clean Git repository and separate worktree. ACP runtimes remain trusted native programs, not an OS sandbox provided by this app.

Claude, Gemini, Hermes and Antigravity do not gain an automatic subscription-limit reader in this change. Subscription login and API billing are distinct. Chat does not record a detailed per-message token ledger. Workspace memory is local to this installation, not cloud synchronization across computers. Upstream skill text can refer to supporting workflows that are not bundled; users should inspect the preview before selecting it.

The Windows installer remains unsigned. CI packages and launches the unpacked executable; a full install/update/uninstall lifecycle and code signing remain separate release work. See the PR checks for the exact tested commit, rather than applying an earlier green run to newer code.

## Sources and assets

[Integration research](research/agent-harness-2026-10-19.md) · [Illustrations, font and icon provenance](research/harness-assets-2026-10-19.md) · [Previous Master audit](MASTER_AGENT_AUDIT.md)

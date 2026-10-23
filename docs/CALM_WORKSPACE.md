# Conversation-first workspace

## Accepted direction

Keep Agenting OS; replace the shell mark with a compact monogram. Start with a clean conversation. Put projects and their conversations in one sidebar. Keep Conversations, Projects and Memory visible; put secondary tools under More and configuration in Settings. Use pearl surfaces, navy text, restrained blue accents and glass only on navigation/overlays. Preserve existing themes and user data.

## Implementation brief and verification

- Reuse the Electron/React architecture and existing IPC contracts.
- Provide New conversation globally and inside each project; preserve unsent drafts when switching views.
- Keep existing project operations available; use a compact project overview and move detailed diagnostics into a disclosure.
- Group appearance, language, agent connections, subscription limits and shared instructions in Settings.
- Represent memory relationships using actual conversations and note provenance. Animate only agents with running conversations; honor reduced motion.
- Fix Windows limit bridge commands with a single UTF-16 encoded PowerShell argument so paths containing spaces survive CLI argv parsing. Migrate only the exact previously generated command; preserve chained user commands.
- Do not represent context-window tokens as subscription balance. Claude exposes subscription windows only when its runtime supplies them. Antigravity supplies quota pools with reset times. Show missing readings explicitly.

Run `npm run build`, `npm run typecheck`, `npm run lint`, quota/memory regression tests and `node scripts/calm-qa.mjs`. The UI check uses an isolated profile, verifies draft retention and settings, and captures 320/390/768/1440 px screenshots under `.runtime`.

Provider references: [Claude status line](https://code.claude.com/docs/en/statusline), [Antigravity status line](https://antigravity.google/docs/cli/statusline), [Antigravity usage](https://www.antigravity.google/docs/cli/commands/usage).

## Claude account fallback

Configured Claude accounts can also read `https://api.anthropic.com/api/oauth/usage` using the CLI's existing local OAuth access token. This endpoint is **undocumented** and may change; validated CLI observations remain the fallback. Tokens are read only in the main process, sent only to Anthropic with redirects forbidden, and never logged, persisted by Agenting OS or returned to the renderer. No refresh-token flow is implemented. Electron networking uses the OS certificate store; TLS verification stays enabled. Requests are shared, cached for five minutes and backed off for fifteen minutes on HTTP 429. An expired/missing login leaves the reading unavailable.


## Studio refinement and ScheduleJob

The navigation now exposes Skills, Limits and ScheduleJob. A compact subscription strip stays above every view; it uses the tightest provider-reported window and labels old readings. Percentages are subscription quota, not context tokens. The home screen keeps the composer and six prompt starters; project history is in the sidebar. Right-click a project (or use its pencil button) to rename its display name without moving its folder. The memory map differentiates project folders, agents and Markdown notes, with actual vault paths and content excerpts. It does not claim to index every project file.

ScheduleJob persists daily local-time schedules and run history in SQLite schema 18. Creating one explicitly authorizes sending its prompt and project context to the selected agent at the scheduled time, consuming subscription quota. Only runtimes with verified read-only support are offered; Gemini is excluded. Each run uses the existing Chats pipeline and policy/quota gates. Results open as ordinary conversations and participate in the existing optional memory capture. No arbitrary shell commands, file writes, background Windows services, email delivery or autonomous implementation are added.

Keep Agenting OS running. A 15-second timer claims one run at a time, advances the next occurrence durably before execution, and collapses missed days into one catch-up run. Daily times follow the computer timezone and DST. Crashed runs are marked interrupted on restart, not silently retried. Pause/resume, run-now and delete are available; run-now preserves paused status. Historical results remain after deleting a schedule. Existing chat retention limits (100 conversations) still apply; reaching them produces a failed run rather than deleting user history. Scheduling does not wake the computer.

Validation: `tests/schedules.test.mjs` covers consent, invalid inputs, persistence, recovery, duplicate prevention, pause/manual runs, real chat completion, quota denial and display-name-only rename. `scripts/calm-qa.mjs` also exercises renaming, schedule creation/pause, memory file previews and starters in an isolated Electron profile without sending prompts to live providers.


## Five coordinated palettes

The top navigation offers exactly five palettes: Pearl and Claude Light (light), Midnight, Graphite and AI Evolution (dark). Stable stored identifiers are `light`, `classic`, `dark`, `claude`, and `codex`; older Tokyo/Nord profiles map to AI Evolution/Midnight on read. `themes.css` owns the semantic palette roles for canvas, panels, navigation, borders, text, focus and status; the sidebar must not define its own fixed color tokens. Panels use solid surfaces distinct from the softly tinted canvas. Terminal colors follow the same palette family.

Color composition is inspired by [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette), with custom brand accents and independently checked contrast. AI Evolution pairs violet navigation with celadon actions. The light Claude-inspired palette uses warm neutrals and burnt orange. These are custom palettes, not official Claude or Radix themes.

Percentage quota windows show a circular remaining indicator alongside the numeric value. Currency balances and unavailable readings have no percentage ring. Old readings retain their age warning. Project names support inline editing through double-click, F2 or the pencil button: Enter saves, Escape cancels, and a visible save control supports pointer input. Renaming does not move folders.

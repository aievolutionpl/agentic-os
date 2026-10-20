# Security

This is an early release. Use repositories and local executables you trust. Keep Electron, Git and provider executables updated. Only the current main branch receives fixes.

## Reporting

Please use this repository's private GitHub vulnerability report if available. If private reporting is unavailable, contact the maintainer through the public GitHub profile before sharing details. Do not publish tokens, customer files, authentication material or an exploitable private project in an issue.

## Boundaries

- The app renderer is sandboxed, has no Node integration and uses a small IPC bridge restricted to its trusted main frame. Remote project browsers have no preload or app bridge; cookies use separate persistent sessions. Downloads, popups and device permissions are denied. This is a workbench browser, not a general security browser; arbitrary remote sites and DNS rebinding are not certified.
- Codex requests a workspace sandbox and no network access. The installed provider must actually enforce those restrictions. ACP read-only mode is a protocol contract, not an OS sandbox. Trusted ACP/MCP executables run with the user's OS permissions and can access resources outside host-exposed capabilities. Run untrusted servers only inside your own OS/container boundary.
- Agent provider commands are direct executables with fixed/explicit arguments. Their environment forwarding is restricted and excludes inherited API-key variables. Provider executables can still read their normal user files.
- The explicitly opened **manual terminal** is a separate trusted-user capability: it runs a local PowerShell/Bash/sh with the user's OS permissions and normal inherited environment (excluding Electron launcher overrides). Typed commands can modify files, use credentials and access the network. Agent policies, budgets, worktree isolation and artifact approvals do not apply to these manual commands. The renderer cannot choose an arbitrary executable at terminal creation, but shell input is intentionally unrestricted. Remote pages have no terminal bridge. Do not paste untrusted commands.
- Terminal output is bounded and memory-only in the app; the shell and child programs may write their own history and logs. Closing a tab or app terminates its shell. Detached/disowned processes are not a containment guarantee. Terminal output cannot write the clipboard through OSC 52. Up to six sessions are allowed.
- Markdown is rendered without raw HTML, embedded frames or remote images. Only user-clicked HTTP(S) links without URL credentials may open externally. Script CSP remains restricted to bundled code; inline styles are permitted for xterm's runtime layout. Clipboard copy uses the user's click gesture; general clipboard-read permissions remain denied.
- Projects, task text, context snapshots, diffs, extension manifests and browser sessions are local and unencrypted. Do not store secrets in text or command arguments. Codex auth lives in the app-owned provider profile. Redaction and protected-file checks recognize common patterns; they cannot identify every secret.
- Agent changes stay in managed worktrees until an independent review, human approval of the exact artifact and a separate apply action. Approvals expire after 15 minutes; source changes, dirty worktrees and stale artifacts block apply. A provider calling a tool is not human approval.

No hosted telemetry or account sync is implemented. Explicit agent runs send the selected task/context to the configured provider; MCP commands and browser navigation may use the network according to their own behavior. Do not treat “local-first” as “all operations offline.”

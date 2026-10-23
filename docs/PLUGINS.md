# Plugins and workspace connections

Open **Pluginy** in the sidebar. Select an app, connect it, choose a returned tool and review its arguments before running it. Results can be added to the selected project's memory. This version does not automatically expose remote tools to a model's autonomous tool loop. Tool execution is explicitly initiated in this screen; remote descriptions and results are untrusted content.

## Setup

| App | Connection | Available workflow |
| --- | --- | --- |
| Google Drive | Desktop OAuth client, browser login | Search files, read text/JSON and export Google Docs or Sheets; read-only scope |
| Notion | Browser OAuth | Tools returned by the official remote MCP service |
| Canva | Browser OAuth; registered client credentials if required by Canva | Tools returned by Canva's remote MCP service |
| Firecrawl | Browser OAuth or API key | Tools returned by the official Firecrawl MCP service |

Google Drive requires a Google Cloud project with **Google Drive API** enabled, an OAuth consent screen and an OAuth client of type **Desktop app**. Add your account as a test user while the consent screen is in testing. Paste the client ID and optional client secret into the local configuration, save and connect. The requested scope is `drive.readonly`. OAuth testing grants may expire according to Google's policy. Files over 1 MB and non-text formats are not imported.

Notion supports client registration through its OAuth service. Canva may require prior client registration; its optional Client ID/secret fields support this. The callback for registered clients is `http://127.0.0.1:48573/callback`. A login operation listens only on loopback, uses PKCE and random state, and expires after three minutes. Only one login can be pending at a time. Cancel closes the local callback listener.

Firecrawl API keys are sent in an Authorization header, never placed in URLs. Remote services may apply their own subscription or usage charges. No tool runs merely because its app is connected.

## Storage and lifecycle

- Credentials and refresh tokens stay in `plugin-connections.enc` under Electron's user-data directory, encrypted using the system secret store. Connections are refused when secure encryption is unavailable.
- The renderer receives status and tool schemas, not stored secrets. Credentials entered into forms are cleared after saving.
- **Wyłącz** closes the local connection. **Usuń połączenie** additionally removes locally saved credentials. Neither action revokes the grant at the provider; revoke it in that provider's account settings when needed.
- Connections are re-established with **Połącz** after restarting the app. Saved OAuth grants are reused or refreshed when supported.
- Requests are restricted to the selected provider's HTTPS domains, with redirects disabled, timeouts, response limits and bounded tool pagination. A lost transport clears its connected state.
- Tool arguments are limited to 16 KB. Text results are redacted and truncated to 32 KB; adding a result to memory stores at most 6,000 characters in the chosen project.

## Agents, quotas and skills

The agent switch disables new executions through that configured provider and hides its subscription card. It does not stop an already running job or log the user out of the external CLI. OpenRouter-backed agents share one billing card when their quota data identifies the same source. Unknown quota values remain unknown; connection state does not invent remaining tokens.

Installed catalog skills can be toggled in the library. Disabled packages move from `.agents/skills/<slug>` to `.agents/disabled-skills/<slug>`; re-enabling moves them back and preserves local edits. Disabled skills are also excluded from new agent context. Existing conversations/processes may retain previously loaded instructions until the next run. Existing destination folders are never overwritten.

The ten added marketing packages come from [Corey Haines' marketingskills collection](https://github.com/coreyhaines31/marketingskills), listed on [skills.sh](https://www.skills.sh/coreyhaines31/marketingskills), pinned to `e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b` under MIT. Full supporting files and licenses are bundled. Packages cover copywriting, content strategy, SEO, marketing plans, customer research, social, email, advertising, product marketing and sales enablement. Their external scripts are not automatically executed during installation.

## Verification

`tests/workspace-connections.test.mjs` checks subscription filtering, skill discovery/context changes, OAuth state/cancellation, network restrictions and the MCP lifecycle using a local protocol fixture. `npm run qa:plugins` checks agent and skill toggles, settings and responsive plugin layouts in an isolated Electron profile. Real account OAuth and remote tool permissions require login to each provider and are separate from these automated checks.

Official references: [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Notion MCP](https://developers.notion.com/guides/mcp/get-started-with-mcp), [Canva MCP](https://www.canva.dev/docs/apps/mcp/), [Firecrawl MCP](https://github.com/firecrawl/firecrawl-mcp-server).

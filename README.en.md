<div align="center">

# Agenting OS

**One desktop workspace for agent conversations, a real terminal and reviewed code changes.**

[![CI](https://github.com/aievolutionpl/agentic-os/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aievolutionpl/agentic-os/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/aievolutionpl/agentic-os?include_prereleases&color=4F46E5)](https://github.com/aievolutionpl/agentic-os/releases/latest)
[![License](https://img.shields.io/badge/license-Apache--2.0-4F46E5)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-24%20%7C%2026-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6)](#download)

[Download](#download) · [Build from source](#build-from-source) · [How it works](#how-it-works) · [Providers](docs/PROVIDERS.md) · [Release status](docs/RELEASE_STATUS.md) · [Contributing](CONTRIBUTING.md) · [Polski](README.md)

</div>

Agenting OS is an open-source, local-first agent workbench by **AI Evolution Polska**. Keep conversations, projects, shared memory, skills and execution in one place. Choose an implementer and an independent reviewer, inspect the result and decide which changes to apply.

![Classic Terra conversation workspace](docs/images/classic-start.png)

## Why it exists

- **One context instead of five terminals.** Chat, terminal, projects and memory in one window — the same workspace, the same skills.
- **Every change passes a reviewer.** The implementer works in a separate worktree and leaves a diff with its SHA-256; an independent agent reviews it. Nothing reaches your repository without your approval.
- **Everything stays local.** SQLite, memory and diffs live in Electron `userData`. No account, no cloud, no telemetry.

**0.5.0-rc.1 — public preview candidate.** Screenshots show the actual desktop application with labeled example data. [Release status](docs/RELEASE_STATUS.md) separates local verification from publication gates. Windows packaging is unsigned; there is no automatic updater.

**Workspace update:** Classic · Terra and Graphite palettes, per-conversation models, automatic MCP memory with editable Markdown, eight complete GitHub skill packages and live Kanban. [Details and sources](docs/PREMIUM_WORKSPACE.md).

## Download

The unsigned Windows x64 installer is published in [Releases](https://github.com/aievolutionpl/agentic-os/releases/latest) together with SHA-256 sums.

1. Download `Agenting-OS-<version>-windows-x64-setup.exe`.
2. Verify it: `certutil -hashfile <file> SHA256` and compare with `SHA256SUMS.txt`.
3. Run the installer. Windows SmartScreen will warn about an unknown publisher — expected without a code-signing certificate.

Linux and macOS installers are not currently provided — build from source as described below.

## Build from source

Install **Node.js 24 or 26** (`.nvmrc` pins 26), npm, Git and a graphical desktop. The terminal uses native `node-pty`. If your platform needs compilation, install Python 3 and C++ build tools: `make`/`g++` on Linux, Visual Studio C++ Build Tools on Windows, or Xcode Command Line Tools on macOS.

```sh
git clone https://github.com/aievolutionpl/agentic-os.git
cd agentic-os
npm ci
npm start
```

`npm start` builds the application, ensures the pinned Electron runtime and opens the window. No provider credentials are needed to explore the UI or run automated tests. Model conversations require your own configured CLI/account or API connection.

Build and smoke-test an unsigned Windows x64 package on Windows:

```sh
npm run package:win
npm run smoke:package
```

Output: `release/Agenting-OS-0.5.0-rc.1-windows-x64-setup.exe`. Package smoke checks the unpacked application, including its native terminal. Install/upgrade/uninstall validation is a separate release gate.

## Features

| Area | What it is for |
| --- | --- |
| **Conversations** | Streaming, stop, searchable history, rename, separate in-session drafts and attachments, Markdown tables/lists/code, code copying and full-conversation Markdown copying. |
| **Embedded terminal** | Up to six local shell sessions, project directory selection, resize, Ctrl+C and persistence while navigating between screens. PowerShell on Windows; Bash or sh on Linux/macOS. |
| **Projects and tasks** | Dependencies, separate implementer/reviewer roles, frozen context and an execution journal. The queue preview exposes saved models, connection-check dates and missing reviewers before launch. |
| **Master Agent** | A selected lead proposes up to six steps, delegates the plan after launch and evaluates the outcome. File changes pause for your decision. |
| **Memory and skills** | Automatic local MCP graph, editable Markdown, scoped retrieval, pinned notes and eight complete Anthropic/Superpowers packages installed with one click. Local SKILL.md imports remain available. |
| **Connections and usage** | CLI discovery, model selection, explicit connection checks, evidence distinguishing configuration from real execution. Official Codex limits and OpenRouter key budgets; unsupported quotas stay unknown. |
| **Tools and data** | Explicitly invoked trusted MCP tools, project browser sessions, backups, reversible staged restores and redacted diagnostics. |

Polish and English UI, Graphite, Light and Classic · Terra themes, keyboard access and reduced-motion support. `Ctrl+K` / `⌘K` opens the command palette; focused terminals keep their own keyboard shortcuts.

## How it works

### Start with a conversation

In **Connections & models**, save a trusted executable and explicitly check the connection. In **Chats**, select an agent, Conversation or Planning, and a default workspace, local directory or GitHub repository. GitHub cloning uses your existing `gh` login.

Describe your goal, attach text files and select memory or skills. Copy an answer, save it to memory or turn it into a draft task. Unsent messages and attachments remain separate per conversation for the current application session; sent conversation history persists locally. Unsent drafts do not survive closing the application.

### Hand a change to your team

For code execution, select a **clean local Git repository with at least one commit**. Create a task, choose an implementer and a different supported reviewer, and specify acceptance criteria and context.

Start a single task, an explicit queue of up to ten tasks, or a Master Agent plan. Queue preview reads saved connection evidence without invoking a model. Preparing a Master plan does invoke the selected provider.

```mermaid
flowchart LR
  A[Goal and context] --> B[Task / Master plan]
  B --> C[Implementer in worktree]
  C --> D[Diff and artifact hash]
  D --> E[Independent reviewer]
  E --> F[Your approval]
  F --> G[Apply the exact changes]
```

The supervisor keeps changes in managed Git worktrees and captures the diff with SHA-256. A review is evidence for your decision. Human approval and applying the change are separate actions. Approval expires after 15 minutes; modified artifacts, a dirty source checkout or a changed base block application.

Queues run sequentially without hidden retries or provider fallback. Failure, dependencies or human decisions stop progress. Restarted work is marked interrupted and requires inspection and an explicit continuation.

### Work manually in the terminal

Open **Terminal**, select a directory and create a tab. Run `git status`, project tests or an installed `codex` / `claude`. Sessions continue while you visit another screen. Closing a tab confirms termination of its shell; application shutdown also closes sessions.

**The terminal runs with your OS permissions.** Commands can modify files, use the network and access CLI accounts. Manual commands do not pass through agent artifact approvals or budgets. Displayed output is bounded and kept in memory; shells and programs may maintain their own on-disk history. This is not an OS sandbox.

## Screenshots

| Light conversation | Project terminal |
| --- | --- |
| ![Light conversation](docs/images/chat-light.png) | ![Real Bash session in a project](docs/images/terminal-dark.png) |
| **Project tasks** | **Team preview** |
| ![Project task queue](docs/images/project.png) | ![Saved role connections and missing reviewer](docs/images/team-preflight.png) |
| **Connections** | **Light terminal** |
| ![Connection evidence](docs/images/connections.png) | ![Light terminal](docs/images/terminal-light.png) |

<details>
<summary>Start screen and small windows</summary>

![Start screen](docs/images/start.png)

<img src="docs/images/chat-mobile.png" alt="Conversation at 390px width" width="320"> <img src="docs/images/terminal-mobile.png" alt="Terminal at 390px width" width="320">

These are responsive desktop layouts, not a separate mobile app. Reproduce the captures with `npm run qa:workbench`.

</details>

## Providers and practical limits

Adapters cover Codex app-server, Claude Code, ACP, Gemini CLI, Hermes, OpenCode/OpenRouter, local models through OpenCode and experimental Antigravity. Role support depends on the provider and installed CLI. Hermes and Antigravity do not have a verified read-only reviewer mode. See the [provider matrix](docs/PROVIDERS.md) for details and dated historical checks; current evidence is shown inside the application.

Detected executables, saved connections, successful handshakes and finished tasks are distinct facts. Unknown quotas stay unknown. CLI subscriptions and API billing are separate. Automated tests use local protocol fixtures and make no paid model requests.

## Privacy and architecture

React communicates through a validated Electron IPC bridge. The main process owns SQLite, provider adapters, the supervisor, terminal sessions and project browsers. Remote browser pages have no app bridge. Sources live in `src/renderer`, `src/main` and `src/shared.ts`.

Data lives in Electron's `userData` directory: SQLite, worktrees, provider profiles and browser sessions. Override it with `AGENTING_DATA_DIR` for isolated testing. Conversations, memory, context and diffs are unencrypted. OpenRouter keys use `safeStorage`; plaintext storage backends are rejected. Native CLIs manage their own authentication.

There is no hosted telemetry or account synchronization. Providers receive the selected task/context; local programs and websites may use the network. ACP/MCP executables are trusted local processes, not OS-sandboxed plugins. Markdown cannot execute raw HTML or fetch remote images; HTTP(S) links open in the external browser only when clicked. Read [SECURITY.md](SECURITY.md).

Renderer isolation: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a CSP in `index.html`, and navigation/new-window blocking. IPC calls go through a channel allowlist and a sender check.

## How it is built

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 43 + TypeScript 5.9 |
| Interface | React 19 + Vite 7 |
| Data | SQLite (bundled driver, schema migrations) |
| Terminal | `node-pty` 1.1 |
| Tests | `node:test` + jsdom + Playwright |

```text
src/renderer   React interface
src/main       Electron main process, process supervision, providers, storage
src/shared.ts  IPC contract
tests/         26 files, 194 tests, 1,106 assertions
docs/          architecture, ADRs, providers, verification evidence
```

## Verification and development

```sh
npm run typecheck
npm test
npm run smoke
npm run qa:tools
npm run qa:workspace
npm run qa:harness
npm run qa:workbench
npm audit --audit-level=moderate
npm run release:audit
```

CI (GitHub Actions) runs typecheck, the full test suite, a dependency audit and native Electron verification on Ubuntu and Windows. Use `xvfb-run -a` for headless Linux Electron checks. `AGENTING_TEST_NO_SANDBOX=1` is only for isolated test runners requiring Chromium sandbox disabling, not everyday use. `AGENTING_QA_OUTPUT` selects the evidence directory.

The [0.5 audit](docs/WORKBENCH_AUDIT.md) records changes and checks. The [Claudex Loop / CC Switch comparison](docs/research/claudex-cc-switch.md) explains selected ideas and deferred features. See [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [release status](docs/RELEASE_STATUS.md).

## FAQ

**Do I need an API key?**
Not to explore the UI or run the tests. Talking to a model requires your own CLI (for example Codex or Claude Code) or an API connection — the app does not resell tokens and does not handle billing.

**Does the app send my data anywhere?**
Not by itself. Task content goes only to the provider you choose. There is no telemetry, account or sync.

**Does it run on macOS and Linux?**
The code builds and passes tests on both (CI verifies it), but ready-made installers are published for Windows x64 only. On macOS/Linux, build from source.

**Can an agent change my repository on its own?**
No. The implementer works in a separate worktree, the change needs your approval, and approvals expire after 15 minutes.

**Why is the installer unsigned?**
The project has no code-signing certificate. SmartScreen will warn; the SHA-256 sums let you verify the file.

**Is there auto-update?**
No. Deliberately — during the preview you update manually from Releases.

## Contributing

Reports and ideas: [Issues](https://github.com/aievolutionpl/agentic-os/issues). Rules and environment: [CONTRIBUTING.md](CONTRIBUTING.md). Behaviour in the project: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report security issues per [SECURITY.md](SECURITY.md), not through a public issue.

**Apache-2.0** · [License](LICENSE) · [Notice](NOTICE) · [Third-party licenses](licenses/THIRD_PARTY_NOTICES.md) · Built by AI Evolution Polska

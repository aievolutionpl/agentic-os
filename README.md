# Agenting OS

> **Work in progress — development paused for handoff.** Start with [HANDOFF_PL.md](HANDOFF_PL.md): completed features, gaps, verification and instructions for the next agent. [Original Google Drive plan](docs/original-plan/Agenting_OS_Master_Plan_v2.1.md) · [Logo concepts (not approved)](docs/logo-concepts/).
>
> Latest handoff check: typecheck, production build, **30/30 tests** and real Electron headless smoke passed on Linux/WSL. Native Windows is unverified. The introduction below describes the initial slice; the handoff and dated STATUS entries supersede it where features have since advanced.

Local-first Windows-targeted desktop workbench by AI Evolution Polska. This first slice stores projects, draft tasks and project-scoped knowledge in SQLite. PL/EN and dark/light controls persist. Codex and Claude roles can be swapped as preferences; execution is staged. All integrations and quota remain explicitly unverified.

Requires Node 22.16+ and npm. From this directory:

```sh
npm ci
npm start
```

`npm start` builds and opens Electron. Build only: `npm run build`. Checks: `npm run typecheck`, `npm test` (rebuilds first). `npm run smoke` launches an isolated Electron profile using Playwright; a graphical display is required on Linux (use `xvfb-run -a npm run smoke`). Windows launch and installer have **not been verified**. No Windows installer is supplied.

Data lives in Electron's per-user `userData` directory as `agenting.sqlite` and WAL files. Windows location normally `%APPDATA%\Agenting OS`; confirm via Electron on Windows before release. Folder fields are references only; this slice does not open or modify referenced projects. Metadata is unencrypted: never enter credentials into project/task/memory text. No account login, API key storage, paid requests, external actions or provider detection are performed.

The source has strict IPC sender checks, a sandboxed renderer, navigation/network restrictions and no arbitrary shell channel. Agent worktrees, human diff approval, persistent remote browser, secret storage and skill library are next increments, not working integrations. See [status](docs/STATUS.md), [plan](docs/PLAN.md), and [evidence](docs/evidence/commands.md).

Dependency install scripts are disabled during this environment's offline setup. On a normal install Electron's reviewed upstream postinstall downloads the OS-specific runtime. Preserve dependency notices and Electron's bundled Chromium notices in any distribution.

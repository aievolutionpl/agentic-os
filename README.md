# Agenting OS

> **Work in progress — development resumed for the workspace UI and native Windows checks.** Start with [HANDOFF_PL.md](HANDOFF_PL.md): completed features, gaps and next steps. [Original Google Drive plan](docs/original-plan/Agenting_OS_Master_Plan_v2.1.md) · [Logo concepts (not approved)](docs/logo-concepts/).
>
> Latest continuation check: typecheck, production build, **30/30 tests**, real Electron smoke and rendered text contrast passed on **native Windows**. See [workspace refresh evidence](docs/evidence/workspace-refresh/README.md). Installer, updates and production release QA remain pending. Earlier Linux/WSL results are historical evidence.

Local-first desktop workbench by AI Evolution Polska. Projects, task lifecycle/journal and project-scoped knowledge persist in SQLite. PL/EN and dark/light preferences persist. The workspace has task search/status filters, expandable technical details and compact project navigation in narrow windows. Unsaved task text survives tab/project switches during the current session; **Save draft** stores it durably. Codex/Claude role preferences are available; provider execution is not connected.

Requires Node 22.16+ and npm. From this directory:

```sh
npm ci
npm start
```

`npm start` builds and opens Electron. Build only: `npm run build`. Checks: `npm run typecheck`, `npm test` (rebuilds first), `npm run qa:contrast`. `npm run smoke` launches an isolated Electron profile using Playwright; a graphical display is required on Linux (use `xvfb-run -a npm run smoke`). Native Windows launch/CRUD/restart and reflow were exercised with Node 26.10.0, npm 11.19.1 and Electron 43.1.0. No Windows installer is supplied.

Data lives in Electron's per-user `userData` directory as `agenting.sqlite` and WAL files. Windows location normally `%APPDATA%\Agenting OS`; confirm via Electron on Windows before release. UI folder fields are references only and do not grant execution access. Metadata is unencrypted: never enter credentials into project/task/memory text. No account login, API key storage, paid requests or external writes are performed.

The source has strict IPC sender checks, a sandboxed renderer, navigation/network restrictions and no arbitrary shell channel. Read-only provider probes report installation evidence while authentication/quota remain unknown. Internal APIs capture committed diffs from existing linked worktrees and bind approval records to those artifacts; these are not a patch application gate or an execution UI. Worktree creation, execution, persistent remote browser, secret storage and the skill library remain future increments. See [status](docs/STATUS.md) and [plan](docs/PLAN.md).

Dependency install scripts are disabled during this environment's offline setup. On a normal install Electron's reviewed upstream postinstall downloads the OS-specific runtime. Preserve dependency notices and Electron's bundled Chromium notices in any distribution.

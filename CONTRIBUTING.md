# Contributing

Agenting OS is an early open-source desktop workbench. Small, focused contributions with reproducible evidence are welcome. Read [README.md](README.md) and [the implementation roadmap](docs/ROADMAP_IMPLEMENTATION.md) first.

## Local development

Use Node 26 and Git. Run `npm ci`, `npm run typecheck`, `npm test`, then `npm start`. Tests use temporary Git repositories, SQLite databases and local stdio fixtures; they do not need accounts or model requests. For Electron checks use `npm run smoke` and `npm run qa:tools` (on Linux run under Xvfb). Production packaging is currently Windows x64: `npm run package:win`, then `npm run smoke:package`.

## Pull requests

- Explain the concrete problem, resulting behavior and validation performed.
- Reuse existing UI tokens, IPC validators, project scoping and provider adapters.
- Preserve explicit run consent, artifact-bound approvals, clean-source checks and cancellation fencing.
- Include meaningful tests for state transitions, permissions or failure handling. Update docs when behavior changes.
- Do not commit credentials, profiles, SQLite data, installed dependencies or release binaries. Use synthetic fixtures.
- Keep third-party attribution and licenses. Describe an external inspiration; copy code only when its license permits it and retain the required notices.

Contributions are submitted under Apache-2.0, the repository license. There is no CLA or mandatory external service. Report security issues using [SECURITY.md](SECURITY.md).

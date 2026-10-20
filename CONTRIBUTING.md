# Contributing

Agenting OS is an early open-source desktop workbench. Small, focused contributions with reproducible evidence are welcome. Read [README.md](README.md) and [the implementation roadmap](docs/ROADMAP_IMPLEMENTATION.md) first.

## Local development

Use Node 26 and Git. The native terminal may require Python 3 and C++ build tools (`make`/`g++`, Visual Studio C++ Build Tools, or Xcode Command Line Tools). Run `npm ci`, `npm run typecheck`, `npm test`, then `npm start`. Tests use temporary Git repositories, SQLite databases, real PTYs and local stdio fixtures; they do not need accounts or model requests.

For Electron checks run `npm run smoke`, `npm run qa:tools`, `npm run qa:workspace`, `npm run qa:harness`, and `npm run qa:workbench`. On headless Linux use Xvfb. Only isolated CI runners that require it should use `AGENTING_TEST_NO_SANDBOX=1`. Set `AGENTING_QA_OUTPUT` to keep new evidence separate from historical captures. `qa:workbench` covers real keyboard terminal input, chat drafts/attachments, Markdown, clipboard, team preview and responsive themes. `qa:contrast` performs additional DOM text contrast measurements; neither suite is a complete accessibility audit.

Windows x64 packaging: `npm run package:win`, then `npm run smoke:package`. The latter checks a real native terminal in the unpacked build. Installer lifecycle and signing remain separate gates. Before proposing a release, run `npm run notices`, `npm run release:audit` and `npm audit --audit-level=moderate`, and update [release status](docs/RELEASE_STATUS.md) with actual evidence. Keep the Polish main README and [English version](README.en.md) consistent.

## Pull requests

- Explain the concrete problem, resulting behavior and validation performed.
- Reuse existing UI tokens, IPC validators, project scoping and provider adapters.
- Preserve explicit run consent, artifact-bound approvals, clean-source checks and cancellation fencing.
- Include meaningful tests for state transitions, permissions or failure handling. Update docs when behavior changes.
- Do not commit credentials, profiles, SQLite data, installed dependencies or release binaries. Use synthetic fixtures.
- Keep third-party attribution and licenses. Describe an external inspiration; copy code only when its license permits it and retain the required notices.

Contributions are submitted under Apache-2.0, the repository license. There is no CLA or mandatory external service. Report security issues using [SECURITY.md](SECURITY.md).

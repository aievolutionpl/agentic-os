# Release status — single source of truth

This document describes current release readiness. Older audits, handoffs, briefs and evidence folders are historical records. CI on the commit being distributed takes precedence over a local report.

## Current candidate: 0.5.0-rc.3

Prepared 2026-10-24. Updated gallery: `docs/images/rc3`, captured by `scripts/release-gallery.mjs` in an isolated profile with synthetic data. The dark-logo application changes passed Windows/Linux CI and packaged Windows smoke in PR #37. This candidate also updates documentation and the package version; its own CI and tag workflow must pass before distribution. Release workflow runs typecheck, lint, automated tests, release audit, Windows packaging and packaged-app smoke before publishing the unsigned prerelease installer and SHA256SUMS.txt. Check the workflow attached to the tag for actual publication status. Live provider OAuth and clean-machine install/upgrade/uninstall remain separate manual checks.

## Historical: 0.5.0-rc.1 verification

**2026-10-20 Windows workspace update:** [Classic/Grafit UI, model selection, memory graph, complete skills and Kanban](PREMIUM_WORKSPACE.md). Local verification now includes 174 automated tests, native Windows terminal shutdown, Electron smoke and `qa:premium` (Classic at 320/390/768/1440 px). The exact PR's Windows/Linux CI and packaged Windows smoke remain required merge gates. The table below records the earlier Linux candidate verification and its distribution limits; it is not evidence of a signed public release.

The workbench changes have local Linux verification dated **2026-10-20**. This is preparation for review and publication, not an announcement that an installer has been released. No signed/stable 1.0 release is claimed.

| Area | State / evidence |
| --- | --- |
| TypeScript and automated tests | Passed: 123 tests and typecheck on Node 26; [local evidence](evidence/workbench-05/README.md) |
| Native Electron UI, Git/SQLite, provider protocol fixtures | Local Linux/Xvfb checks; automated tests make no model calls |
| Embedded terminal | Real local PTY execution, resize, interruption, independent sessions, bounded output and shutdown tested on Linux |
| Conversation Markdown, draft isolation, copying and queue preview | Native Electron scenario in `scripts/workbench-qa.mjs` |
| Screenshots and responsive themes | Actual Electron captures with labeled example data in [images](images); reproducible script, not generated mockups |
| Windows verification and unsigned NSIS installer | CI configured on Windows and Linux; **current candidate Windows run and installer not verified in this Linux environment** |
| Packaged Linux executable | Passed with an existing N-API module (`npmRebuild=false`); [scope and evidence](evidence/workbench-05/package-linux.json). This is an unpacked test build, not a Linux installer release |
| Packaged native terminal on Windows | `asarUnpack` configured; Windows `smoke:package` now requires actual PTY execution. **Awaiting Windows CI** |
| Signing; clean-profile install, upgrade and uninstall | **Not done**; separate public distribution gates |
| Automatic updates | **Not provided** |
| Live provider inference for this candidate | **Not repeated**. Existing dated checks in [provider documentation](PROVIDERS.md) are historical evidence, not a blanket compatibility guarantee |
| OS sandbox for trusted ACP/MCP processes or manual terminal | **Not provided**; see [SECURITY.md](../SECURITY.md) |
| General accessibility certification | **Not claimed**. Automated DOM text contrast/reflow checks, keyboard scenarios and reduced motion cover selected states only |

## Before public distribution

1. Run the repository's **Verify and package** workflow on the exact proposed commit. Require both OS verification jobs and the Windows package job, including the packaged PTY smoke.
2. Check installation, upgrade from the existing version, cancellation and uninstall on a clean Windows profile. Verify that saved projects and the database survive an upgrade.
3. Decide whether this is explicitly labeled **unsigned preview** distribution or a signed release. Stable distribution requires signing and a verified update strategy; signing credentials are not present in this workspace.
4. Exercise the supported provider/model/account combinations using explicit opt-in real tasks, including cancellation and reviewer roles. Publish that matrix with CLI versions and dates.
5. Review the diff, licenses and remaining findings, then publish an artifact and release notes associated with the tested commit. Preparing this candidate does not publish or merge it.

## What readiness labels mean

- **Detected**: a fixed read-only probe found an executable.
- **Profile**: the user explicitly saved an execution configuration.
- **Sign-in reported**: the provider CLI reports its own sign-in state.
- **Handshake passed**: the app's explicit protocol/account/model check succeeded; this does not perform inference.
- **Real run**: a provider task finished on this machine; failed or interrupted tasks do not prove readiness.
- **Verified**: both handshake and completed-run evidence exist. This remains dated evidence, not a guarantee of future availability.

The queue preview reads saved settings and check timestamps only. It never starts inference to choose a provider. A missing reviewer is visible before dispatch; the existing queue pauses before changes can be applied. Unknown provider quota remains unknown.

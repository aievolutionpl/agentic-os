# Local workbench verification — 2026-10-20

These results describe the source/configuration hashes in [source-manifest.json](source-manifest.json), based on commit `da6e75a944b673cd7155a1399d5bf065f93bf8cd`. They are local Linux evidence for 0.5.0-rc.1, not a GitHub CI run or publication attestation.

| Check | Result |
| --- | --- |
| Clean lockfile installation | [`npm ci` passed](clean-install.log); [4 real PTY checks passed after reinstall](terminals-clean-install.log) |
| TypeScript | [Passed](typecheck.log) |
| Automated tests | [123 passed, 0 failed](test.log) |
| Electron smoke | [Passed](smoke.log) |
| Tools, workspace, harness | [Tools](qa-tools.json), [workspace](qa-workspace.json), [harness](qa-harness.json): passed |
| New workbench scenario | [8 check groups, 21 screen captures](workbench.json): passed |
| Additional DOM text contrast | [4,902 measurements](contrast-summary.json): 0 failures in sampled states |
| Packaged Linux executable + real PTY | [Passed](package-linux.json), with existing N-API build and `npmRebuild=false` |
| Documentation and input audit | [Passed](release-audit.log) |
| Dependency audit | [0 known vulnerabilities reported](audit.log) |

The terminal tests execute a real local shell. The provider tests use deterministic local protocol fixtures; no live inference is represented. Connection screenshots therefore show a test executable and sample account state, not recommended production CLI configuration. All conversations and project data in public screenshots are labeled examples. Screenshots in [../../images](../../images) are unedited Electron captures.

`contrast-summary.json` retains per-screen measurement counts, overflow and failure lists. The full computed DOM color rows and additional screenshots remain in the local QA output; regenerate them with `npm run qa:contrast`. The xterm accessibility mirror is invisible and excluded from DOM text contrast; its visible canvas uses xterm's configured minimum contrast. These checks are not a complete accessibility audit.

Run Electron suites under Xvfb on headless Linux. This runner uses `AGENTING_TEST_NO_SANDBOX=1`; the checks do not certify Chromium OS sandbox enforcement. The normal Electron native rebuild tried an unavailable cache outside the workspace, so the Linux package test reused the verified N-API build after `npm rebuild node-pty`. Windows keeps the normal rebuild configuration and requires its own CI result.

See [the audit](../../WORKBENCH_AUDIT.md) and [release gates](../../RELEASE_STATUS.md) for the remaining Windows installer, signing, upgrade/uninstall and live-provider validation work. No release was published by these checks.

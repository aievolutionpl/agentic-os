# 0.4 — extensions, browser and distribution

This stage completes the owner's three-stage continuation. Earlier stage evidence remains in adjacent folders; its historical limitations are not assertions about this version.

## Implemented

- Project-scoped strict JSON extension manifests with author, source, version and license. Built-in original text skills are opt-in. Selected instructions join the frozen, budgeted context.
- Explicitly trusted MCP stdio compatibility protocol `2025-11-25`: initialize/initialized, bounded tool pagination, manual per-call confirmation, bounded redacted text results, tool-error states, process shutdown and local operation journal. No secrets/env configuration, automatic download or background tool calls.
- Electron WebContentsView with no preload/Node/app bridge; separate persistent partition per project; explicit URL validation; denied device permissions, downloads and popups; native view hidden behind app dialogs and project navigation.
- Electron 43.8.0, Vite 7.3.7 and electron-builder 26.17.0, with refreshed lockfile and third-party notices. Clean installation verifies actual package identities and versions. npm audit reports no known vulnerabilities for this lockfile at verification time.
- Unsigned per-user Windows x64 NSIS package, ASAR executable smoke, open-source documentation and pinned official Windows/Linux GitHub Actions.

## Evidence

- Full regression suite: **43/43 pass** on native Windows with Node 26.10.0; Git/SQLite and actual child-process protocol fixtures. Includes cancellation/dead-PID checks, restart recovery, scoped context, approvals, safe application and extension/MCP validation.
- Typecheck and production build pass.
- [Electron workspace smoke](smoke/smoke-result.json): persistence/restart/preferences, existing UI/security and reflow. Host native clipboard write/read baseline is unavailable; the trusted copy payload is verified separately and OS readback remains unverified.
- [Real browser/extensions checks](tools/result.json): no remote Node/app bridge, geolocation denied, separate cookie jars, native preview removed behind dialogs, project-scoped import and light/dark small-window captures. Local HTTP fixture only; no user accounts or model calls.
- [Text contrast matrix](contrast/result.json): actual measured screens, counts, failures and scope are recorded in JSON. Includes the new extension/browser UI. It is not a full accessibility audit or coverage of every execution/error state.
- [Packaged executable smoke](package/result.json): actual Windows EXE opens from ASAR, preload works and first-launch profile is isolated. The NSIS installer is built; no installation into the user's profile, registry modification, upgrade or uninstall test was performed.

## Practical limits

No authenticated model execution, real third-party ACP/MCP certification, code signing or updater test was performed. Protocol fixtures prove the host's implementation, not a vendor's behavior. Trusted ACP/MCP executables must enforce their own isolation; protocol permissions are not an OS sandbox. The declared provider name does not verify model identity. Browser session isolation is not a complete hostile-web/network security assessment.

This release uses the default Electron application icon; final logo/branding remains a product decision. Linux CI deliberately uses Xvfb with `--no-sandbox`; it does not validate Chromium OS sandbox enforcement. CI results belong to their exact commit and are inspected separately before merge.

## Protocol references

- [Codex app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- [ACP v1](https://agentclientprotocol.com/protocol/initialization)
- [MCP 2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)

Public protocol contracts informed original adapters. No reference application code was copied.

# Subscription connections — 2026-10-19

Hermes and Google's supported consumer subscription path now work through Agenting OS conversations. Gemini CLI was updated locally from 0.1.4 to **0.64.0**. The existing **Hermes 0.22.2** installation passes `hermes acp --check`; **Antigravity CLI 1.4.2** was found in its official Windows installation directory and uses the existing Google keyring sign-in.

## Google account result and migration

Real authentication exposed two distinct issues. The OAuth token exchange initially failed because Node did not trust a certificate in the connection chain. Gemini processes now use `NODE_USE_SYSTEM_CA=1`, including their child processes, so Windows' trusted certificate store is used with certificate verification enabled.

Once that was fixed, Google's backend reported that this client no longer serves consumer accounts. Google's [consumer-account deprecation notice](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals) says this applies to free individual accounts and Google AI Pro/Ultra beginning June 18, 2026, including Gemini CLI. The [older Gemini authentication guide](https://geminicli.com/docs/get-started/authentication/) still describes personal sign-in; the current service response and explicit deprecation notice take precedence.

The application therefore reports **GEMINI_SUBSCRIPTION_MOVED** and directs personal subscription users to **Antigravity**. It does not disguise this as a successful Gemini CLI connection or switch to separately billed API credentials. Gemini CLI remains available for supported organizational Code Assist accounts; their live inference was not tested with an enterprise account.

Google's [Antigravity installation guide](https://antigravity.google/docs/cli/install/) documents the native Windows CLI, its standard `%LOCALAPPDATA%\agy\bin` directory and OS-keyring authentication. That existing installation was connected and successfully ran the **gemini-4-argon-medium** model in the application. No additional Google login was required by Antigravity on this computer.

## Hermes result

The source installation exposes `hermes.cmd` rather than `hermes.exe`. Discovery now recognizes the documented layout. The application resolves the install's managed Python executable and runs the fixed Hermes bootstrap directly, with `shell:false`; it never executes arbitrary commands from the shim. The Python path must stay inside that installation's tools directory. See [Hermes native Windows](https://hermes-agent.nousresearch.com/docs/user-guide/windows-native) and [Hermes ACP](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp).

The user completed Hermes' official ChatGPT/Codex OAuth flow. Hermes retains and refreshes its own credentials. Agenting OS passes no copied OAuth token or API key. After reading the runtime's advertised model catalog, the application selects **openai-codex:gpt-6.1-sol** using ACP `session/set_model` before any model prompt. The selected model is stored in Agenting OS provider settings and applies to chats, task execution and delegated runs. Hermes' global provider remains **openrouter**; selecting a session model in this application does not rewrite that global preference.

Hermes requires an explicit model choice in Agenting OS before inference, to avoid unintentionally running a different configured provider. Its catalog puts ChatGPT/Codex models first, with the subscription lane labeled in the UI. Planning/reviewer mode is still rejected because the installed Hermes ACP runtime does not advertise a read-only mode.

## Application changes

- Discover both old `dist/index.js` and new npm-declared `bundle/gemini.js` entries, reject entry-point traversal, and migrate existing saved Gemini paths and flags to `--acp`.
- Recognize official Hermes and Antigravity Windows installations outside the current process PATH.
- Authenticate Gemini via the advertised `oauth-personal` ACP method before opening a session. Explicit browser sign-in actions keep credentials inside the provider CLI. Pending sign-in is cancelled and awaited when the application closes.
- Save provider-specific model choices through schema **v12**. Existing projects, chat history, memory and credentials are preserved. The model is visible in the chat header.
- Distinguish authentication, certificate verification and the Google consumer-service migration with safe public error codes. Raw OAuth payloads and provider stderr do not cross IPC.

## Verified behavior

- **80/80 automated tests pass**, including npm entry traversal rejection, native Hermes launch boundaries, saved-path migration, model persistence, authentication ordering, model application before inference, safe error reporting and sign-in cancellation.
- Typecheck/build, native Electron IPC smoke, 24 existing workspace views and the 30-view harness regression pass locally. Rendered text contrast and horizontal overflow checks report no failures.
- **Real Electron/subscription test passes:** two turns each for Hermes and Antigravity, exact answer/history checks, saved model settings after a renderer restart, and the expected Gemini consumer-account migration state. This is real inference through the application's IPC and chat controller, not a mocked response.
- The main user profile was configured through the application's native IPC, without running tasks against existing projects. Its selected subscription models are ready after reopening the app.

Evidence: [subscriptions-09](evidence/subscriptions-09/README.md). The opt-in live test is `AGENTING_SUBSCRIPTION_SMOKE=1 node scripts/live-subscriptions-smoke.mjs`; it consumes the accounts' normal model allowance and uses temporary app data. It is excluded from CI. CI repeats deterministic tests and UI checks on Windows/Linux and builds an unsigned Windows installer; consult the PR for the final commit's actual outcome.

These tests do not establish exact remaining Google/Hermes subscription allowances, paid-tier entitlement names or a complete provider token ledger. Such counters remain unknown where the application has no authoritative reader. Hermes and Antigravity use trusted local runtimes, not an OS sandbox supplied by Agenting OS. Their chat contexts use a managed scratch repository or isolated Git worktree as already documented.

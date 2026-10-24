# Connections and Jev

## Connect a provider

In **Connections and models**, select Codex, Claude or Antigravity and expand
the step-by-step guide. Review the official command and dependency check. Click
**Install in terminal** only when you want that installer to run. Installation
is never started automatically. The existing PTY terminal shows output and
supports cancellation; files already downloaded may remain after cancellation.

Success requires an installer exit code of zero, rediscovery of the CLI and a
successful `--version` probe. Windows detection includes common native/npm
installation folders even when the app's original PATH is stale. The installer
shell refreshes machine/user PATH. Custom nonstandard folders may still require
an app restart or manual executable selection.

Use the official CLI login button (or Codex browser login), finish authentication,
connect the detected CLI and run **Check connection**. Opening a login terminal
does not prove authentication. Subscription authentication and separately billed
OpenRouter/API access remain separate. Credentials are not scraped from files.

After a successful connection check, **First task** opens a project-exploration
draft with folder selection. Review and send it explicitly. Connection checks do
not establish real inference success. Existing chat history, cancellation and
draft preservation are reused.

## Jev decision model

In a project's task form, expand **Task preferences and Jev decision model**.
Writing prefers Claude; coding prefers Codex; general uses evidence-based scores.
Automatic proposals require fresh connection checks and exclude exhausted,
policy-blocked, approval-pending and paid API agents. Manual selection remains
available and execution always passes through the existing workspace policy.
Codex/Claude subscription authentication must be confirmed by a fresh provider
check; a CLI signed in with an unknown billing method is not automatically selected.
Other providers with unverified billing remain available through manual selection.

Jev is a role, not a new provider or fabricated model. Enable it and select an
existing read-only-capable provider and a model from its connection catalog.
**Show proposal** explicitly sends up to 4,000 characters of the task to that
provider and consumes its quota. Changing a select or editing text does not make
an inference call. The backend rechecks the decision model's catalog.

One reasoning call has a 45-second deadline. Its JSON answer can only contain
`agent`, which must be an eligible candidate or null (clarification needed).
Unknown IDs, extra permission fields, failures and timeouts use the deterministic
fallback. A null answer asks the user to clarify; it does not launch work. The
reviewer uses rules and cannot be the author. Applying the proposal still requires
a click. Changing task/options invalidates the previous proposal.
Cancel stops the decision call without applying a fallback choice; application
shutdown also aborts the provider and waits for its process cleanup.

The decision call uses a separate directory and the existing read-only adapter.
The prompt forbids tools, but this is not a new universal tool-free sandbox:
provider read-only restrictions remain the enforcement boundary. Jev never
receives authority to approve writes or paid access.

The last 100 decisions are stored locally in `routing-history.json`; task text
and raw model responses are not saved there. The UI shows eight recent entries.

## Verification and remaining limits

Unit/UI tests exercise failure and consent paths with fixtures. They do not
prove every provider account is authenticated or guarantee subscription quotas.
Installers are third-party network operations and are not executed by automated
tests. Account-specific login and real task response need the user's own account.
Specialized tool-aware 3D routing and automatic repeated failover are not claimed;
users select the required tools/provider explicitly. No new official release is
published by this change.

Official sources: [Codex](https://learn.chatgpt.com/docs/codex/cli),
[Claude](https://code.claude.com/docs/en/setup),
[Antigravity](https://antigravity.google/docs/cli/install/).
Design references and licenses: [Claudex / CC Switch research](research/claudex-cc-switch.md).

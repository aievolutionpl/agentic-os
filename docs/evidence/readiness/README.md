# Local readiness evidence — 24 October 2026

Isolated test profile, Electron 43.8.3. No real installer or subscription
inference runs in these screenshots/tests. The header quota cards are fixtures.

- [Connections, desktop](connections-1440.png)
- [Connections, narrow window](connections-390.png)
- [Pure White header](header-white-1440.png)

`scripts/onboarding-qa.mjs`: no terminal at startup or guide expansion; explicit
installation action; first task disabled before a successful check; no page errors
or document overflow at 390, 768 and 1440 pixels.

`scripts/header-qa.mjs`: seven quota cards, no overlap or horizontal overflow
at 320–1920 pixels, wide sidebar and search/keyboard behavior.

`scripts/jev-qa.mjs`: one explicit decision call, selected model, no inference
on mount/toggle/edit, stale proposal invalidation. These model responses are
fixtures; they do not establish live provider compatibility.

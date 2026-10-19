# ADR-001: Electron, React, TypeScript and main-owned SQLite

Accepted for bounded slice, 2026-10-19. Windows desktop is mandatory in latest brief. Compared Electron (Chromium embedded, Node main, existing cached distribution) with Tauri (Rust toolchain and WebView2 packaging not exercised here) and browser-only localhost shell (does not meet desktop target). Electron selected for local feasibility and visible Chromium later. React supplies UI, TypeScript strict contracts, Vite assets. Node built-in SQLite avoids native add-on rebuilds; runtime must include node:sqlite. Main owns one WAL writer and schema version. No HTTP server or port required; narrow preload IPC replaces Fastify for this increment. Worker service remains separate in future.

Local source inspection: Hermes desktop package.json, electron/main.ts and root LICENSE, commit b3710e60823f108945fce9804201fb3b001a716c. This demonstrated Electron build/security complexity; no Hermes code copied. React and Vite license text inspected locally. GitHub inspection with gh failed (network); no upstream verification asserted. Dependency tarballs are pinned with lock integrity after offline install.

Security: main-frame sender allowlist, exact file URL, context isolation, sandbox, no renderer Node, popup/navigation/webview denial, restrictive CSP and network filtering. No credentials functionality or agent execution. Folder references remain inert metadata, not filesystem grants. Future secrets belong only in main OS-backed store; future browser cannot share preload.

Rollback: UI and domain service are separated by typed API. Replace host transport without changing project/task/memory semantics. Native Windows packaging remains unverified; do not distribute as Windows-ready.

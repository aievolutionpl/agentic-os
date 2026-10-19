# OSS inspection and reuse

Network attempts: curl registry.npmjs.org failed DNS; gh api repos/electron/electron failed connection. No network-derived license/version claims. No source copied from reference apps.

Local reference read before selection: /home/aibot/.hermes/hermes-agent at b3710e60823f108945fce9804201fb3b001a716c, apps/desktop/package.json, electron/main.ts, root LICENSE (MIT, Nous Research). Reference only; its gateway, credentials and bootstrap code are deliberately outside this slice. Electron distribution cache permits isolated Linux smoke. Electron was selected for bundled Chromium/native desktop and available runtime; Tauri requires an untested toolchain.

CC Switch, OpenQuota, Paperclip, Emdash, Orca and ACP remain uninspected upstream due network restrictions; none reused. Their licenses/SHAs must be verified before adoption. No OAuth proxy or quota reader reused. Curated skill library not yet imported.

Direct dependency notices will be retained from installed packages under licenses/. Full transitive inventory generated from local installed package metadata; shipping license/security review remains a release gate. Package install lifecycle scripts disabled; only explicitly audited Electron distribution unpack and Vite build are used.

# Data Storage Audit

Classification:

- A: build-time static asset
- B: runtime cache
- C: temporary scratch file
- D: production app data
- E: test fixture
- F: local development only

| Storage location | Module/path | Data stored | Class | Survives deploy/restart | Founder/app data | Production safe | Migration requirement | Impact if it disappears | Recommended fix |
|---|---|---:|---|---|---|---|---|---|---|
| `data/social-command-center.json` | `scripts/storage.mjs` `JsonStore` | full local OS state | D/F | no on Render deploy/rebuild | yes | no for production | yes | captures, tasks, Social, Proof, closeouts can vanish | Use `DATABASE_URL` Postgres adapter for production; keep JSON local-only |
| `leos_core_records` Supabase table | `scripts/storage.mjs` `SupabaseCoreStore` | generic OS collections | D | yes when configured | yes | yes if service key is server-only | optional, if moving to `DATABASE_URL` | missing config falls back locally today | Keep as legacy supported path, but make `DATABASE_URL` canonical durable contract |
| `data/seed/social-command-center.seed.json` | seed loader | demo seed data | E/A | yes in git | demo only | yes as fixture | no | demo fallback missing | Keep as seed fixture |
| `data/exports/**` | export/snapshot/report helpers | generated exports and backups | C | no | may include derived app data | no as source of truth | no source-of-truth migration | exports disappear | Treat as downloadable/export artifacts only |
| `data/backups/**` | backup helpers | local backup copies | C/F | no | yes | no as production backup | no | local restore points disappear | Document provider backups; do not rely on app disk |
| Browser `localStorage` / `sessionStorage` | generated client auth helpers | owner token/session marker | B | browser-local | token only | acceptable for auth token storage, not app data | no | user signs in again | Never use as source of truth for OS records |
| In-memory `Map` / `Set` | render helpers, caches, tests | caches and dedupe sets | B/E/F | no | no durable source | yes when cache-only | no | cache rebuilds | Keep cache-only; memory-dev is development-only and blocked in production DB paths |
| Posting/export package files | `scripts/preview-server.mjs` export helpers | generated assets and packages | C | no | derived artifacts | no as source of truth | no | artifacts can be regenerated/exported | Store canonical records in Postgres, generated files as exports |
| Local server manager files | `scripts/local-server-manager.mjs` | pid/log state | F | local only | no | not production app data | no | local status lost | Keep local-only |

Summary:

The production risk is the default JSON store. Local JSON is useful for demos and tests, but production app data must use durable Postgres through `DATABASE_URL` or a configured Supabase Postgres layer. Social records are production app data and must be included in durable storage.

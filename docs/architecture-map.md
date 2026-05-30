# Architecture Map

Entry point:

- `scripts/preview-server.mjs` starts the HTTP server and emits the generated client script.

Generated client:

- `scripts/preview-server.mjs` contains `htmlShell()`, route rendering helpers, client `api()`, global error handlers, and Recovery Mode.

Routes:

- Hash routes are normalized inside `scripts/preview-server.mjs`.
- The accepted main nav is Today / Work / Social / Proof / Search.

Storage:

- Current legacy store: `scripts/storage.mjs`.
- Durable production storage contract: `lib/storage/index.mjs`.
- Postgres adapter: `lib/storage/postgres.mjs`.
- Development-only memory adapter: `lib/storage/memory-dev.mjs`.
- Schema: `lib/storage/schema.sql`.
- Migration helpers: `lib/storage/migrations.mjs`.

Auth and roles:

- Owner-token auth: `scripts/access-control.mjs`.
- Role capability checks: `scripts/roles.mjs`.
- Endpoint safety inventory and forbidden guards: `scripts/auth-endpoint-hardening.mjs`.

Health:

- `/api/health` is implemented in `scripts/preview-server.mjs`.

Social:

- Social UI, route aliases, and internal social actions live in `scripts/preview-server.mjs`.
- Social records must be durable in production and remain manual-only.

Le-E:

- Engine: `scripts/lee-engine.mjs`.
- Conversation context: `scripts/lee-conversation-context.mjs`.
- Quick Capture: `scripts/lee-quick-capture.mjs`.

Tests:

- Product-shape tests are in `scripts/test-founder-language-and-clutter.mjs`, `scripts/test-social-workspace.mjs`, and `scripts/test-route-map-integrity.mjs`.
- Generated client safety is in `scripts/test-generated-client-script-syntax.mjs`.
- Hardening tests are named `scripts/test-*-hardening*.mjs`, `scripts/test-storage-durability.mjs`, and related scripts.

Known fragile areas:

- Generated inline client JavaScript in `scripts/preview-server.mjs`.
- Hash route normalization.
- Boot-state/full-state loading.
- Social manual publishing language.
- Storage fallback behavior.

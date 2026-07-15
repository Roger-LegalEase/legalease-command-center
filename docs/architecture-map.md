# Architecture map

The HTTP entry point is `scripts/preview-server.mjs`. The primary founder navigation is Today, Queue, Campaigns, Review Desk, Reports, and More. Generated browser code and hash-route normalization remain in that file; security-sensitive areas touched by the hardening are extracted into focused modules.

Storage uses `scripts/storage.mjs`. Hosted production selects `SupabaseCoreStore` explicitly and applies versioned compare-and-swap or transactional mutation RPCs from `supabase/migrations/`. JSON is an explicit development/test adapter only. `scripts/runtime-security.mjs` is the single startup contract used by the server and `lib/storage/index.mjs`.

Authentication uses `scripts/session-auth.mjs`: opaque tokens, hash-only durable storage, expiry, revocation, rotation, HttpOnly cookies, and CSRF proof. `scripts/access-control.mjs` and `scripts/roles.mjs` enforce exact capabilities. Bootstrap role credentials are login-only; a static bearer token is not a session.

Request limits and application headers live in `scripts/request-security.mjs`. `/api/health` is constant liveness; protected readiness and diagnostics expose only bounded dependency booleans. OAuth callbacks validate signed single-use state before mutation. SendGrid webhook verification operates on exact raw bytes and uses durable replay claims and shared rate counters.

Viewer DTOs and server-only state removal live in `scripts/role-dto.mjs`. Private draft asset authorization/signing lives in `scripts/private-assets.mjs`. Social provider calls are coordinated by `scripts/social-publish-service.mjs`. Append-only, tamper-evident events use `scripts/audit-service.mjs` and the dedicated Supabase audit table.

Canonical and extended tests are driven by `package.json`. Local server tests use `scripts/test-support/preview-server-harness.mjs`, which provides an allowlisted environment, temporary state, ephemeral ports, provider gates off, and reliable teardown. Privacy/secret scans and migration validation run locally and in CI.

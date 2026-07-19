# Social production train integration manifest

Status: additive Lane A contract. Reserved runtime, role, shell, navigation, package, feature-flag, and shared-fixture files are intentionally unchanged.

## Shared registrations

- Gate every registration below server-side with `COMMAND_CENTER_UX_VNEXT_SOCIAL === "true"`; absent, false, browser storage, cookies, query strings, and hashes must never enable it.
- Import Social production action modules into `scripts/preview-server.mjs` only on the Integration branch. Resolve the exact authorized Post before every action and pass a fresh compact state snapshot.
- Register Social action roles in `scripts/roles.mjs`: creative, variant, schedule, and feedback writes require `manage_content_drafts`; approval requires `manage_approval_queue`; publish requires `social_publish`; every action also requires an authenticated current session.
- Keep `scripts/ui/pages/post-composer.mjs` as the sole `#social/post/<encoded-id>` composer renderer and register its existing controller through `scripts/ui/app-shell.mjs`.
- Keep `assets/ui/post-composer.css` page-scoped and register it through the existing composer stylesheet composition.

## CCX-303B endpoints and adapters

- `POST /api/ui/social/post/:postId/creative` → `saveSocialCreativeSelection`. Provide `commitPostMutation`, implemented as one atomic scoped Post mutation with expected-version and request-id idempotency plus the supplied activity and append-only audit evidence. Do not accept browser catalog, approval, or eligibility truth.
- `POST /api/ui/social/post/:postId/render` → `renderSocialCreative`. Provide the existing reviewed render/image-generation operation as `renderPost`; it must use the supplied exact source references and idempotency key, retain the previous current image on failure, and return only `{ ok, imageId, reused }`.
- Response contracts must be rebuilt with `buildPostComposerContract`; do not return full company state, asset bytes, private paths, signed URLs, provider payloads, or credentials.

## Registration backlog

- Package script: `test:vnext-social-creative-actions` → `node scripts/test-vnext-social-creative-actions.mjs`.
- `POST /api/ui/social/post/:postId/variants` → `saveSocialVariants` from `scripts/social-variant-actions.mjs`. Supply the same atomic `commitPostMutation` adapter; preserve stored deselected variants, stable IDs, creative references, explicit blanks, and fallback absence exactly.
- Package script: `test:vnext-social-variant-actions` → `node scripts/test-vnext-social-variant-actions.mjs`.
- Later packet commits extend this manifest with scheduling, review, publishing, browser specs, fixtures, performance budgets, and rollback.

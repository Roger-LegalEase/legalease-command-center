# Test Matrix

- `scripts/test-generated-client-script-syntax.mjs`: catches generated JavaScript syntax failures.
- `scripts/test-route-map-integrity.mjs`: catches route collapse and wrong page rendering.
- `scripts/test-button-action-feedback.mjs`: catches silent buttons and missing pending states.
- `scripts/test-lee-visible-actions.mjs`: catches Le-E no-op behavior.
- `scripts/test-safe-boot-mode.mjs`: catches Recovery Mode regressions.
- `scripts/test-founder-language-and-clutter.mjs`: preserves founder language and nav shape.
- `scripts/test-social-workspace.mjs`: preserves Social as a first-class workspace.
- `scripts/test-storage-durability.mjs`: verifies durable storage adapter behavior.
- `scripts/test-no-filesystem-production-db.mjs`: blocks production filesystem/localStorage/memory source-of-truth risk.
- `scripts/test-secret-exposure.mjs`: blocks hardcoded or client-exposed secrets.
- `scripts/test-env-contract.mjs`: verifies environment documentation and validation.
- `scripts/test-ai-context-contract.mjs`: verifies AI-readable product and safety docs.
- `scripts/test-error-boundaries-and-loading-states.mjs`: verifies fallback, retry, and loading protections.
- `scripts/test-no-white-screen.mjs`: verifies core pages render fallback UI.
- `scripts/test-privacy-route.mjs`: verifies privacy basics.
- `scripts/test-production-hardening-health.mjs`: verifies safe health readiness output.

Run `npm run verify` before shipping. For hardening changes, also run every hardening test individually.

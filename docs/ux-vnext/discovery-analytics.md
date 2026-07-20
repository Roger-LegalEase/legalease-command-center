# Privacy-safe Discovery analytics

CCX-704 defines eight additive product events for Phase 7: destination opened, workflow started, workflow completed, workflow abandoned, validation blocked, action failed, time to first completed workflow, and search result selected.

The server contract accepts only event-specific scalar fields. Destination, workflow, action, reason, source, and result identifiers come from reviewed closed registries; workflow correlation uses a random opaque journey ID; durations and result positions are bounded integers. Unknown fields and unregistered identifier values fail closed. The normalized event contains no actor ID, message content, record content, free-form metadata, provider payload, or credential material.

The browser adapter emits to an integration-supplied same-page sink. It does not call a network endpoint, read or write cookies or browser storage, enable an external action, or change any production gate. Workflow lifecycle events use reviewed custom-event fields only. Extra event detail is ignored, so email bodies, Social post bodies, legal facts, recipient addresses, OAuth or secret values, and Partner communications cannot enter the analytics contract. Active journeys emit an abandonment event on `pagehide`.

Integration must provide an authenticated, CSRF-protected compact endpoint and durable append-only writer before enabling the adapter. The endpoint must normalize every event again with `buildPrivacySafeAnalyticsEvent`; it must never persist the raw browser body. The feature remains behind `COMMAND_CENTER_UX_VNEXT_DISCOVERY`, default false. Rollback removes the sink and browser registration while preserving already normalized aggregate evidence.

Focused verification:

- `SKIP_ENV_LOCAL_FILE=1 node scripts/test-vnext-discovery-analytics.mjs`
- `SKIP_ENV_LOCAL_FILE=1 npx playwright test tests/browser/discovery-analytics.spec.mjs --project=chromium`

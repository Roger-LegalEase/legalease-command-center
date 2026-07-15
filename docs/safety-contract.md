# Safety contract

- Every email, outreach, reactivation, social-publishing, and provider-mutation gate defaults off. Repository work must not enable one.
- Hosted production requires Supabase, server-managed authentication, strong session and encryption keys, and enabled-route verification keys before the server listens.
- Browser authentication uses short-lived opaque sessions in HttpOnly cookies. Bootstrap credentials are accepted only by the login endpoint and never as API bearer tokens.
- Authorization is enforced per route and capability. Viewer/investor sessions receive allowlisted aggregate reports only.
- Outbound work is claim-before-call. Email and social publish claims are durable; ambiguous provider outcomes require reconciliation and are never automatically repeated.
- OAuth state is signed, expiring, session/provider/redirect-bound, and single-use before any connector mutation.
- Draft assets remain private. An approved publishing flow is required before a final asset can be promoted.
- No secret, raw provider payload, unnecessary personal data, cookie, authorization header, or token may enter browser state, logs, audit summaries, fixtures, or tracked evidence.
- Production app data must not use local JSON, browser storage, or process memory as its durable source of truth.
- Tests stub provider calls and run with all live gates off.

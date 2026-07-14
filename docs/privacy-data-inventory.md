# Privacy and data inventory

| Category | Examples | Active storage | Retention/deletion owner |
|---|---|---|---|
| Founder and role access | hashed opaque sessions, role, expiry, revocation | Supabase core records; local JSON only in explicit development | Security owner; expire in 30 minutes and revoke on logout/role change |
| Consumer and lifecycle operations | contact details, eligibility/lifecycle state, suppression, unsubscribe, bounce/spam state | Supabase core records | Operations/privacy owner; retain only for campaign, legal, and suppression obligations; delete or de-identify through an approved request |
| Campaign delivery | approved content, send claims, safe provider identifiers, outcomes | Supabase core records | Campaign owner; claims retained for duplicate prevention and archived under the retention schedule |
| Gmail and Calendar read paths | message/meeting metadata and derived summaries | Supabase projections where explicitly saved | Workspace owner; read-only scopes; delete derived records when no longer operationally needed |
| Revenue and product metrics | Stripe aggregate reads, signup/funnel aggregates, revenue-contact workflow records | Supabase core records and short-lived server caches | Finance/product owner; viewers receive aggregates only |
| Social connectors | encrypted access/refresh tokens, account readiness, approval state, publish claims | Supabase core records; tokens encrypted server-side | Security owner; revoke provider access and delete local connector records on disconnect |
| AI processing | approved prompts/drafts and generated asset metadata sent to OpenAI or Anthropic when configured | Supabase records and private draft storage | Product/security owner; do not send unnecessary contact data; follow processor retention settings |
| Draft assets | human uploads and generated draft images | private Supabase bucket in hosted production; `data/private/` locally | Content owner; delete abandoned drafts per content schedule; public promotion requires approval |
| Security and audit | append-only events, request IDs, safe summaries, webhook replay claims, OAuth nonce claims, rate-limit counters | Supabase audit table and versioned core records | Security owner; audit retention 13 months minimum unless policy requires longer; replay/rate records expire by bounded windows |

Active processors/integrations visible in code include Render, Supabase, SendGrid, Google Workspace, LinkedIn, X, Meta, Stripe, OpenAI, and Anthropic. Provider console configuration and contracts require separate verification. Raw provider webhook payloads, authorization codes, cookies, credentials, and unnecessary personal data must never be logged or placed in audit summaries.

Deletion requests require identity/authority verification, a scoped search across core records/private assets/audit-policy exceptions, provider-side revocation where relevant, and a recorded safe audit outcome. Append-only security events are not edited; privacy-required erasure uses a reviewed tombstone or cryptographic/de-identification procedure consistent with legal obligations.

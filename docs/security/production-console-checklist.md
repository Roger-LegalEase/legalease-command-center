# Manual production-console verification

- Render: configure every required variable in `docs/secrets-and-env.md`, keep every outbound/discovery gate false, verify the web service uses `npm run start:production`, and verify the cron has only its dedicated token.
- Supabase: apply migrations in order, verify service-role-only RPC grants, RLS, private draft bucket policy, backups/PITR, monthly restore evidence, audit immutability, and claim uniqueness.
- SendGrid: enable signed event webhooks, install the matching public verification key, verify the exact URL/TLS and event selection, remove obsolete endpoints, and perform only a synthetic signed test.
- OAuth providers: verify exact HTTPS redirect URIs, least-privilege scopes, current client secrets, revoked obsolete tokens, and private connector records.
- Assets: verify the draft bucket is private, signed URL lifetime is bounded, public bucket promotion is approval-only, and legacy public draft paths are inaccessible.
- Rotation: revoke old role/bootstrap, session, cron, product-event, OAuth, SendGrid, Supabase, AI, and signing credentials; document completion without recording values.
- Monitoring: configure external alerts for readiness, storage failures, version conflicts, webhook rejection/replay, auth throttling, ambiguous publish claims, and missed heartbeat windows. Repository integration points do not prove external alerts are active.

# Supabase backup and restore

Hosted Command Center persistence is the Supabase REST adapter over `public.leos_core_records`, `public.leos_audit_events`, and `public.leos_social_publish_claims`, plus a private draft-assets bucket. `DATABASE_URL` is not the hosted application path.

Target RPO is 24 hours with a four-hour target for security/audit records when PITR is available. Target RTO is four hours for the control plane and eight hours for private assets. The production owner must verify Supabase backup/PITR status and a downloadable manual backup monthly; repository work cannot verify console settings.

Before restoration, freeze deployments and automation, keep every outbound gate off, revoke active sessions, export migration checksums, and take a pre-restore backup. Restore into an isolated Supabase project/schema first. Apply migrations in order, restore core records, append-only audit events, publish claims, and private objects without making the bucket public. Never overwrite audit events or ambiguous publish/send claims.

Validate row counts and non-reversible fingerprints, record versions, audit-chain continuity, unique claims, private-bucket policy, role denial, startup readiness, and all outbound gates. Run `npm run restore:drill` for the synthetic repository harness and `npm run migrations:validate`. Only then schedule a controlled production restore. After restore, rotate session generations, restart OAuth flows, reconcile every publishing/send claim using provider read-only history, and re-enable no live gate without a separate approved decision.

Forward recovery is preferred for migration failures. Each migration has a matching file in `supabase/recovery/`. If validation fails, leave automation off, preserve restored evidence, return traffic to the last verified environment, and open an incident with request IDs and safe fingerprints only.

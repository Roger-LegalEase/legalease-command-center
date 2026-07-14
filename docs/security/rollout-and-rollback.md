# Hardening rollout and rollback

Deploy in this order: take and verify backups; keep all gates off; apply the version/audit/publish migration; validate schema/RPC grants; configure required Render secrets and private bucket; deploy one application instance; verify liveness and authenticated readiness; revoke old browser sessions; run session/RBAC/webhook/OAuth/private-asset synthetic checks; then scale. Old bearer credentials are intentionally invalid and users must sign in again.

On rollback, keep gates off. Roll application code back before removing any schema surface. Preserve version columns, audit events, session/replay records, and publish/send claims. Revoke all sessions, reject webhooks if verification is uncertain, force OAuth restart, and reconcile ambiguous provider actions read-only. Follow the migration-specific recovery document; forward repair is preferred.

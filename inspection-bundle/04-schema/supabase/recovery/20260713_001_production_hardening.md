# Production hardening migration recovery

Forward recovery is preferred. Before applying, take a Supabase backup, record the migration checksum, keep every outbound gate off, and verify no older application writer is running.

If core CAS deployment fails, roll application instances back first. The `version` column is backward-compatible and should remain. Correct the RPC and reapply the migration in an isolated transaction. Drop CAS functions or the column only after every version-aware writer is retired and a backup is verified.

If social-claim deployment fails, keep all social gates off. Preserve `leos_social_publish_claims` and `publishClaims`; inspect every `publishing` or `reconciliation_required` row against provider read-only history. Never republish automatically. Roll back application code only after ambiguous claims are reconciled.

If audit deployment fails, preserve `leos_audit_events`, its immutability trigger, and the generic projection. Repair the append function forward. Do not delete or rewrite existing audit rows. An application rollback may stop new append-only events, so high-risk actions must remain disabled until append verification passes.

Session, webhook replay, and OAuth nonce records are generic versioned records. On rollback, revoke all browser sessions, reject webhooks, and require users to restart OAuth flows. Do not restore old static bearer authentication.

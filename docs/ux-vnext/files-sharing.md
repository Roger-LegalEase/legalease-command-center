# CCX-606 File sharing and access

File access changes update the authoritative source record's `allowedRoles`
through a scoped current-record write. Only the existing `manage_roles`
capability can grant or revoke access. Every change has an idempotency key,
activity event, and audit record. Revocation affects the next projection read;
record access never grants private storage metadata by implication.

The current security model has no reviewed expiring public-link authority, so
this packet does not invent one. No storage URL is described as public and no
browser state grants access.

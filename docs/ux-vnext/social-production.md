# Social production completion (CCX-303B through CCX-308B)

This train extends the existing canonical Post composer. It does not add a second Post, creative, readiness, scheduling, review, or publication model.

## Founder workflow

The composer now presents reviewed creative selection, exact approved assets, independent channel variants, explicit scheduling, the current readiness and review truth, and controlled publication state. Calendar offers month/week and all-channel filtering with an unscheduled tray. Settings presents four distinct connection states without exposing credentials or allowing the browser to change environment gates.

Every mutation accepts the exact Post identity, expected version, and bounded request ID. Server adapters must resolve current authorized state and commit only their scoped fields with activity/audit evidence. Asset selection uses canonical source references; variant fallback is represented by absence rather than copied shared text; scheduling requires an explicit offset and IANA timezone; approval never schedules or publishes.

Publishing reuses durable claims keyed by Post, channel, and approved revision. A lost duplicate claim makes no provider call. Each channel records success or failure independently, successful channels are excluded from retry, and unsafe or token-bearing URLs are discarded. Manual-package creation is informational and never creates Published truth.

## Integration boundary

The feature remains inert until the Integration lane registers the manifest endpoints, controllers, styles, role mappings, package tests, synthetic browser fixture, and the server-only `COMMAND_CENTER_UX_VNEXT_SOCIAL` flag. Default-off and rollback behavior preserve all existing Post records, references, schedules, approvals, claims, results, activity, and audit evidence.

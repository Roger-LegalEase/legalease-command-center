# CCX-409 Campaign replies and outcomes

Replies are an authorized compact projection linked to one exact Campaign. They show response need, confirmed classification, separately labeled AI suggestion, supporting evidence, meeting/next-step truth, and source reference. Full reply bodies are not copied; roles without `read_sensitive` receive only an availability statement.

Action plans cover classification, a Partner follow-up task, meeting/next-step activity, reply-to-Partner activity, and a Partner-stage proposal. All require current server authorization and audit integration. Stage recommendations remain suggestions and never mutate Partner stage. The action plan deliberately omits reply body content and reports zero external actions.

## Lane B dependency

The reviewed Partner train contract is PR #100 head `0300f052fad33451a62c952e4ea3c5fd61fb651d`, documented in `docs/ux-vnext/partners-train-integration-manifest.md`. Integration maps `partner_log_activity` to `logPartnerActivity`, `partner_set_next_action` to `setPartnerNextAction`, and `partner_stage_suggestion` to `applyPartnerStageSuggestion` without copying those adapters.

The stage action carries only the reviewed Partner suggestion ID, explicit confirmation, Partner ID, reply reference, and idempotent request ID. The Partner operation performs the fresh current-state lookup and rechecks reviewed classification, visible evidence, authorization, and suggestion availability before its scoped write and activity/audit evidence. No browser-supplied stage or evidence is trusted, and no silent stage mutation fallback is permitted.

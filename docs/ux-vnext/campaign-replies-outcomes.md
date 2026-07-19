# CCX-409 Campaign replies and outcomes

Replies are an authorized compact projection linked to one exact Campaign. They show response need, confirmed classification, separately labeled AI suggestion, supporting evidence, meeting/next-step truth, and source reference. Full reply bodies are not copied; roles without `read_sensitive` receive only an availability statement.

Action plans cover classification, a Partner follow-up task, meeting/next-step activity, reply-to-Partner activity, and a Partner-stage proposal. All require current server authorization and audit integration. Stage recommendations remain suggestions and never mutate Partner stage. The action plan deliberately omits reply body content and reports zero external actions.

## Lane B dependency

The Partner train is currently unmerged at `origin/codex/train-partners-ccx-501-506` SHA `e35c39f5122a7b0aac17e7c240c598b6f639c524`. No published Partner integration manifest exists there. Integration must adapt `partner_log_activity` to `logPartnerActivity` and `partner_set_next_action` to `setPartnerNextAction` from that branch’s `scripts/partner-record-actions.mjs`, or their merged equivalents. `partner_stage_suggestion` requires the Partner train’s reviewed stage-suggestion operation; no silent stage mutation fallback is permitted.

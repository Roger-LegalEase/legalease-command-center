# vNext reliability and recovery

CCX-802 defines one truthful recovery catalog for read timeout, write timeout, network loss during
save, third-party publishing failure, partial multi-channel publishing, SendGrid rejection,
expired authorization, Supabase unavailability, missing assets, invalid routes, and stale browser
actions.

Every entry states what happened, what did not happen, explicit saved/sent/published/uploaded/
changed truth, and the next safe action. Unknown save outcomes remain unknown. External actions,
write timeouts, network-loss saves, and stale actions never retry automatically. Partial Social
success preserves successful channels and makes only failed eligible channels available for an
explicit reviewed retry.

Post Composer and Quick Capture retain browser-local entered work when the connection ends before
a save result can be confirmed. The user is told to inspect the saved record before trying again,
preventing an uncertain write from being duplicated. Hosted storage still fails closed when
Supabase is required but unavailable.

Run `npm run test:vnext-recovery` and
`npm run test:browser -- reliability-recovery.spec.mjs shell-resilience.spec.mjs`.

# vNext troubleshooting

## Shell or route does not render

Confirm `/api/version`, authentication, global and product flags, and the exact route. Use a preserved alias once. If a white screen or repeated boot failure occurs, set `COMMAND_CENTER_UX_VNEXT=false` and follow the production runbook rollback; do not change persisted data.

## A read times out

Retry the read after checking storage health. A read retry cannot create an external action. If Supabase or private storage is unavailable, hosted production must fail closed and say that nothing was changed.

## A save is interrupted

Keep entered work in the browser where safe. Treat the saved/changed result as unknown, inspect the exact object after connectivity returns, then decide whether to save again. Never automatically retry a send or publish.

## A send or publish fails

Read the channel-by-channel result. The UI must identify what happened, what did not happen, and whether anything was sent or published. For partial multi-channel results, inspect idempotency records before a human retry. SendGrid rejection is not delivery.

## An asset is missing or stale

Verify access, signed URL health, storage metadata, and current-version status. Missing, failed, or stale records cannot count toward Investor Room readiness. Do not expose a bucket or weaken access filtering to make a preview work.

## The demo has unexpected data

Stop the server, rerun `npm run demo:vnext:load`, and point the server at `/tmp/legalease-command-center-vnext-demo.json`. The loader prints its backup path. It refuses Supabase; do not bypass that guard or sync its output to production.

## Brand drift

Run `npm run test:vnext-brand-contract`. Primary actions are exact `#F04800`; use `assets/brand/logos/legalease-logo-white-2025.png` without modification and compare composition to `docs/ux-vnext/reference/command-center-vnext-approved-direction.png`.

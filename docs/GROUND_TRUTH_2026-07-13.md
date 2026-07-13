# Ground-truth reset — 2026-07-13 (from Roger, verbatim source of truth)

This supersedes all seed/demo data. Prod Supabase (`leos_core_records`) was corrected
directly on 2026-07-13; this file records what is true so future sessions and scripts
never resurrect the May demo fiction.

## Products (collection: `products`, new)
- **Expungement.ai — live.** All 50 states, 68 ratified attorney-signed petition routes,
  $50 flat fee. Pardon services being added in the coming weeks
  (milestone `milestone-pardon-services`).
- **RecordShield — building.** Not launched. Zero users, zero campaigns. The 9.5 numbers
  (1,000 users, 20% conversion) are launch targets, not live metrics.
- **ClaimCoach — research.** Third vertical: soft-tissue injury claims.

## Partner pipeline (collection: `partners`, replaced wholesale)
- **We Must Vote** — the ONLY onboarded/live partner; co-branded landing page in production.
- **TimeDone** — pitching. Contact Saad, met ~June 28, interest in 500 expungements.
  Overview packet due week of Jul 13; reconnect ~Jul 27.
- **Elevation Project** — pitching. Contact Latrista, met Jul 7, interest in 100
  expungements; awaiting her email response, nudge Fri Jul 17 if quiet.
- **Giving Others Dreams (Celia Colon), Chicago** — pitching, FY2027 budget cycle.
  STRATEGIC: ~400 February expungement wins stuck in the Cook County clerk backlog; she
  promised an introduction to the clerk's office (court-side market opportunity).
- **Harris County / Commissioner Ellis** — proposal sent, went quiet.
- **Fulton County Solicitor-General** — `meeting_requested` (NOT signed_pilot). They asked
  for a meeting time last week, Roger replied, quiet since; nudge by Wed Jul 15.
- **Clean Slate Initiative** — `meeting_scheduling`; Alex scheduling for week of Jul 20.
- **Goodwill of Mississippi** — never contacted; record deleted.

## Pilots
None. All three pilot records were seed fiction — deleted. Signed pilots = **0**/3.

## Campaigns (collection: `campaigns`)
Only real campaign: **Expungement.ai reactivation (B1)**, resumed 2026-07-13. All
RecordShield-named campaigns and their referral numbers were fiction — deleted.

## Purged as fiction (2026-07-13, rows backed up before delete)
6 demo partners, 3 demo pilots, 5 demo campaigns, 5 demo tasks, 12 demo data-room items
(both `dataRoomItems` and `dataRoom`), 6 demo posts, 2 demo report records. The three
seed `partnerPrograms` rows are flagged `archived` (not deleted) because the deployed
seed file would resurrect them on Supabase-fallback reads until the seed cleanup in this
change is promoted; they can be hard-deleted after the next Render promote.

## Seed-resurrection paths closed in this change
- `POST /api/growth/seed-six-month-plan` + `sixMonthSeedData()`/`seedSixMonthPlan()` and
  the settings-page button: **removed** (re-inserted any missing `seed-*` record).
- `scripts/create-demo-dataset.mjs` / `scripts/prepare-launch-demo.mjs`: refuse to run
  unless `ALLOW_DEMO_DATA=1`, and never with `STORAGE_BACKEND=supabase`.
- `data/seed/social-command-center.seed.json`: fictional `partnerPrograms`,
  `growthSignals`, `nextBestActions`, `recommendedActions` removed (this file is the
  Supabase-fallback base state on prod).

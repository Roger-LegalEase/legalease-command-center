# CCX-401 Outreach home

The founder-facing Outreach home is the compact campaign list at `#outreach`. It is built from the existing CCX-400 `CampaignView` projection and source adapters; it does not introduce another Campaign model or change any stored campaign, recipient, attempt, reply, suppression, approval, or reactivation collection.

## Founder contract

The page provides All, Draft, Scheduled, Active, and Completed views. Paused remains a truthful row status in All and is deliberately not a separate view. The list keeps the primary reading order to Campaign, Audience, Status, Next action, Next send, Replies, Meetings or outcome, and Owner. Missing source truth is shown as **Unavailable**. Explicit stored zeroes remain `0`.

The only primary action is **New campaign**. It hands off to the existing Global Create `outreach-campaign` workflow, which creates an inert draft with no selected audience and no sending. CCX-401 adds no launch, pause, resume, approval, audience, message, schedule, provider, or execution control. The five-step wizard remains deferred to CCX-402.

## Data and safety boundary

`GET /api/ui/outreach` requires `read_internal`, is available only while the global vNext flag is enabled, reads state once on the server, and returns a compact authorized projection. The browser does not request `/api/state`. The endpoint performs no writes, sends, retries, approvals, provider calls, or analytics refreshes. Restricted records are removed by the existing CCX-400 source adapters before counts and rows are derived.

Canonical Campaign records retain exact links of the form `#outreach/campaign/<encoded-id>`. Adapted outreach and reactivation sources retain their existing safe legacy fallback until CCX-408 supplies detail parity. Browser code uses only the vetted href supplied by the projection and never reconstructs a Campaign link from an ID.

## Route compatibility and rollback

The vNext primary destination is `#outreach`. Existing `#campaigns`, `#campaign`, `#campaign-control`, and `#campaigns-control` bookmarks resolve through the vetted route parser to Outreach. Exact Campaign links retain their existing object-route behavior. Disabling `COMMAND_CENTER_UX_VNEXT` restores the legacy shell and makes the compact endpoint unavailable before state is read.

## Visual evidence

- `outreach-home-populated-1440.png` — populated desktop view
- `outreach-home-narrow-390.png` — narrow responsive view
- `outreach-home-filtered-empty-1440.png` — filtered-empty Completed view
- `outreach-home-unavailable-1440.png` — missing-data treatment

The images live in `docs/ux-vnext/screenshots/ccx-401/` and are produced only by the focused Outreach browser test.

# CCX-301 Social home

CCX-301 turns the existing authenticated Social destination into a compact, read-only home. It does not add a composer, Review Desk destination, scheduling surface, or publication action.

## View contract

The views are always ordered `Ideas`, `Calendar`, `Library`, `Results`; `Ideas` is the default.

- Ideas combines canonical Post identities in Idea or Draft state with truthful, unconverted Content Bank records. A Content Bank record related to a canonical Post is omitted so the same idea is not shown twice.
- Calendar contains all authorized canonical Posts in two semantic groups: Scheduled first, then Unscheduled. It cannot drag, reschedule, approve, or publish. Pagination appends each Post to its existing group without duplicating identity.
- Library contains canonical Draft, Needs review, Scheduled, and Published Posts.
- Results remains available in the Social-home service contract for compatibility. In the enabled browser shell, `view=results` hands off to the CCX-309B compact Results endpoint and dedicated surface, which preserves stricter CCX-309A per-channel publication truth and explicit metric availability.

Every canonical Post links to its server-vetted `#social/post/<id>` route. Unconverted Content Bank ideas link to their exact existing item route. Channel names and customization truth come from CCX-304A; readiness summaries come from CCX-305.

## Endpoint

`GET /api/ui/social` requires authenticated `read_internal` access and accepts `view`, `status`, `channel`, `topic`, `owner`, ISO `dateFrom`/`dateTo`, `limit`, and an opaque `social-<offset>` cursor. The default page has 24 records and the maximum is 40.

The response uses one `generatedAt` server timestamp and returns only view counts, Calendar group counts, filter values, active filters, compact item projections, pagination state, and read-only capabilities. It never returns full company state, raw provider data, credentials, or mutation controls.

`capabilities.createsPost` reuses the existing `POST /api/ui/create/post` authorization decision. Owner and admin accounts may open the existing Global Create Social Post workflow. Operator accounts that can read Social receive a disabled action with a founder-facing explanation; the viewer role also remains creation-ineligible and is denied Social by the existing read policy. The write endpoint still authorizes every eventual submission independently. Opening Social or opening Global Create does not create a Post.

Calendar timing reuses the CCX-306A stored-schedule parser without building the full schedule-plan projection per row. Resolved instants are formatted server-side in their valid stored IANA timezone. Date-only values remain date-only; offset-less wall times use the stored timezone; missing or invalid timezone values preserve the exact stored timestamp and say `Timezone unavailable`; DST gaps and folds remain unavailable or ambiguous rather than being shifted. Date filters use the resulting authoritative Calendar date, including timezone-driven date-boundary changes.

## Safety and failure behavior

The page performs one deduplicated GET for each selected route state and one GET per requested cursor. It does not issue a broad state refresh. When authorized, Create post opens the existing Global Create Post flow; CCX-301 adds no composer or write contract.

Loading, true empty, filtered empty, source unavailable, recoverable error, unauthorized, and session-expired states preserve the shell. A recoverable failure offers one safe retry. Session expiry clears the Social surface through the shared authenticated-shell boundary.

The browser suite verifies exact identity links, Back/Forward behavior, deduplication, pagination, keyboard navigation, visible focus, Axe findings, client errors, horizontal overflow at 1440/1280/1024/768/390, external-action counters, the CCX-309B Results handoff, and the unchanged flag-off queue.

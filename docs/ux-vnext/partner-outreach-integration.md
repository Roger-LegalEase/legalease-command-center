# Partners and Outreach integration (CCX-504)

This packet exposes a clean Partner-domain contract without importing Lane A browser code or duplicating Campaign logic. It reuses `CampaignView`, exact Campaign/Partner source references, Global Create Campaign, Partner activity, and the existing follow-up draft generator.

## Contracts

- Partner selection is server-revalidated from exact canonical IDs after authorization filtering.
- Suppression and ineligibility are rechecked against Partner and explicitly linked contact truth. Browser input cannot restore an excluded record.
- Campaign creation produces a canonical Draft through Global Create. Selected Partner source references are attached, while recipients stay empty, audience selection stays false, live mode stays false, and approval stays not requested.
- One-to-one follow-up returns a review-required draft only. It performs no send, enrollment, approval, schedule, or provider call.
- Related Campaigns use `CampaignView` and retain canonical, Partner-outreach, and reactivation identities without copying records.
- Only explicitly reviewed reply classifications can produce a stage suggestion. The evidence source is visible. Applying requires a second authorized request with an exact server-resolved suggestion ID and `confirmed: true`; it writes bounded Partner/activity/audit records.

Lane A's available manifest currently documents CCX-401 through CCX-403 but does not yet publish a selected-Partners Campaign wizard interface. Integration should connect this contract at the Campaign draft boundary when that interface is published; the Partners train does not guess a private module path.

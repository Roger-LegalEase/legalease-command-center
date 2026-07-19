# CCX-406 Campaign schedule step

Schedule distinguishes Send after approval, Schedule for date and time, and Start sequence. Date/time planning requires an explicit valid time zone. Ambiguous and nonexistent local times fail clearly. The projection resolves valid instants and checks them against the existing authoritative Eastern Time weekday window without granting execution authority.

Advanced uses founder language **Send in batches**; normal UI does not use “wave.” A batch plan, saved schedule, approval, and provider connection never enable sending. Reload restores the nested schedule draft, while the existing outreach/reactivation send-time engines continue to recheck their own windows, caps, approvals, environment gates, and safety rules.

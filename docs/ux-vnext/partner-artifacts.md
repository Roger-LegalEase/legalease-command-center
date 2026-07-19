# Partner programs and artifacts (CCX-505)

Partner record actions delegate to the existing Partner Program generator. The service does not recreate proposal, landing-page, weekly-report, or final-report generation.

Each successful generation stores one authoritative `partnerProgramArtifacts` record with the generator output and one metadata-only `reports` reference. The report contains no copied HTML, Markdown, JSON, or binary; it points to the exact authoritative artifact ID and lets the existing File projection provide the canonical `#files/report/<id>` link. Both records remain Draft, review-required, not externally shared, and not public.

The scoped operation validates actor capability, exact Partner and Program relationships, artifact type, request identity, and server time before generation. An invalid or failed generation returns without creating an artifact, File, Activity, or audit record. Add file reuses Global Create File and truthfully remains metadata-only with no upload or sharing claim.

Legacy Partner proposal/page/dashboard/report/program aliases remain Integration-lane route work. They should resolve to the exact Partner record context without deleting the legacy fallback until rollback review is complete.

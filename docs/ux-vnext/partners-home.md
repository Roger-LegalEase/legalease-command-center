# Partners home (CCX-501)

The Partners home is an additive compact read surface over the merged `PartnerStage` and `PartnerActivity` contracts. It does not replace the lifecycle engine, infer a commercial stage from activity, or return full company state.

## Contract

- Endpoint requested for Integration: `GET /api/ui/partners` with `read_internal` authorization.
- Views: List, Pipeline, Needs follow-up, and Active programs.
- Search covers only projected Partner name, owner, next action, and program/opportunity labels.
- Filters cover represented founder-facing stage, owner, and health values.
- Pagination uses an opaque validated cursor, defaults to 24 rows, and caps at 50.
- Exact Partner links come unchanged from `PartnerStage`.
- Last contact uses the newest authorized Reply, Meeting, or Outreach event from `PartnerActivity`; missing contact truth stays unavailable.
- Pipeline grouping uses `uiStage`. The internal lifecycle stage is neither returned in the compact row nor changed.
- Stalled/paused/dormant conditions remain attention truth. They do not become a new commercial stage.

## Safety

The read model performs no writes, sends, provider calls, approvals, enrollment, scheduling, or lifecycle transitions. Add Partner delegates to the existing Global Create Partner workflow. Browser state cannot grant access, and source visibility is applied by the merged projections before filtering and counts.

Shared endpoint, shell, stylesheet, controller, route, flag, package-script, and browser-spec registrations are intentionally deferred to the Partners train integration manifest.

# CCX-302B — Unified Post composer workspace

The exact Social Post route (`#social/post/:id`) loads a compact authenticated composer read. It exposes only the authorized shared draft fields and read-only summaries for creative, channels, schedule, readiness, review, and publishing state.

`POST /api/ui/social/post/:id/save` delegates persistence to the existing scoped Post update storage operation after independently checking `manage_content_drafts`, validating the five shared fields, and honoring the optimistic version. It never writes channels, assets, schedule, review, publication, provider, or full state.

The workspace uses explicit Save draft behavior and keeps local edits across validation, conflict, and recoverable failures. Browser-local dirty state is protected by a native unload warning; successful saves clear it. The internal preview is deterministic and does not call providers or generate assets.

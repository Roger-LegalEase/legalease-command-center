# Workflow 07 — Plan the social week

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

A workflow is not complete when a button merely creates another record or opens another
page; it is complete only when Roger finishes the business outcome and the related system
state updates automatically.

## User objective
In one weekly session, produce approved, platform-distinct posts ready to publish
manually — and know they're done.

## Trigger
The weekly planning block (once a week, replacing the marketing review block).

## Entry points
Campaigns → Social (Plan stage).

## Context required
The week's business objective, available facts/announcements/proof (content bank,
sources), last week's published posts and results, brand assets.

## Primary action
The nine-step charter flow: choose objective → choose 1–3 themes → add available
facts/announcements/insights/proof/offers → generate several concepts → create distinct
copy per selected platform (channel variants: own hook, structure, length, CTA,
formatting — never one paragraph shortened five times) → edit and approve (guidelines
gate) → copy or export for manual posting → record the published URL → results later.
Supported drafts: LinkedIn, Instagram, Facebook, X, Threads, newsletter/founder update.
An asset brief (suggested visual, headline, supporting copy, screenshot idea,
dimensions, alt text) replaces built-in image generation.

## Secondary actions
Park a concept for next week; request changes on a draft; regenerate a variant; pull a
fact from the approved-facts source list.

## Automatic side effects
Approved posts appear in the week's manual-posting checklist; Scoreboard Marketing
"drafts ready" updates; recording a published URL marks the post published and starts
its results record.

## Confirmation policy
Approve content = one confirmation-class decision (the existing approval flow). Copy/
export and URL recording are internal. **Publishing happens outside the product, by
hand.**

## Failure behavior
Guidelines hard fail: approval is blocked with the named failures (`socialGuidelinesGate`
throws / returns 400) — never a silent pass. Render QA failure on any generated image:
stored `qa_failed`, not approvable.

## Exit state
The week's posts approved, exported, and scheduled on Roger's own calendar; nothing
awaiting an internal machine.

## Existing modules reused
Social weekly planner service (`social-weekly-planner` service + API),
`scripts/post-composer-service.mjs`, `scripts/ui/view-models/post-channel-variants.mjs`,
Review Desk approval flow, `socialGuidelinesGate`, `renderQaForGeneratedImage`,
content bank and sources modules.

## Collections read
`posts`, `contentBank`, `library`, `brandAssets`, `brandRules`, `generationProfiles`,
`sources` data (via content pipeline), `publishEvents`.

## Collections written
`posts` (drafts, variants, approvals, published URL), `contentBank`,
`generationBatches`, `approvalQueue`, `activityEvents`.

## External providers involved
None at publish time — manual posting is the product. (OpenAI only if image/creative
generation is invoked, behind its existing gates.)

## Safety gates
`socialGuidelinesGate` hard-fail on approve/schedule; `renderQaForGeneratedImage`;
the live-publishing pipeline stays dormant (Advanced); no Publish Now affordance
without the live gate (`evidence/publish-now-gate-review.md`).

## Non-goals
Automatic posting; built-in image generation as a requirement; per-platform scheduling
inside LegalEase.

**NEW:** the single guided weekly session (objective → themes → concepts flow as one
surface) is new composition; composer, variants, gates, and approval are existing.

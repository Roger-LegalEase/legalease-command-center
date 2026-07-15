# LegalEase Command Center vNext
## Master Build Plan for Codex

**Repository:** `Roger-LegalEase/legalease-command-center`\
**Target branch:** `main`\
**Plan version:** 1.1\
**Plan date:** July 14, 2026\
**Last revised:** July 15, 2026\
**Plan status:** Execution specification with approved visual direction\
**Primary operator:** Roger\
**Product objective:** Make the Command Center commercially credible, immediately understandable, and exceptionally easy to operate without weakening its existing safety, audit, compliance, storage, or automation foundations.\
**Approved visual direction:** Deep navy application shell, official all-white LegalEase logo, soft light teal selected states, and exact LegalEase orange used as a restrained action accent.

---

## 0. How Codex Must Use This Plan

This document is the governing build specification for the Command Center UX reset.

Codex must execute **one numbered work packet at a time**. Each work packet should normally become one focused pull request. Codex must not silently implement later phases, combine unrelated work packets, redesign underlying safety systems, or introduce a new product architecture that conflicts with this plan.

For every work packet, Codex must:

1. Read this plan and the files named in the packet.
2. Inspect current `main` before changing code because the repository is evolving quickly.
3. State the current behavior and the intended behavior in the PR description.
4. Add or update tests before considering the packet complete.
5. Preserve existing safety, audit, access-control, suppression, and fail-closed behavior.
6. Use scoped writes. Do not introduce broad full-state writes.
7. Preserve old hash routes through aliases until Phase 8 deprecation work explicitly removes them.
8. Run the packet-specific tests, `npm run check`, and the relevant existing test group.
9. Report changed files, tests run, known limitations, and the next packet that is unblocked.
10. Stop after the packet is complete. Do not continue into another packet without a new instruction.

### Branch and commit convention

- Branch: `codex/ccx-###-short-description`
- Commit: `feat(ux-vnext): ...`, `refactor(ux-vnext): ...`, `test(ux-vnext): ...`, or `fix(ux-vnext): ...`
- PR title: `CCX-###: Clear user-facing outcome`

### Mandatory rollback discipline

Every user-visible phase must be protected by a server-side feature flag until its phase exit criteria pass in production-like verification.

Recommended flags:

```text
COMMAND_CENTER_UX_VNEXT=true|false
COMMAND_CENTER_UX_VNEXT_SOCIAL=true|false
COMMAND_CENTER_UX_VNEXT_OUTREACH=true|false
COMMAND_CENTER_UX_VNEXT_PARTNERS=true|false
COMMAND_CENTER_UX_VNEXT_FILES=true|false
```

Flags are deployment controls, not user-facing settings. They must never expose secrets or allow a browser client to bypass authorization.


### Required repo inputs before Codex starts

The UX program has two approved source assets in addition to this plan. Commit all three items before running CCX-000:

```text
LEGALEASE_COMMAND_CENTER_MASTER_BUILD_PLAN_CODEX.md
assets/brand/logos/legalease-logo-white-2025.png
docs/ux-vnext/reference/command-center-vnext-approved-direction.png
```

Rules:

- `legalease-logo-white-2025.png` is the exact official all-white LegalEase wordmark supplied by Roger. Codex must use the file itself, not redraw the wordmark with text, SVG paths, CSS, AI-generated imagery, or a substitute font.
- `command-center-vnext-approved-direction.png` is a directional product reference for hierarchy, density, navigation, and color balance. It is not a source of placeholder data and is not a pixel-perfect implementation contract.
- The actual product must use real records, real empty/loading/error states, and the existing safety architecture.
- If either asset is absent, corrupt, or unreadable, CCX-000 must stop and report the missing prerequisite. Codex must not improvise a replacement.
- The existing orange-and-blue LegalEase logo may remain available for light-background external documents and marketing exports. The Command Center shell uses the approved white wordmark.

---

# 1. Mission and Product Promise

The Command Center must be explainable in one sentence:

> The Command Center helps LegalEase plan today, publish social content, run outreach, manage partners, and organize company files.

A first-time user must understand the product without learning its internal engine names, safety architecture, event model, queue taxonomy, or operational vocabulary.

The target product is five focused tools inside one workspace:

1. **Today** — what deserves attention now.
2. **Social** — create, review, schedule, publish, and measure content.
3. **Outreach** — create and run partner or customer email campaigns.
4. **Partners** — manage relationships, opportunities, programs, and next actions.
5. **Files** — organize brand, partner, operating, compliance, and investor materials.

Global utilities:

- **Inbox** — everything requiring a human decision or follow-up.
- **Search** — find any post, campaign, partner, file, task, or report.
- **Create** — one global creation menu.
- **Le-E** — contextual assistance available everywhere.
- **Settings** — integrations, roles, automations, publishing connections, and advanced system controls.

---

# 2. Current Repository Baseline

Codex must treat the following as the current architectural reality unless inspection of `main` proves it has changed.

## 2.1 Existing strengths to preserve

The repository already contains substantial operational capabilities:

- Today/founder cockpit and daily planning
- Tasks, decisions, blockers, quick capture, closeout, and operating memory
- Social ideas, drafts, previews, editing, content calendar, manual publishing workflow, image rendering, brand assets, Wilma assets, and hard content guidelines
- Partner and customer outreach engines
- SendGrid sending, domain authentication, webhook processing, suppression, safety thresholds, batches/waves, and reactivation sequences
- Partner lifecycle records and partner program artifacts
- Reports, evidence packs, data-room records, and SOC 2 readiness evidence
- Google Workspace read-only intelligence
- Role-based access, audit history, event logging, production health, safe boot, storage durability, and Supabase support
- A large existing test suite that protects business and safety behavior

These capabilities are assets. The UX program must organize them; it must not casually replace them.

## 2.2 Current UX progress to build on

The current branch has already moved toward simpler founder language. Existing tests expect a five-item top navigation and a consolidated Social workspace. Today has also received substantial hierarchy and copy cleanup.

The vNext work must therefore be an evolution, not a restart:

- Keep the strong Today work.
- Keep the consolidated Social direction.
- Replace broad or ambiguous buckets such as Work and Proof with task-oriented destinations.
- Move Search out of primary navigation and into the global top bar.
- Add Outreach, Partners, and Files as first-class destinations.
- Consolidate all approval and follow-up queues into Inbox.

## 2.3 Current technical constraints

The application is a Node ESM application with a very large `scripts/preview-server.mjs` that contains substantial server routing, HTML generation, styles, and browser logic. The package currently has a deliberately small runtime dependency surface.

This creates three requirements:

1. Do not perform a big-bang framework rewrite.
2. Gradually extract pure view models, renderers, route definitions, styles, and client actions from `preview-server.mjs`.
3. Keep the application runnable with the current Node server throughout the program.

## 2.4 Existing safety contracts that may not regress

The redesign must preserve all existing behavior around:

- Human approval before risky external actions
- Live social-publishing gates
- Email sending authority and environment gates
- Suppression, unsubscribe, hold, and invalid-recipient protection
- Legal and social-guideline hard failures
- Render-quality checks
- Role-based authorization
- Secrets remaining server-side
- Audit and activity-event creation
- Idempotent execution
- Fail-closed behavior when credentials or telemetry are missing
- Safe route and link handling
- Scoped persistence and storage integrity

A cleaner interface may translate these systems into plain language, but it may not weaken them.

---

# 3. Non-Negotiable Product Decisions

## 3.1 Primary navigation

The final primary navigation is:

```text
Today
Social
Outreach
Partners
Files
```

Global or secondary controls:

```text
Inbox
Search
+ Create
Le-E
Settings
Help
Profile
```

There is no top-level page named:

- Work
- Queue
- Review Desk
- Growth
- Production
- Proof
- More
- Operator Search
- Evidence Room
- Data Room

Those concepts either become a view within one of the five products, a global utility, or a Settings/advanced function.

## 3.2 Four primary business objects

The user-facing object model is:

1. `Post`
2. `Campaign`
3. `Partner`
4. `File`

Today and Inbox are computed views over these objects and existing operational records.

A record must not be copied merely because it appears in multiple views. A Post shown in Ideas, Calendar, Needs Review, and Results remains one Post.

## 3.3 Progressive disclosure

Normal mode shows:

- Goal
- Status
- Owner
- Next action
- Due date or schedule
- Readiness or result

Advanced mode may show:

- Delivery telemetry
- Webhook state
- Raw event history
- Publishing-gate detail
- Audit information
- Engine state
- Technical diagnostics

Advanced information must never dominate the default workflow.

## 3.4 One obvious next action

Every page and record should have one visually dominant next action. At most two secondary actions may remain visible. Lower-priority actions belong under an overflow menu.

## 3.5 No dead controls

Every visible button must:

- Have accessible text
- Produce immediate progress feedback
- Prevent accidental duplicate execution
- End in an explicit success or error state
- Be covered by a test
- Never be a placeholder

## 3.6 No big-bang React/Next rewrite

This program does not include a framework migration. Codex should build modular server-rendered UI and focused client-side behavior using the existing runtime.

A separate frontend may be evaluated only after vNext is stable and the underlying view-model/API boundaries are clean.

## 3.7 Template-driven social design, not a full Canva clone

The first commercial-grade Social editor should provide:

- Strong templates
- Locked brand rules
- Real-time preview
- Image and Wilma asset selection
- Layout controls appropriate to each template
- Channel variants
- Copy editing
- Rendering and readiness checks

It does not need an unrestricted vector-design canvas, arbitrary layers, or Figma-like authoring in this program.


## 3.8 Approved visual identity and brand contract

The visual direction is now locked for vNext. It must feel calm, credible, modern, and unmistakably LegalEase.

### Core palette

Use these initial tokens as the implementation contract. Small accessibility-driven adjustments require documentation and must remain recognizably within this palette.

```css
--le-navy-950: #071E33;       /* primary sidebar and dark shell */
--le-navy-900: #0B2942;       /* hover/elevated dark surface */
--le-navy-800: #123A59;       /* secondary dark detail */
--le-teal-500: #78D2CB;       /* soft selected state */
--le-teal-600: #52BEB7;       /* selected border/icon */
--le-teal-100: #E8F7F5;       /* quiet teal tint */
--le-orange-600: #F04800;     /* exact LegalEase orange */
--le-orange-700: #D84100;     /* hover/pressed */
--le-orange-100: #FFF0E8;     /* quiet orange tint */
--le-page: #F4F7F8;
--le-surface: #FFFFFF;
--le-surface-warm: #FCFDFD;
--le-border: #DCE5E8;
--le-text: #142433;
--le-text-muted: #60717D;
```

### Usage rules

- The persistent sidebar is deep navy, not black, charcoal, or bright blue.
- The official all-white LegalEase wordmark is the default shell logo.
- Selected navigation uses soft light teal. The selected treatment may use a teal tint, border, or pill, but it must not look neon or saturated.
- LegalEase orange is a restrained accent for the main call to action, notification counts, key attention states, and selected underlines where appropriate.
- Do not make every button orange. Secondary controls remain neutral or teal.
- Destructive actions use semantic red, not LegalEase orange.
- Teal is not used as a false success color when the semantic state is merely selected or informational.
- The main workspace uses warm white and very light gray with subtle borders and minimal shadows.
- Avoid gradient-heavy cards, glass effects, oversized shadows, and dense dashboard “card soup.”
- Status must never rely on color alone.

### Logo rules

- Use `assets/brand/logos/legalease-logo-white-2025.png` directly.
- Preserve transparent background, aspect ratio, clear space, and sharpness.
- Never crop through the border or letters.
- Never stretch, outline, recolor, retype, or place the logo inside another invented badge.
- Desktop sidebar target width: approximately 96–118 px, adjusted to preserve the source aspect ratio and adequate clear space.
- Mobile navigation shows the same white wordmark in the open drawer.
- An icon-only collapsed rail may use an existing approved LegalEase mark only after Codex verifies that asset in the repository. Do not fabricate a monogram or symbol.

## 3.9 Visual reference precedence

When implementation questions arise, use this precedence:

1. Existing safety, authorization, audit, suppression, and truthfulness requirements
2. This master build plan
3. The approved brand contract above
4. `docs/ux-vnext/reference/command-center-vnext-approved-direction.png`
5. Existing implementation details

The reference image establishes the intended feel: navy shell, white logo, soft teal selected states, orange primary actions, clean white work surfaces, restrained density, and clear next actions. It does not authorize copying sample metrics, names, dates, or statuses into production data.


## 3.10 Functional product, not a reskinned prototype

This program is complete only when the simplified surfaces operate against real Command Center data and existing safe engines.

Rules:

- No screenshot-only or static HTML implementation counts as a completed packet.
- Every displayed metric must be derived from real stored or projected state and must represent uncertainty honestly.
- Every form must validate, persist through a scoped authorized write, survive reload, and report failures clearly.
- Every primary action must reach a real endpoint or safe existing operation.
- Every object detail page must open the exact underlying Post, Campaign, Partner, or File.
- Demo fixtures may illustrate workflows, but production code may not depend on hard-coded mockup values.
- A page is not accepted because it visually resembles the reference. Its happy path, blocked path, empty state, loading state, authorization refusal, retry behavior, audit behavior, and persistence must also pass.

---

# 4. Target Information Architecture

## 4.1 App shell

Desktop layout:

```text
┌──────────────────────┬───────────────────────────────────────────────┐
│ LegalEase            │ Search anything…                 + Create    │
│                      ├───────────────────────────────────────────────┤
│ Today                │                                               │
│ Social               │ Current page                                  │
│ Outreach             │                                               │
│ Partners             │                                               │
│ Files                │                                               │
│                      │                                               │
│ ───────────────────  │                                               │
│ Inbox             4  │                                               │
│ Le-E                 │                                               │
│ Settings             │                                               │
└──────────────────────┴───────────────────────────────────────────────┘
```

Mobile layout:

- Compact top bar
- Menu button opens the same destination list
- Create remains obvious
- Contextual actions remain reachable without horizontal overflow
- No desktop-only hidden critical workflow


Approved shell treatment:

- Sidebar background: `--le-navy-950`
- Desktop brand: official white LegalEase wordmark
- Active navigation: `--le-teal-500` or `--le-teal-100` with navy text, depending on contrast and density
- Global primary action: LegalEase orange
- Inbox count: orange badge
- Neutral page chrome: white/light gray
- Avoid an orange sidebar, teal page flood, or a dark main workspace

## 4.2 Page anatomy

Every major page follows this structure:

1. Optional breadcrumb
2. Page title
3. One-sentence explanation or current-state summary
4. Primary action
5. Views/tabs
6. Search and filters
7. Main content
8. Contextual details drawer or full record page

## 4.3 Status vocabulary

### Post

```text
Idea
Draft
Needs review
Scheduled
Published
```

### Campaign

```text
Draft
Ready
Scheduled
Active
Paused
Completed
```

### Partner

```text
New
Qualified
In conversation
Proposal
Active
Closed
```

### File

```text
Draft
Current
Needs update
Missing
Archived
```

Underlying engine states may be richer. The UI uses adapters to map them into these stable vocabularies.

## 4.4 Terminology map

| Internal/current term | Founder-facing term |
|---|---|
| Queue | Inbox or Needs me |
| Review Desk | Social → Needs review |
| Campaigns | Outreach |
| Growth Inbox | Capture |
| Content Bank | Ideas |
| Production | Social Library |
| Proof | Files or Investor Room |
| Evidence Room | Files → Compliance/Evidence |
| Data Room | Investor Room |
| Partner Programs | Programs within a Partner |
| Partner Proposals | Proposal files within a Partner |
| Autonomy | Automations |
| Live gates | Connection and readiness checks |
| Wave | Batch, shown only when needed |
| Telemetry | Delivery tracking |
| Suppressed | Will not receive this campaign |
| Held | Temporarily excluded |
| Release | Add this batch / launch after approval |

---

# 5. Target Technical Architecture

The program uses a strangler pattern: new modular UI surrounds the existing engines, endpoints, storage, and safety behavior.

## 5.1 Recommended module layout

Codex should converge toward this structure without forcing it into one PR:

```text
scripts/
  preview-server.mjs                 # HTTP composition and legacy compatibility
  ui/
    app-shell.mjs
    navigation.mjs
    brand-contract.mjs
    route-aliases.mjs
    labels.mjs
    feature-flags.mjs
    links.mjs
    view-models/
      today-view.mjs
      inbox-view.mjs
      social-view.mjs
      outreach-view.mjs
      partners-view.mjs
      files-view.mjs
    pages/
      today-page.mjs
      inbox-page.mjs
      social-page.mjs
      outreach-page.mjs
      partners-page.mjs
      files-page.mjs
      settings-page.mjs
    components/
      button.mjs
      status-chip.mjs
      empty-state.mjs
      loading-state.mjs
      error-state.mjs
      page-header.mjs
      tabs.mjs
      filters.mjs
      data-table.mjs
      record-drawer.mjs
      readiness-list.mjs
      activity-feed.mjs
      confirm-dialog.mjs
      toast.mjs
  ui-actions/
    inbox-actions.mjs
    social-actions.mjs
    outreach-actions.mjs
    partner-actions.mjs
    file-actions.mjs
  ui-api/
    today-api.mjs
    inbox-api.mjs
    social-api.mjs
    outreach-api.mjs
    partners-api.mjs
    files-api.mjs
assets/
  brand/
    logos/
      legalease-logo-white-2025.png
  ui/
    tokens.css
    shell.css
    components.css
    pages.css
    app.js
    accessibility.js
scripts/
  test-vnext-*.mjs
browser-tests/
  *.spec.mjs
docs/
  ux-vnext/
    reference/
      command-center-vnext-approved-direction.png
```

Exact paths may adapt to existing conventions, but the separation of concerns is mandatory:

- Engines decide business behavior.
- View models translate engine state into user-facing state.
- Pages render view models.
- Actions call existing safe operations.
- The shell owns navigation, global search, and global create.

## 5.2 UI route contract

Recommended canonical routes:

```text
#today
#inbox
#social
#social/post/:id
#outreach
#outreach/campaign/:id
#partners
#partners/:id
#files
#files/:id
#settings
```

Query-like view state may use a simple hash suffix or the repository’s existing route convention:

```text
#social?view=calendar
#social?view=needs-review
#outreach?status=active
#files?collection=investor-room
```

Codex must use vetted route parsing. Do not place arbitrary unsanitized values into links or HTML.

## 5.3 Compatibility aliases

At minimum, preserve and redirect existing routes during migration:

```text
#work                    → #inbox or the relevant task view
#decisions               → #inbox
#queue                   → #social?view=needs-review
#social-media            → #social
#content-calendar        → #social?view=calendar
#posts                   → #social?view=library
#campaigns               → #outreach
#reactivation            → the reactivation campaign in Outreach
#partner-hub             → #partners
#partner-programs        → #partners with the relevant program context
#partner-proposals       → the relevant Partner → Files view
#proof                   → #files?collection=investor-room
#data-room               → #files?collection=investor-room
#evidence-room           → #files?collection=compliance
#search                  → global search, with a fallback search page
```

Codex must inventory every current alias before implementing this table and add anything missing.

## 5.4 View-model principle

Do not immediately rewrite every stored collection.

First create pure adapters that derive a stable user-facing shape from current state. Only introduce a new canonical collection when a view cannot be made reliable through projection.

Example normalized reference:

```js
{
  kind: "post" | "campaign" | "partner" | "file" | "task",
  id: "stable-id",
  label: "Human-readable label",
  href: "#social/post/stable-id"
}
```

Example normalized Inbox item:

```js
{
  id: "inbox:source-kind:source-id",
  sourceKind: "social_review",
  sourceId: "post-123",
  title: "Fulton County post needs two fixes",
  summary: "Remove an outcome promise and connect Instagram.",
  status: "needs_me" | "waiting" | "update",
  priority: "urgent" | "high" | "normal" | "low",
  dueAt: "ISO timestamp or empty",
  owner: "Roger",
  requiresApproval: true,
  href: "#social/post/post-123",
  actions: ["open", "approve", "snooze"]
}
```

## 5.5 Compact page APIs

The browser should not require a full application-state payload to render every page.

As modules are extracted, add compact authorized read endpoints such as:

```text
GET /api/ui/today
GET /api/ui/inbox
GET /api/ui/social
GET /api/ui/social/posts/:id
GET /api/ui/outreach
GET /api/ui/outreach/campaigns/:id
GET /api/ui/partners
GET /api/ui/partners/:id
GET /api/ui/files
GET /api/ui/files/:id
```

Rules:

- Enforce the same role authorization as the underlying data.
- Return only the fields required by the page.
- Paginate large collections.
- Never include secrets, raw OAuth tokens, or unredacted sensitive payloads.
- Keep write operations on the existing safe endpoints until a scoped replacement is justified.

---

# 6. Codex Quality Contract

Every packet must satisfy these requirements.

## 6.1 Product behavior

- One obvious primary action per page.
- No unexplained internal terminology.
- Empty states explain the purpose of the page and provide a useful next action.
- Errors explain what happened, what was not changed, and what the user can do next.
- Risky actions show a plain-language preview before execution.
- Success states link to the created or changed object.
- All timestamps and scheduled actions use the intended Eastern Time behavior where the existing system does so.

## 6.2 Visual and brand fidelity

- The production shell uses the exact approved white logo asset.
- New vNext pages use the shared color, spacing, type, radius, border, and elevation tokens.
- Sidebar, selected navigation, and primary actions follow the approved navy/teal/orange hierarchy.
- No ad hoc near-duplicate brand colors are introduced without updating the brand contract.
- Orange is visually dominant only for the primary action or a genuine attention state.
- Desktop and responsive screenshots are captured for each major page before the packet is approved.
- The implementation should match the reference image in hierarchy and tone, not by hard-coding its sample content.
- Logo rendering must remain crisp at normal and high-density displays.

## 6.3 Accessibility

- Full keyboard access
- Visible focus states
- Semantic headings and landmarks
- Accessible names for icon controls
- No status conveyed by color alone
- Dialog focus trap and Escape behavior
- Forms have labels, instructions, and inline error association
- Minimum touch target of 44px where practical
- Table alternatives or stacked labels on narrow screens
- Respect reduced-motion preference

## 6.4 Responsive behavior

Test at minimum:

- 1440px desktop
- 1280px laptop
- 1024px small laptop/tablet landscape
- 768px tablet
- 390px mobile

No page-level horizontal overflow is allowed.

## 6.5 Performance budgets

Targets for production-like demo data:

- First useful page content without loading the full company state
- Initial critical CSS and client JS kept intentionally small
- Module list endpoints below 250 KB whenever practical
- Record detail endpoints below 150 KB whenever practical
- User feedback within 100 ms of a click
- Normal page read p95 below 750 ms in hosted mode, excluding third-party network calls
- No duplicate API calls caused by rerender loops
- No repeated full-state persistence for simple actions

## 6.6 Security and safety

- Authorization checked server-side for every read and write
- CSRF/unsafe-origin behavior must not regress
- No secret values in HTML, browser state, logs, or error messages
- No client-side flag may grant sending or publishing authority
- Approval and execution remain separate when currently required
- External-action retries are idempotent
- Suppression and hold status cannot be bypassed by the UI
- Audit events record meaningful decisions

---

# 7. Master Release Sequence

The sequence is dependency-driven. These are not calendar estimates.

| Release | Scope | Exit condition |
|---|---|---|
| A | Foundation, modular boundary, shell | Five-destination shell runs behind a feature flag with aliases and rollback |
| B | Inbox and Today | A user can start from Today, act on Inbox items, and reach the exact source object |
| C | Social | A user can go from idea to reviewed, scheduled, and—when configured—published content in one workspace |
| D | Outreach | A user can build, review, approve, launch, and monitor partner/customer outreach without technical vocabulary |
| E | Partners | A user can understand a relationship and its next action within seconds |
| F | Files and Investor Room | A user can find, preview, upload, organize, and assess document readiness |
| G | Onboarding and commercial hardening | First-run guidance, analytics, accessibility, performance, production verification, and legacy cleanup pass |

Do not remove legacy renderers merely because a new page exists. Remove them only in Phase 8 after route telemetry, tests, and feature parity are confirmed.

---

# 8. Detailed Work Packets

## Phase 0 — Baseline, Boundaries, and Rollback

### CCX-000 — Establish a verified baseline

**Objective:** Create a trustworthy starting point before UX extraction.

**Deliverables:**

- Record current `main` SHA in the PR description.
- Run `npm install`, `npm run check`, `npm test`, and relevant production verification.
- Create `docs/ux-vnext/baseline.md` containing:
  - Current primary routes
  - Current feature flags
  - Current failing tests, if any
  - Current demo-data command
  - Current safety and publishing posture
  - Current payload sizes for Today, Social, campaigns/outreach, Partners, and Data Room/Proof
  - Presence, dimensions, file type, and SHA-256 checksum of the approved logo and visual-reference assets
  - Current logo files already used by the application and where they render
- Verify the three required repo inputs listed in Section 0 before running implementation work.
- Do not change behavior in this packet unless a test cannot run because of a deterministic repository defect. Any such fix must be isolated and explained.

**Acceptance:**

- Baseline can be reproduced by another developer.
- Existing failures are distinguished from new regressions.
- Approved visual assets are present and reproducibly identified.
- No user-visible feature change.

---

### CCX-001 — Build the route and capability inventory

**Objective:** Make every current capability and route explicit before reorganizing it.

**Deliverables:**

- `docs/ux-vnext/capability-map.md`
- `docs/ux-vnext/route-map.md`
- `docs/ux-vnext/legacy-alias-map.md`
- Machine-readable route registry in `scripts/ui/navigation.mjs` or equivalent

Each current page must be classified as one of:

```text
Keep as primary
Move into Today
Move into Social
Move into Outreach
Move into Partners
Move into Files
Move into Inbox
Move into Settings
Advanced/internal only
Deprecate after parity
```

**Acceptance:**

- Every route known to the current renderer appears in the map.
- Every current primary nav item has a target destination.
- No route is deleted.
- Add `scripts/test-vnext-route-inventory.mjs` to detect orphaned canonical routes and aliases.

---

### CCX-002 — Create the founder-language registry

**Objective:** Stop user-facing terminology from being scattered through the monolith.

**Deliverables:**

- `scripts/ui/labels.mjs`
- A documented mapping for statuses, actions, errors, and technical-to-founder terms
- Shared helpers for:
  - Status labels
  - Readiness labels
  - Empty-state copy
  - Error copy
  - Dangerous-action previews

**Rules:**

- The registry is not a generic internationalization framework.
- Preserve plain English.
- Internal identifiers remain stable; only presentation changes.
- Existing tests that ban technical language should use the registry where practical.

**Acceptance:**

- New vNext pages do not hard-code duplicated status copy.
- Tests reject banned technical terms in normal mode.

---

### CCX-003 — Introduce the vNext feature-flag and shell boundary

**Objective:** Create a safe switch between legacy and vNext UI.

**Deliverables:**

- Server-side feature flag helper
- `renderLegacyApp(...)`
- `renderVNextApp(...)`
- No duplicated business logic
- Safe default documented for local and production modes

**Acceptance:**

- Both shells render against the same state and endpoints.
- A server-side flag selects the shell.
- The browser cannot enable vNext or external actions by manipulating local state.
- Safe boot and auth behavior remain unchanged.

---

### CCX-004 — Extract shared UI primitives without changing behavior

**Objective:** Reduce the risk of continuing to add UX code to `preview-server.mjs`.

**First extraction targets:**

- HTML escaping
- Safe links
- Button renderer
- Status chip
- Empty state
- Loading state
- Error state
- Toast/status message
- Confirm dialog
- Page header
- Tabs
- Filters
- Record drawer shell

**Acceptance:**

- Existing pages still look and behave the same where primitives are adopted.
- No unsafe HTML or route regression.
- Unit tests cover each pure renderer.

---

### CCX-005 — Add browser-level test infrastructure

**Objective:** Stop relying only on source-string assertions for critical UX.

**Deliverables:**

- Add Playwright as a development dependency, unless the repository already has an equivalent browser harness.
- Add a deterministic local demo startup fixture.
- Add accessibility support with `@axe-core/playwright` or equivalent.
- Create smoke tests for:
  - App loads
  - Today loads
  - Social loads
  - Navigation works
  - A visible button produces feedback
  - No uncaught client error

**Rules:**

- Keep existing Node assertion tests.
- Browser tests supplement, not replace, engine and contract tests.
- Tests may not require live social or email credentials.

---

### CCX-006 — Lock the approved LegalEase design system

**Objective:** Extend Today’s cleaner visual language across the product and codify the approved white-logo/navy/soft-teal/orange direction before the new shell is built.

**Deliverables:**

- `assets/ui/tokens.css` or equivalent containing:
  - Approved core colors from Section 3.8
  - Type scale
  - Spacing
  - Radius
  - Border
  - Shadow
  - Surfaces
  - Text hierarchy
  - Semantic success/warning/danger/info states
  - Focus ring
- `scripts/ui/brand-contract.mjs` or equivalent pure configuration for approved asset paths and user-facing brand metadata
- Wire `assets/brand/logos/legalease-logo-white-2025.png` as the shell logo source
- A development-only component showcase demonstrating:
  - Navy sidebar
  - White logo
  - Soft teal selected nav
  - Orange primary button
  - Neutral secondary button
  - Status chips
  - Focus, hover, disabled, loading, success, warning, and danger states
- `scripts/test-vnext-brand-contract.mjs`
- A browser screenshot of the showcase at 1440px and 390px

**Rules:**

- Do not redraw or optimize the logo in a way that changes its appearance.
- Do not use the AI-rendered logo inside the visual reference as an asset.
- The exact orange token is `#F04800`.
- The reference image is directional; accessibility and real data take precedence.
- Do not restyle every legacy page in this packet.

**Acceptance:**

- New vNext pages use tokens rather than ad hoc values.
- The official white logo renders directly from the approved file.
- Normal text and controls meet contrast requirements.
- Orange, teal, and semantic colors have distinct roles.
- Existing Today behavior does not regress.
- Brand-contract and screenshot tests pass.

### Phase 0 exit criteria

- Baseline recorded
- Route inventory complete
- vNext feature flag works
- Shared primitives exist
- Browser smoke harness passes
- Approved logo, visual reference, and design tokens are verified
- No safety or data behavior changed

---

## Phase 1 — Five-Destination App Shell

### CCX-100 — Build the desktop app shell

**Objective:** Introduce the final five-destination navigation behind the vNext flag.

**Deliverables:**

- Persistent deep navy left sidebar
- Exact official white LegalEase wordmark at the top of the sidebar
- Today, Social, Outreach, Partners, Files
- Secondary Inbox, Le-E, Settings
- Top bar with Search, orange Create action, Help, Profile
- Soft teal active-route treatment
- Orange Inbox-count treatment
- Active-route behavior
- Collapse behavior for narrower laptop widths

**Acceptance:**

- Exactly five primary destinations.
- No Work, Proof, Search, Queue, Review Desk, Growth, Production, or More in primary navigation.
- Le-E remains available from every page.
- Settings remains available.
- Sidebar and logo follow Section 3.8 exactly.
- No unofficial logo, monogram, or retyped wordmark appears.
- Keyboard and screen-reader landmarks are correct.

---

### CCX-101 — Build the responsive shell

**Objective:** Make the shell usable from mobile through desktop.

**Deliverables:**

- Mobile navigation drawer using the approved navy shell and white wordmark
- Persistent mobile orange Create action
- Accessible open/close behavior
- No overlay obscures the current page without a dismiss path
- No horizontal overflow

**Acceptance:**

- Browser screenshots and interaction tests at required widths.
- Focus returns to the menu trigger after closing.
- The logo remains legible without distortion at every tested width.
- An icon-only rail does not invent an unofficial LegalEase mark.

---

### CCX-102 — Implement compatibility aliases and deep-link parsing

**Objective:** Ensure old bookmarks and existing tasks continue to work.

**Deliverables:**

- Alias registry from CCX-001
- Safe canonicalization of legacy routes
- Exact-object deep links for Post, Campaign, Partner, and File
- Fallback for unknown routes

**Acceptance:**

- Legacy route tests pass.
- Unknown route displays a useful recovery screen, not a blank page.
- Unsafe route values are rejected.

---

### CCX-103 — Build the global Create menu

**Objective:** Give the user one predictable starting point for new work.

**Menu:**

```text
Social post
Outreach campaign
Partner
File or folder
Quick note
```

**Acceptance:**

- Each item opens the correct new-object workflow.
- Menu is keyboard accessible.
- The menu closes after selection or Escape.
- Permissions hide or disable actions the user cannot perform, with an explanation.

---

### CCX-104 — Move Search into the top bar

**Objective:** Replace Search as a primary destination with a global utility.

**Deliverables:**

- Search input or command palette
- Search across Post, Campaign, Partner, File, Task, and Report
- Keyboard shortcut
- Recent searches or recently opened records without storing sensitive query content in insecure browser storage
- Grouped results with object type and context

**Acceptance:**

- Selecting a result opens the exact object.
- Empty and error states are useful.
- Existing operator-search logic is reused behind founder-facing terminology where safe.
- `#search` remains as a compatibility fallback.

---

### CCX-105 — Shell loading, error, and unauthorized states

**Objective:** Ensure the shell never becomes a white screen.

**Acceptance:**

- Loading skeleton appears before route data.
- Unauthorized states clearly identify the missing permission.
- Module failure does not destroy the shell.
- Retry works.
- No secret or technical stack trace appears.

### Phase 1 exit criteria

- Five-destination shell works behind the feature flag
- Aliases preserve legacy navigation
- Search and Create are global
- Responsive and accessibility checks pass
- Rollback to legacy shell works

---

## Phase 2 — Unified Inbox and Refined Today

### CCX-200 — Define the universal Inbox projection

**Objective:** Normalize all human-required work into one computed view without deleting source records.

**Candidate sources:**

- Company queue/decision records
- Social posts needing review or fixes
- Campaign approvals and launch decisions
- Partner follow-ups
- Important tasks and blockers
- Automation suggestions requiring approval
- Inbox intelligence items requiring a reply
- File or Investor Room items needing an update

**Deliverables:**

- Pure `buildInboxView(state, actor, now)` or equivalent
- Stable deduplication keys
- Source references and exact deep links
- Three user-facing groups:
  - Needs me
  - Waiting
  - Updates

**Acceptance:**

- One underlying item appears once.
- Existing decision/audit state remains authoritative.
- Projection is deterministic and side-effect free.

---

### CCX-201 — Build the Inbox page

**Objective:** Replace multiple queue/review destinations with one action-oriented page.

**Default visible actions:**

```text
Open
Complete or Approve, when valid
Snooze
```

Other actions belong inside the source object.

**Acceptance:**

- Filters by type, priority, owner, and due state.
- Each item explains why it needs attention.
- Empty state celebrates completion and offers useful navigation.
- Item count appears in the shell.

---

### CCX-202 — Build the Inbox action adapter

**Objective:** Route simple Inbox decisions to existing safe domain actions.

**Rules:**

- Do not duplicate domain logic in the Inbox.
- Approve calls the existing approval operation.
- Complete calls the existing task/queue transition.
- Snooze uses existing normalized snooze behavior.
- Open always deep-links to the exact source.
- If an action requires more context, only show Open.

**Acceptance:**

- Every action is audited where existing behavior requires it.
- Duplicate clicks are blocked.
- Failure cannot leave the UI claiming success.

---

### CCX-203 — Define the Today view model

**Objective:** Limit Today to four questions:

1. What should I do now?
2. What are the next three things?
3. What needs me?
4. What moved forward?

**Deliverables:**

- `nowItem`
- `nextItems` capped at three
- `needsMeSummary`
- `progressSummary`
- Exact object links

**Acceptance:**

- Today does not duplicate full module dashboards.
- Today contains no advanced system cards.
- The current strong hierarchy and daily-planning behavior are preserved.

---

### CCX-204 — Refine Today UI

**Recommended layout:**

```text
NOW
Primary item and Start action

NEXT
Three ranked items

NEEDS YOU
Compact grouped counts and top items

PROGRESS
Meaningful movement this week
```

**Acceptance:**

- A user can begin the top task in one click.
- No more than one visible Quick Capture surface.
- Social, Outreach, Partner, and File signals link into their destination.
- No technical engine cards appear in normal mode.

---

### CCX-205 — Unify Quick Capture

**Objective:** Make capture a single lightweight entry point.

**Accepted capture intents:**

```text
Task
Decision
Blocker
Post idea
Partner note
Campaign idea
File/report note
```

**Acceptance:**

- Le-E may suggest routing, but the saved destination is visible.
- Capture never sends, publishes, or launches anything.
- The new object can be opened immediately.

---

### CCX-206 — Inbox and Today browser workflows

Add end-to-end tests for:

- Open Today and start the Now item
- Open an Inbox social-review item and return
- Approve a safe decision through the existing approval path
- Snooze an item
- Capture a post idea
- Handle a module-read failure without a white screen

### Phase 2 exit criteria

- Today is a command surface, not a dashboard inventory
- Inbox replaces competing human-action queues
- Every item deep-links correctly
- Existing approvals and audit behavior remain intact

---

## Phase 3 — Social Workspace: Canva + Buffer + Notion

### CCX-300 — Normalize the Post view model

**Objective:** Present all current social records as one consistent Post object.

**Deliverables:**

- Stable `PostView`
- User-facing status adapter
- Channel variants
- Asset references
- Schedule
- Readiness summary
- Result summary
- Activity

**Rules:**

- Do not duplicate Content Bank, post, proof, and calendar records unless a true conversion creates a new Post.
- Preserve source references and audit history.

---

### CCX-301 — Build Social home views

**Views:**

```text
Ideas
Calendar
Library
Results
```

**Saved filters:**

```text
Needs review
Scheduled
Published
Channel
Campaign/topic
Owner
Date range
```

**Acceptance:**

- Review Desk is no longer a separate destination.
- Content Calendar is a view, not a separate page.
- Post Ideas and Draft Posts use the same underlying records where applicable.
- The page has one primary action: Create post.

---

### CCX-302 — Build the unified post composer

**Layout:**

```text
Left: templates and brand assets
Center: visual preview and copy editor
Right: channels, schedule, readiness, primary action
```

**Capabilities:**

- Choose template
- Edit headline, caption, CTA, hashtags, and approved disclaimer fields
- Choose logo, Wilma pose, background, and brand treatment
- Preview selected channel format
- Save draft automatically or through clear save behavior
- Exit without losing work

**Acceptance:**

- A first-time user can create a branded LinkedIn post without leaving the composer.
- No separate navigation is required for assets, guidelines, preview, review, or scheduling.
- Unsaved-state behavior is explicit.

---

### CCX-303 — Integrate templates and the brand library

**Objective:** Provide Canva-like speed through constrained, reusable design systems.

**Deliverables:**

- Template categories such as:
  - Legal education
  - FAQ
  - Partner story
  - Quote
  - Product update
  - Proof point
- Brand drawer:
  - Approved logos, including the exact white wordmark for dark surfaces
  - Wilma poses
  - Colors
  - Backgrounds
  - Approved disclaimer blocks
  - Usage guidance

**Acceptance:**

- Missing assets produce a clear error; no silent substitution.
- Template and asset selection persist on the Post.
- The approved white logo is offered only for sufficiently dark creative surfaces.
- The application-shell white logo and external-content logo choices remain separate, canonical assets.
- Logo assets are referenced, not copied into duplicate Post records.
- All generated output respects existing guideline and render checks.

---

### CCX-304 — Add per-channel variants

**Objective:** Support Buffer-like multi-channel authoring without forcing one caption everywhere.

**Capabilities:**

- Select channels
- Start from shared copy
- Customize copy and media per channel
- Show character/format guidance
- Preserve channel-specific variants
- Preview each channel

**Acceptance:**

- Editing LinkedIn copy does not silently overwrite Instagram-specific copy.
- Removing a channel does not delete its saved variant without confirmation.

---

### CCX-305 — Build plain-language readiness

**Objective:** Translate all existing safety and production checks into an understandable checklist.

**Ready example:**

```text
Ready to schedule
✓ Copy follows LegalEase guidelines
✓ Image passed quality review
✓ LinkedIn is connected
✓ Publishing time selected
```

**Blocked example:**

```text
2 fixes before scheduling
• The caption makes an outcome promise. [Fix with Le-E] [Edit]
• Instagram is not connected. [Connect]
```

**Rules:**

- Existing hard failures remain hard.
- The checklist must distinguish content fixes, connection fixes, missing schedule, and approval requirements.
- Technical rule IDs remain available only in advanced detail or logs.

---

### CCX-306 — Build the calendar and scheduling workflow

**Capabilities:**

- Month and week view
- All-channel view
- Drag or explicit Move date action
- Unscheduled tray
- Time-zone clarity
- Conflict warning
- Duplicate post
- Open post from calendar

**Acceptance:**

- Moving a post never publishes it.
- Scheduling is distinct from publishing.
- All date changes are persisted and auditable where required.

---

### CCX-307 — Simplify review and approval

**Objective:** Make Approve the review action while preserving hard gates.

**Capabilities:**

- One review screen in the Post composer/detail page
- Approve
- Request/fix changes
- Regenerate image
- View previous versions/activity

**Acceptance:**

- No ceremony-only flags are exposed.
- Hard guideline or render failures prevent approval.
- A plain-language explanation accompanies every block.

---

### CCX-308 — Build channel connection and publishing controls

**Objective:** Support real posting when production credentials and server-side gates are correctly configured.

**Deliverables:**

- Settings → Social connections
- Per-channel connection status
- Clear distinction:
  - Not connected
  - Connected, publishing off
  - Ready to publish
  - Needs attention
- Publish now and scheduled publish use existing safe server-side authority
- Idempotency key per channel publication attempt
- Retry and partial-failure handling
- Published URL storage when available
- Manual publishing fallback remains available

**Safety rules:**

- UI cannot turn on an environment publishing gate.
- No credential appears in browser output.
- A multi-channel partial failure reports each channel separately.
- Repeated clicks cannot double-post.

---

### CCX-309 — Build Social Results

**Objective:** Show useful content outcomes and reuse opportunities.

**Capabilities:**

- Published posts
- Channel
- Publication time
- Basic performance metrics when available
- Best-performing themes/templates
- Reuse or duplicate action
- Mark a result as proof for Files/Investor Room

**Acceptance:**

- Missing analytics are labeled unavailable, not zero.
- Results never claim causation unsupported by data.

---

### CCX-310 — Social end-to-end acceptance suite

Required browser workflows:

1. Add an idea and turn it into a Post.
2. Create a Post from a template.
3. Select Wilma and a brand asset.
4. Trigger a guideline failure and resolve it.
5. Generate or render an image without silent asset substitution.
6. Add LinkedIn and Instagram variants.
7. Schedule the Post.
8. Move it on the calendar.
9. Publish manually in the no-credentials fixture.
10. Verify a gated live-publish test fixture cannot double-post.

### Phase 3 exit criteria

- The user can complete Idea → Create → Review → Schedule → Publish/Manual Publish in one workspace
- Review Desk and Content Calendar are views, not separate products
- Safety behavior is unchanged
- Live posting is clear, gated, idempotent, and diagnosable

---

## Phase 4 — Outreach: Mailchimp + SendGrid Without the Complexity

### CCX-400 — Define a unified Campaign view

**Objective:** Present partner outreach, one-time sends, sequences, and reactivation campaigns in one coherent model.

**Campaign types:**

```text
Partner outreach
Customer re-engagement
Announcement
```

**Delivery modes:**

```text
One-time message
Follow-up sequence
```

**Rules:**

- Existing engines remain authoritative.
- Reactivation may initially be represented through an adapter with a stable Campaign ID.
- Do not merge stored collections destructively in this packet.

---

### CCX-401 — Build Outreach home

**Views:**

```text
All
Draft
Scheduled
Active
Completed
```

**Primary columns:**

- Campaign
- Audience
- Status
- Next action
- Next send
- Replies
- Meetings or outcome
- Owner

**Acceptance:**

- The primary action is New campaign.
- Technical delivery metrics do not dominate the list.
- Existing campaign routes alias to Outreach.

---

### CCX-402 — Build the five-step campaign wizard

**Steps:**

```text
Goal → Audience → Message → Schedule → Review
```

**Rules:**

- Users may move backward without losing data.
- Progress is visible.
- Draft saves are reliable.
- Exit warns only when work is genuinely unsaved.

---

### CCX-403 — Goal and campaign-type step

**Fields:**

- Campaign name
- Campaign type
- Desired outcome
- Related partner program or product, when applicable
- Owner

**Acceptance:**

- The selected type changes later guidance but not safety standards.
- Internal engine names are not shown.

---

### CCX-404 — Audience builder and recipient preview

**Capabilities:**

- Select partner/customer records
- Use saved segments
- Filter by partner stage, type, geography, owner, status, or tag where data exists
- Preview actual included recipients
- Show excluded, invalid, held, unsubscribed, and suppressed recipients separately
- Explain each exclusion

**Acceptance:**

- The count shown on Review matches the execution input.
- A suppressed or unsubscribed recipient cannot be re-included through the UI.
- Large audiences are paginated.

---

### CCX-405 — Message and sequence builder

**Capabilities:**

- Subject
- Preview text
- Sender identity
- Body editor
- Personalization tokens with safe previews
- One-time message or multi-step sequence
- Delay between sequence messages
- Test message
- Le-E assist on explicit request

**Acceptance:**

- Unsupported or missing personalization tokens are caught before launch.
- Test sending cannot accidentally use the whole audience.
- UPL-sensitive or prohibited content follows current refusal/review rules.

---

### CCX-406 — Schedule and sending-window step

**Capabilities:**

- Send after approval
- Schedule for date/time
- Start sequence
- Time zone
- Weekday sending window
- Optional Send in batches under Advanced

**Acceptance:**

- “Batch” replaces “wave” in normal mode.
- Planning a batch does not turn sending on.
- Existing Eastern Time and send-window rules remain correct.

---

### CCX-407 — Review and launch checklist

**Checklist:**

- Goal complete
- Audience count
- Sender verified
- Message complete
- Sequence complete, if used
- Schedule selected
- Suppression checks passed
- Compliance/content checks passed
- Sending connection status
- Exact included and excluded counts

**Primary actions:**

```text
Send test
Request approval or Launch campaign, depending on policy
```

**Acceptance:**

- The user can state who receives what and when before launching.
- Approval does not silently execute when the current engine requires separate execution.
- Launch failure explains whether anything was sent.

---

### CCX-408 — Campaign detail page

**Tabs:**

```text
Overview
Messages
Audience
Replies
Results
Activity
```

**Overview:**

- Current status
- Next action
- Progress
- Schedule
- Audience summary
- Outcome summary
- Pause or resume, when valid

**Acceptance:**

- Pause is immediately understandable.
- Resume follows the current approval and safety rules.
- No raw webhook or engine vocabulary in normal mode.

---

### CCX-409 — Replies and outcome management

**Objective:** Optimize for partner outcomes, not only email metrics.

**Capabilities:**

- Replies requiring response
- Positive/negative/neutral classification when supported
- Create partner follow-up task
- Update Partner stage after explicit review
- Record meeting booked or next step
- Link reply to Partner activity

**Acceptance:**

- AI suggestions remain suggestions until applied.
- Evidence used for a suggested record update is visible.

---

### CCX-410 — Advanced delivery details

**Contains:**

- Delivery tracking status
- Domain verification
- Bounce and complaint limits
- Suppression detail
- SendGrid event health
- Batch detail
- Raw event references for authorized users

**Acceptance:**

- Hidden by default.
- Plain-language summary appears before technical detail.
- Safety limits cannot be overridden from normal campaign UI.

---

### CCX-411 — Outreach end-to-end acceptance suite

Required workflows:

1. Create partner outreach campaign.
2. Select a partner segment.
3. Verify included/excluded counts.
4. Create a one-time message.
5. Create a follow-up sequence.
6. Send a test safely.
7. Schedule and review.
8. Request and apply approval.
9. Launch in a controlled fixture.
10. Pause and resume with current policy.
11. Verify suppression cannot be bypassed.
12. Verify no double-send on retry.

### Phase 4 exit criteria

- Goal → Audience → Message → Schedule → Review works end to end
- Campaigns are understandable without wave, gate, telemetry, or engine terminology
- SendGrid and safety systems remain authoritative
- Partner replies connect to Partner records and Inbox

---

## Phase 5 — Partners as a Commercial CRM

### CCX-500 — Create the user-facing Partner stage adapter

**Mapping target:**

```text
New
Qualified
In conversation
Proposal
Active
Closed
```

**Rules:**

- Preserve detailed internal lifecycle stage.
- Add `uiStage` through a deterministic adapter.
- Stalled becomes a health/attention condition, not necessarily a separate primary stage.
- Lost maps to Closed with outcome detail.

**Acceptance:**

- Existing automation still sees the detailed stage.
- UI filters and pipeline use `uiStage`.

---

### CCX-501 — Build Partners home

**Views:**

```text
List
Pipeline
Needs follow-up
Active programs
```

**Primary fields:**

- Partner
- Stage
- Health
- Owner
- Next action
- Due date
- Last contact
- Program/opportunity

**Acceptance:**

- Search and filters work.
- Empty or irrelevant fields are hidden.
- A user can identify overdue follow-ups quickly.

---

### CCX-502 — Build the Partner record

**Header:**

- Partner name
- Stage
- Health
- Owner
- Next action
- Primary actions:
  - Log activity
  - Create outreach
  - Add file

**Tabs:**

```text
Overview
Activity
Outreach
Files
```

**Acceptance:**

- The next action is visible without scrolling on common laptop widths.
- Contacts, notes, program, and relationship data are understandable.
- Empty sections do not create card clutter.

---

### CCX-503 — Build unified Partner activity

**Activity sources:**

- Email/reply signal
- Meeting
- Note
- Stage change
- Outreach send
- Proposal/report creation
- File shared
- Task completed

**Acceptance:**

- Chronological and filterable.
- Sensitive source content respects role permissions.
- Duplicate events are deduplicated or clearly distinguished.

---

### CCX-504 — Integrate Outreach with Partners

**Capabilities:**

- Create campaign from selected Partners
- Create one-to-one follow-up from Partner record
- See all Campaigns touching the Partner
- Convert reviewed reply into task or stage update

**Acceptance:**

- A campaign never silently changes Partner stage.
- Record updates require explicit action when currently required.

---

### CCX-505 — Move partner programs and artifacts into the Partner record

**Actions under Create:**

```text
Proposal
Co-branded landing page
Weekly report
Final impact report
Program record
```

**Acceptance:**

- Existing generator behavior is reused.
- Generated outputs appear under Files and Activity.
- Separate primary pages for partner proposals, pages, dashboards, and reports are no longer needed in normal mode.
- Existing routes alias to the correct Partner context.

---

### CCX-506 — Partner end-to-end acceptance suite

Required workflows:

1. Add a Partner.
2. Move it through user-facing stages without corrupting internal lifecycle.
3. Set and complete a next action.
4. Create outreach from the Partner record.
5. Generate a proposal.
6. Find the proposal under Files.
7. Record a reply and update stage through explicit review.

### Phase 5 exit criteria

- Partner record is the home for relationship work and artifacts
- Next action is obvious
- Programs, proposals, pages, dashboards, and reports no longer require separate normal-mode navigation

---

## Phase 6 — Files and Investor Room

### CCX-600 — Define the File projection and canonical strategy

**Objective:** Present current document-like records through one File interface.

**Candidate sources:**

- Data room items
- Reports and evidence packs
- Partner program artifacts
- Brand assets
- Social media assets
- SOC 2 snapshots and evidence
- Uploaded documents
- Exported campaign results

**Normalized File view:**

```js
{
  id,
  name,
  fileType,
  collection,
  status,
  owner,
  modifiedAt,
  verifiedAt,
  storageRef,
  sourceRef,
  relatedObjects,
  permissions,
  activity
}
```

**Rules:**

- Use projection first.
- Introduce a canonical `files` collection only where new uploads or sharing require it.
- Preserve source references to avoid duplicate truth.

---

### CCX-601 — Build Files browser

**Navigation:**

```text
Home
All files
Recent
Starred
Shared
Trash

Collections
Brand Assets
Partner Files
Campaign Assets
Investor Room
Compliance & Evidence
```

**Capabilities:**

- List/grid toggle if useful
- Search
- Filter
- Sort
- Star
- Move to collection/folder
- Upload through New
- Create folder or collection where supported

**Acceptance:**

- Familiar Drive-like interactions.
- One New control.
- Large collections paginate.
- No fake folders that duplicate records.

---

### CCX-602 — Build File preview and details drawer

**Tabs:**

```text
Preview
Details
Activity
Sharing
Related
```

**Acceptance:**

- Preview common image, PDF, text/Markdown, and link artifacts safely.
- Unsupported types still provide metadata and download/open actions.
- Related Partner, Campaign, or Post is one click away.

---

### CCX-603 — Build secure upload and storage behavior

**Requirements:**

- Supabase Storage in hosted mode
- Local safe path in demo/local mode
- File type and size validation
- Stable metadata record
- Scoped permissions
- Audit event
- No path traversal
- No public URL unless policy explicitly allows it

**Acceptance:**

- Upload failure does not create a misleading current file record.
- Replacing a file retains version/activity history or creates an explicit new version.

---

### CCX-604 — Build the Investor Room

**Structure:**

```text
Company
Financial
Product
Traction
Legal & Compliance
Team
```

**Capabilities:**

- Readiness percentage or band
- Missing items
- Needs-update items
- Owner
- Last verified date
- Share/access status
- Activity history

**Rules:**

- Readiness must be derived from explicit requirements.
- Missing data is not treated as complete.
- A stale file is not equivalent to a current file.

---

### CCX-605 — Integrate reports and evidence as Files

**Behavior:**

- Generate report
- Save as a File automatically
- Open preview
- User chooses whether to add it to Investor Room, Partner Files, or another collection

**Acceptance:**

- Reports no longer need to be discovered through a separate primary destination.
- Report source data and generation date are visible.
- Draft/internal status remains explicit.

---

### CCX-606 — Sharing and access controls

**Capabilities:**

- View current access
- Grant/revoke access only through authorized server actions
- Optional expiring share link if the current security model supports it safely
- Audit access changes

**Acceptance:**

- Investor and partner roles see only authorized records.
- Public sharing is never implied by a storage URL.
- Revocation is immediate and tested.

---

### CCX-607 — Files end-to-end acceptance suite

Required workflows:

1. Upload a file.
2. Preview it.
3. Relate it to a Partner.
4. Star and find it in Recent.
5. Generate a report and add it to Investor Room.
6. Show a stale item as Needs update.
7. Verify unauthorized access is denied.
8. Verify a failed upload does not create false readiness.

### Phase 6 exit criteria

- Files is the universal document workspace
- Investor Room is a structured collection, not a separate file system
- Reports, evidence, partner artifacts, and brand assets are discoverable through Files

---

## Phase 7 — Onboarding, Help, and Product Discovery

### CCX-700 — Build first-run onboarding

**First question:**

```text
What would you like to do?

Create and schedule social content
Run partner or customer outreach
Manage partner relationships
Organize company and investor files
Plan my work for today
```

**Acceptance:**

- Selection opens a real workflow.
- User can skip and return later.
- Onboarding does not falsely mark integrations complete.

---

### CCX-701 — Build setup checklist

Suggested checklist:

```text
Add brand assets
Connect a social channel
Add a Partner
Create a social Post
Create an Outreach Campaign
Add an Investor Room file
```

**Acceptance:**

- Completion is derived from real state.
- Every item deep-links to the setup action.

---

### CCX-702 — Replace generic empty states

Each empty state must include:

- What the area is for
- What will happen next
- One primary action
- Optional example or template

Tests should reject empty states that contain only “No data,” “Nothing here,” or similar copy without guidance.

---

### CCX-703 — Build lightweight contextual help

**Help menu:**

```text
What the Command Center does
Take a product tour
Social workflow
Outreach workflow
Partner workflow
Files and Investor Room
Keyboard shortcuts
```

**Rules:**

- Help content should open contextually.
- Do not create another primary Help Center destination.
- Link advanced system guidance from Settings only.

---

### CCX-704 — Instrument privacy-safe product analytics

Track:

- Destination opened
- Workflow started
- Workflow completed
- Workflow abandoned
- Validation blocked
- Action failed
- Time to first completed workflow
- Search result selected

Do not record:

- Email body
- Social post body
- Legal facts
- Recipient addresses
- OAuth or secret values
- Unredacted partner communications

### Phase 7 exit criteria

- A first-time user can discover every primary capability
- Empty states teach rather than confuse
- Product analytics can identify abandonment without collecting sensitive content

---

## Phase 8 — Commercial Hardening, Cutover, and Cleanup

### CCX-800 — Compact APIs and performance pass

**Objective:** Prevent the new UI from inheriting whole-state rendering and persistence problems.

**Tasks:**

- Add compact page reads
- Add pagination
- Cache safe derived views where appropriate
- Remove duplicate fetches
- Ensure list actions use scoped writes
- Measure response sizes and browser performance

**Acceptance:**

- Performance budgets in Section 6 pass.
- Le-E and normal pages do not echo full state.

---

### CCX-801 — Accessibility audit and remediation

**Required:**

- Automated axe tests
- Keyboard-only pass
- Screen-reader landmark/form review
- Contrast review
- Error announcement review
- Dialog and drawer focus review

No known critical or serious accessibility violations may remain in primary workflows.

---

### CCX-802 — Reliability and recovery states

Test and implement:

- Read timeout
- Write timeout
- Lost network during save
- Third-party publish failure
- Partial multi-channel publish
- SendGrid rejection
- Expired authorization
- Supabase unavailable
- Missing asset
- Invalid route
- Stale browser action

Each state must clearly state what did and did not happen.

---

### CCX-803 — Production verification extension

Add vNext checks to production verification:

- Feature flags
- Shell render
- Compact APIs
- Unauthorized access
- No secret exposure
- Live publishing off by default
- Sending off by default where currently required
- Storage health
- Route aliases
- No white screen
- Critical browser workflows in a production-like fixture

---

### CCX-804 — Legacy route and renderer deprecation

**Prerequisites:**

- New destination has parity
- Alias has browser coverage
- No required workflow depends on old page
- Production-like verification passes
- Rollback checkpoint exists

**Tasks:**

- Remove obsolete primary navigation
- Remove dead landing pages
- Remove duplicate Social review and calendar surfaces
- Remove duplicate Campaign pages
- Remove separate normal-mode partner-artifact pages
- Remove separate normal-mode Reports/Proof/Data Room navigation
- Preserve aliases for one additional release unless security or correctness requires immediate removal

**Acceptance:**

- No dead function, route, or test remains.
- Bundle/server source size is measurably reduced.
- Existing deep links still resolve through aliases.

---

### CCX-805 — Update documentation and demo data

Update:

- README
- Production runbook
- Operator guide
- Investor/demo script
- Demo seed data
- Screenshots or walkthrough assets
- Environment variable documentation
- Support/troubleshooting guide
- Brand usage note covering the white shell logo, navy sidebar, soft teal selected state, and orange action hierarchy
- Approved visual-reference image retained under `docs/ux-vnext/reference/`

The demo story must use the five destinations and complete real workflows rather than touring internal systems.

---

### CCX-806 — Final launch gate

The vNext flag may become the default only when all conditions below pass.

#### Product

- Five primary destinations only
- No dead visible buttons
- No primary page uses technical internal language
- Empty, loading, error, and success states exist
- All critical objects have exact deep links
- Primary workflows persist real state and survive reload
- No critical page depends on static mockup data

#### Brand and visual system

- Deep navy sidebar is consistent across all primary destinations
- Official all-white LegalEase logo file is used without distortion or recreation
- Selected navigation uses the approved soft teal treatment
- Primary actions use exact LegalEase orange `#F04800`
- Orange is not overused for secondary actions or semantic danger
- Main work surfaces remain clean white/light gray
- Desktop, laptop, tablet, and mobile screenshot review passes
- No unauthorized near-duplicate brand color or unofficial logo appears

#### Social

- Idea → Create → Review → Schedule → Publish/manual publish passes
- Brand assets available inside composer
- Channel variants persist
- Safety and render checks block correctly
- No duplicate posting on retry

#### Outreach

- Goal → Audience → Message → Schedule → Review → Launch passes
- Recipient counts match execution
- Suppression cannot be bypassed
- Approval and execution behave correctly
- No duplicate sending on retry

#### Partners

- Next action visible immediately
- Outreach and Files integrated
- User-facing stages do not corrupt internal lifecycle

#### Files

- Upload, preview, relate, search, and access control pass
- Investor Room readiness is truthful
- Failed or stale files cannot falsely count as current

#### Engineering

- `npm run check` passes
- `npm test` passes
- Browser suite passes
- Production verification passes
- Accessibility gate passes
- Performance budgets pass
- Rollback tested
- No high-severity audit finding introduced

---

# 9. Required Test Strategy

## 9.1 Test layers

### Layer 1 — Pure unit tests

For:

- Status adapters
- Route aliases
- View models
- Readiness translators
- Inbox deduplication
- Partner stage mapping
- File readiness
- Safe copy helpers

Use the repository’s existing Node `assert` conventions.

### Layer 2 — Domain regression tests

Preserve and extend current tests for:

- Approval
- Suppression
- Social guidelines
- Render quality
- Send windows
- Campaign safety thresholds
- Storage durability
- Authorization
- Audit events
- Idempotency

### Layer 3 — API contract tests

For compact page reads and scoped writes:

- Authorized success
- Unauthorized refusal
- Missing record
- Safe error shape
- No secret fields
- Pagination
- Size/shape contract

### Layer 4 — Browser end-to-end tests

Critical workflows only. Avoid testing every markup detail through browser automation.

### Layer 5 — Production-like smoke tests

Run against hosted or representative production mode with live external actions disabled unless using a dedicated safe fixture.

## 9.2 Test naming

Recommended:

```text
scripts/test-vnext-brand-contract.mjs
scripts/test-vnext-shell.mjs
scripts/test-vnext-route-aliases.mjs
scripts/test-vnext-inbox-view.mjs
scripts/test-vnext-today-view.mjs
scripts/test-vnext-social-view.mjs
scripts/test-vnext-social-readiness.mjs
scripts/test-vnext-outreach-view.mjs
scripts/test-vnext-outreach-audience.mjs
scripts/test-vnext-partner-view.mjs
scripts/test-vnext-files-view.mjs
scripts/test-vnext-investor-room.mjs
browser-tests/vnext-brand-visual.spec.mjs
browser-tests/vnext-shell.spec.mjs
browser-tests/vnext-social.spec.mjs
browser-tests/vnext-outreach.spec.mjs
browser-tests/vnext-partners.spec.mjs
browser-tests/vnext-files.spec.mjs
browser-tests/vnext-accessibility.spec.mjs
```

## 9.3 Avoid brittle tests

Do not rely exclusively on source substring checks for new workflows.

Prefer:

- Pure function output assertions
- Structured HTML parsing where practical
- API response assertions
- Browser interaction tests

Existing source-level guard tests may remain where they protect a specific security or copy invariant.

---

# 10. Data Migration and Compatibility Rules

## 10.1 Projection before migration

For Posts, Campaigns, Partners, and Files:

1. Build a view adapter.
2. Render and validate it.
3. Add any missing stable identifiers.
4. Only then consider moving data into a new canonical collection.

## 10.2 Stable identifiers

Never derive a permanent identifier solely from a mutable title, recipient email, or display label.

## 10.3 Source references

Every projected object should retain its origin:

```js
{
  sourceCollection: "partnerProgramArtifacts",
  sourceId: "artifact-123"
}
```

## 10.4 No destructive migration without a dry run

Any storage migration must include:

- Preview/dry-run command
- Counts by source and target
- Duplicate report
- Unmapped record report
- Backup/export checkpoint
- Idempotent rerun behavior
- Rollback notes

## 10.5 Route compatibility

A route may change presentation without changing the source object. Old links should redirect to canonical vNext routes.

---

# 11. Product Analytics and Success Measures

The redesign is successful when users complete work faster and with less uncertainty, not merely when page count drops.

## 11.1 Usability measures

### Navigation

- A first-time user correctly identifies where to create a Post, run Outreach, find a Partner, and locate a File.
- No more than five primary destinations.

### Social

- A first-time user schedules a branded LinkedIn Post without assistance.
- User never leaves Social to find brand assets, review copy, preview, or schedule.
- Before scheduling, the user can state the selected channels, content, date, and time.

### Outreach

- A first-time user creates a test partner Campaign without assistance.
- Before launch, the user can state exactly who is included, who is excluded, what will be sent, and when.
- Normal flow does not show wave, telemetry, live gate, or engine terminology.

### Partners

- User finds the next action for a Partner within ten seconds.
- All Partner artifacts are reachable from the Partner record.

### Files

- User uploads, previews, organizes, and finds a File using familiar controls.
- User identifies missing or stale Investor Room items without opening every folder.

## 11.2 Reliability measures

- Zero duplicate external actions from repeated clicks or retries
- Zero suppressed recipients included through UI manipulation
- Zero published posts bypassing hard guidelines
- Zero unauthorized file access in test matrix
- Zero blank-screen critical route failures

---

# 12. Risk Register

| Risk | Mitigation |
|---|---|
| Monolithic `preview-server.mjs` makes every change dangerous | Extract pure modules first; use feature flags; one packet per PR |
| Existing tests encode old navigation/copy | Update only when the new contract is implemented; preserve safety tests |
| UX adapter diverges from engine truth | Keep engines authoritative; derive view state with pure tested adapters |
| Duplicate objects are created during consolidation | Use source references and projection-first strategy |
| Social editor scope expands into a design-tool rewrite | Restrict v1 to high-quality templates and controlled brand editing |
| Live posting creates accidental duplicate content | Server authority, idempotency keys, per-channel attempt records, retry tests |
| Outreach consolidation weakens suppression | Suppression remains engine-level and impossible to override in normal UI |
| Old bookmarks break | Maintain canonical alias registry and browser tests |
| New shell loads the entire state | Add compact module APIs and lazy reads |
| Accessibility postponed until the end | Enforce component-level accessibility from Phase 0 and audit in Phase 8 |
| Technical terms return through error messages | Central founder-language registry and forbidden-term tests |
| Commercial polish hides important safety state | Use plain-language readiness with expandable advanced detail |
| AI mockup wordmark is mistaken for the production logo | Commit and render the exact approved white logo asset; test its canonical path |
| Orange or teal spreads across every control and weakens hierarchy | Enforce token roles and review screenshots for one-primary-action discipline |
| Collapsed navigation invents an unofficial logo mark | Use only a verified existing mark; otherwise retain the full wordmark in the drawer |

---

# 13. Definition of Done for Every Work Packet

A packet is not complete until all applicable items pass:

- [ ] Scope matches one numbered packet
- [ ] Existing `main` inspected before implementation
- [ ] User-facing outcome is demonstrable
- [ ] No unrelated refactor
- [ ] Tests added or updated
- [ ] Relevant existing tests pass
- [ ] `npm run check` passes
- [ ] Browser test added for critical interaction
- [ ] Loading, empty, error, and success states considered
- [ ] Keyboard and accessible-name behavior checked
- [ ] Mobile/laptop layout checked
- [ ] Approved navy/teal/orange token roles followed
- [ ] Exact approved white logo used where the shell brand appears
- [ ] Screenshot captured for user-visible packet
- [ ] No technical vocabulary in normal mode
- [ ] No safety or authorization regression
- [ ] No secret exposure
- [ ] No broad full-state write introduced
- [ ] Duplicate-click protection present
- [ ] Audit behavior preserved
- [ ] Route aliases preserved
- [ ] PR explains rollback
- [ ] Changed files and known limitations documented

---

# 14. Codex PR Description Template

```markdown
## CCX-### — [Outcome]

### User problem
[What was confusing or impossible before]

### Result
[What the user can now do]

### Scope
- ...

### Intentionally not included
- ...

### Existing behavior preserved
- Authorization
- Audit
- Safety gates
- Suppression
- Route aliases
- ...

### Implementation
- ...

### Tests
- `...`
- `npm run check`
- `...`

### Manual verification
1. ...
2. ...

### Rollback
[Feature flag or revert path]

### Known limitations
- ...

### Next unblocked packet
CCX-...
```

---

# 15. First Prompt to Give Codex

Use this prompt to begin. It intentionally limits Codex to the baseline packet.

```text
Repository: Roger-LegalEase/legalease-command-center

Read LEGALEASE_COMMAND_CENTER_MASTER_BUILD_PLAN_CODEX.md in full. Implement CCX-000 only: Establish a verified baseline.

Before doing any work, verify these exact repo inputs exist and are readable:
- LEGALEASE_COMMAND_CENTER_MASTER_BUILD_PLAN_CODEX.md
- assets/brand/logos/legalease-logo-white-2025.png
- docs/ux-vnext/reference/command-center-vnext-approved-direction.png

If either approved visual asset is missing or corrupt, stop and report the missing prerequisite. Do not create, redraw, recolor, or substitute an asset.

Do not implement the new shell, navigation, design tokens, Social redesign, Outreach redesign, Partners redesign, Files redesign, or any later packet. Do not change user-facing behavior unless a deterministic repository defect prevents baseline verification, and isolate any such fix.

Required work:
1. Inspect current main and record its SHA.
2. Install dependencies and run the existing verification commands.
3. Create docs/ux-vnext/baseline.md with the current routes, feature flags, known failing tests, demo-data commands, safety/publishing posture, representative page/state payload sizes, current logo usage, and the dimensions/type/SHA-256 checksum of both approved visual assets.
4. Clearly distinguish pre-existing failures from regressions.
5. Make no safety, authorization, sending, publishing, storage, data-model, or visual-shell changes.
6. Return a summary of changed files, commands run, results, known limitations, and whether CCX-001 is unblocked.

Use branch codex/ccx-000-verified-baseline and PR title “CCX-000: Establish the vNext verified baseline.”
```

---

# 16. Recommended Follow-On Prompt Pattern

After CCX-000 merges, use:

```text
Read LEGALEASE_COMMAND_CENTER_MASTER_BUILD_PLAN_CODEX.md and inspect current main.
Implement CCX-[NUMBER] only.

Honor all global rules, prerequisites, acceptance criteria, test requirements, and rollback requirements in the plan. Do not implement future packets. Preserve existing safety, authorization, audit, storage, suppression, and fail-closed behavior.

Before coding, summarize the current relevant implementation and list the exact files you expect to change. Then implement, test, and stop with a PR-ready report.
```

---

# Appendix A — Approved Brand Assets and Visual Reference

The repository should contain:

```text
assets/brand/logos/legalease-logo-white-2025.png
docs/ux-vnext/reference/command-center-vnext-approved-direction.png
```

## White logo asset

- Official source supplied by Roger
- Transparent PNG
- Intended for the deep navy Command Center shell
- Must be rendered as an image asset, never retyped
- May be resized proportionally but not otherwise altered

## Visual-reference asset

The reference composite shows six intended surfaces:

1. Today dashboard
2. Social calendar
3. Social post composer
4. Outreach campaign list
5. Partners pipeline
6. Files / Investor Room

The implementation should preserve the reference hierarchy:

- Dark navy navigation rail
- White LegalEase wordmark
- Soft teal current-location treatment
- Orange primary actions and attention accents
- White/light-gray content surface
- High information clarity without excessive buttons
- Consistent page headers, tabs, lists, tables, and record panels

The mockup is not evidence that a feature already exists. Every control must be backed by real application behavior, tested data, permission checks, and explicit loading/error/success states.

# 17. Final Product Acceptance Statement

The program is complete when the Command Center no longer requires its founder to understand how the software is built in order to use it.

The user should be able to open the product and immediately know:

- What to do today
- Where to make and publish content
- Where to create and run outreach
- Where to manage a partner
- Where to find company and investor files
- What needs a decision
- What happened after an action

The underlying Command Center may remain operationally sophisticated. The surface must feel calm, direct, and obvious.

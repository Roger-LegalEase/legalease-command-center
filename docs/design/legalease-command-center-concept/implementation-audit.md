# Command Center action-discoverability audit

Audited at `01e7226` (starting HEAD of `feat/command-center-concept-parity`), against the
**rendered implementation**, not documentation. Every row cites the renderer that produces the
string. "Clicks from workspace" starts with that workspace already open and excludes login.
"Prior knowledge required" is Yes when Roger must know a hidden route, an internal term, a
Settings location, a non-obvious menu, or an undocumented relationship between two surfaces.

**The Post-change column is now the implementation record.** Every "Done" in it is proven by a
browser test in `tests/browser/command-center-discoverability.spec.mjs`, driven against the real
server with the Founder OS flags on — not by reading source. Implementation screenshots at 1600,
1024 and 390 are in `implementation-evidence/`.

## The canonical four workspaces

Authority: `scripts/ui/founder-os-config.mjs:31-36` (`FOUNDER_OS_PRIMARY_WORKSPACES`). No second
navigation registry was created; the legacy registry in `scripts/ui/navigation.mjs` marks only
`today` and `campaigns` as primary and is not the authority.

| id | Visible label | route | Flag |
|---|---|---|---|
| `today` | Today | `today` | `FOUNDER_OS_TODAY` |
| `partners` | Relationships | `partners` | `FOUNDER_OS_RELATIONSHIPS` |
| `outreach` | Campaigns | `campaigns` | `FOUNDER_OS_CAMPAIGNS` |
| `scoreboard` | Scoreboard | `revenue` | `FOUNDER_OS_SCOREBOARD` |

All four sit behind `FOUNDER_OS_SHELL`, which is itself inert unless `COMMAND_CENTER_UX_VNEXT`
is true (`founder-os-config.mjs:12-14`). Recorded production state
(`docs/founder-os/execution/log.md:768-771`): shell, today, relationships, campaigns **on**;
scoreboard and Le-E panel **off**. `COMMAND_CENTER_UX_OUTREACH` is not recorded anywhere in the
repository, and it changes the answer for bulk upload — both cases are given below.

## Delivery model per workspace

| Workspace | Founder renderer | Delivery | Effect on the legacy page |
|---|---|---|---|
| Today | `scripts/ui/pages/today-page.mjs` | inline in shell | **replaces** it |
| Relationships | `scripts/ui/pages/partners-home.mjs` | inline in shell | **replaces** it |
| Campaigns | `scripts/ui/pages/founder-campaigns.mjs` | lazy runtime | **replaces** it (was: prepended) |
| Scoreboard | `scripts/ui/pages/founder-scoreboard.mjs` | lazy runtime | **replaces** it |

That Campaigns row was the source of most of the vocabulary damage below: Roger saw the clean
founder block and the legacy page, with contradictory language, on one screen. **Corrected.** The
founder workspace now owns the section and carries exactly one legacy node forward — the
reactivation control surface, which is the only home of Run, Stop, Pause and audience release —
behind a founder-labelled disclosure. With `COMMAND_CENTER_UX_VNEXT_OUTREACH` on, the vNext
Outreach page stands down on this route instead of fighting for the same element.

---

## The two named failures

### Partner Outreach approval

| Field | Finding |
|---|---|
| Count currently shown | `N items need your approval before anything goes out.` — `scripts/ui/view-models/founder-campaigns-view.mjs:258-262` |
| Source | `partnerOutreachLane()` `:239-277`, over `state.prospectCandidates` (`review_state === "pending_review"`) **plus** `state.approvalQueue` (`status === "queued_for_answer"`), served by `GET /api/ui/campaigns` (`scripts/founder-campaigns-api.mjs:17`) |
| Where the ranked list lives | route `#prospects`; server `preview-server.mjs:27443-27451`; client `scripts/ui/pages/prospect-workbench.mjs` |
| How Roger reaches it now | **He cannot.** `#prospects` is not linked from Campaigns, from the founder lifecycle block, from primary navigation, or from Settings → Advanced (`FOUNDER_OS_ADVANCED_ROUTES`, `founder-os-config.mjs:41-57`). Global search does not index `prospectCandidates`. Only paths: type `#prospects`, or type `#more` then click. |
| Clicks today | **∞ from the workspace** (URL typing required) |
| Labels at the destination | `RCAP pipeline`, `RCAP Prospects`, `Upload RCAP prospect list`, `Open RCAP review`, tile `prospect candidates` (`preview-server.mjs:27448-27449`); `suppression checks` (`prospect-workbench.mjs:109`) |
| Two defects in the number | (1) the `approvalQueue` half is **not filtered by lane**, unlike the press lane which is (`founder-campaigns-view.mjs:246` vs `:308`), so any queued approval inflates it; (2) it sums two different objects with two different endpoints under one label. |
| Additional finding | `POST /api/outreach/approve` (`preview-server.mjs:38715`) **has no client caller anywhere**, so the queued half cannot be acted on from any UI. |

### Bulk audience upload

| Field | Finding |
|---|---|
| Where it lives | route `#upload`, `preview-server.mjs:27281-27340` |
| Under Settings or Advanced? | **Neither.** Absent from `FOUNDER_OS_ADVANCED_ROUTES` and from the Settings page. |
| Clicks today, outreach flag **off** | **1** — `Upload a list` on the legacy Campaigns hero (`preview-server.mjs:27400`), which survives only because the founder block prepends rather than replaces. A second 1-click path is `Review held contacts` (`:27418`), a label that says nothing about uploading. |
| Clicks today, outreach flag **on** | **None.** `outreach-home.mjs:89-100` replaces `#campaigns` innerHTML, destroying the hero and the button. URL typing required. |
| Internal knowledge required | Yes — that `Upload a list` beneath the lifecycle block is the audience importer; that `Review held contacts` is the same destination; and, on the page, list types including `RCAP prospects` and an after-import option `Suppress / do not contact` (`:27291-27309`). |

---

## Inventory — actionable items

Purely informational metrics are summarised after this table; per the brief they must **not**
receive fabricated mutation controls.

| Workspace | Visible information | Current route/component | Requires action? | Current control beside it | Actual action location | Clicks | Prior knowledge? | Concept target | Planned correction | Post-change result |
|---|---|---|---|---|---|---|---|---|---|---|
| Today | Now item: title, `whyNow`, rank meta | `today-page.mjs:232-238` | Yes | `Open` / `Draft reply` button | in-place panel | 1 | No | 01/02 — action beside the item | Keep; align labels to concept | **Done** — kept, labels aligned |
| Today | `Advanced full record` link | `today-page.mjs:245` | No | link | Artifact viewer | 1 | **Yes** — "Advanced" is shell vocabulary | 01 | Rename to `Open full record` | **Done** — `Open full record` |
| Today | `N further ranked items are open but not needed today.` | `today-page.mjs:226-229` | No | **none** | **nowhere** | ∞ | Yes | 01 | Link to the filtered queue | **Done** — links to the filtered list |
| Today | Needs attention — `Automation stopped for safety and nothing will resume until you decide.` | `founder-today-view.mjs:409-414` | **Yes — hard decision** | **none**; `href:""` (`:426`), `actionLabel:"Review"` (`:432`) renders `null` | unknown to the UI; `queueItemId` is stripped by `compactFounderItem` (`today-page-service.mjs:101-128`) | **no path exists** | Yes | 01 | Carry `queueItemId` through and link to the existing guarded review surface | **Done** — server-vetted `#item/…` destination on the row |
| Today | Needs attention — stalled queue rows `No movement for N days.` | `founder-today-view.mjs:464-483` | Yes | none for queue-backed rows | task workbench (tasks only) | none | Yes | 01 | Same correction | **Done** — same correction |
| Today | Meetings — `Open brief` | `founder-today-view.mjs:382-388` | Partly | link → `#meetings` | `#meetings` | 1 | **Yes** — not in the four-item nav, no return path | 01 | Keep link; add return context | **Done** — link kept; browser Back returns to Today |
| Relationships | `Follow-ups due` count tile | `partners-home.mjs:164` | **Yes** | **none on the tile** | separate filter button | 2 | No | 03 — count opens its list | Make the count itself the control | **Done** — the count is the filter |
| Relationships | `Waiting on Roger` count tile | `partners-home.mjs:164` | **Yes** | none on the tile | filter button | 2 | No | 03 | Same | **Done** — the count is the filter, as `Waiting on me` |
| Relationships | Row `Next action` / `No next action set` | `partners-home.mjs:100` | **Yes** | no dedicated control | drawer → `Set next action` | 2 | Partly | 03/04 — next move exposed on the row | Surface the next move without an overflow guess | **Done** — the row reads `Set next action` when none is set |
| Relationships | Row `Eligibility: Suppressed` | `partners-home.mjs:107`, `relationship-service.mjs:43-48` | Yes | **none** | **no UI exists in any of the four workspaces to lift a suppression** | none | Yes | 03 — protected and visible | Keep protection visible; rename to `Not eligible to contact`; do **not** add a lift control in this release | **Done** — reads `Not eligible to contact`; no lift control added |
| Relationships | `Possible duplicate: … Nothing has been merged.` | `partners-home.mjs:146-151` | **Yes — a correction** | **none** (a `<p role="note">`) | **no merge/confirm UI exists** | none | Yes | 03 | Out of scope for this release; record as a gap | **Not built** — no approved merge action exists (§ gaps) |
| Relationships | `Import` / `Add relationship` | header, concept 03 | Yes | `Add Partner` exists; **`Import` does not** | `#upload` | ≥1 + prior knowledge | Yes | 03 — both in the header | Add `Import relationships` to the header | **Done** — `Import relationships` and `Add relationship` in the header |
| Campaigns | **All 20 lifecycle stage actions** across four campaign types | `founder-campaigns.mjs:49` | **Yes** | **none — every action renders as a `<span>`**, no `<a>`, no `<button>`, no handler | scattered legacy controls | varies, often ∞ | Yes | 05 — one primary control per card | Render the existing action as a real control that navigates to the existing guarded workflow | **Done** — 10 real controls, 10 plain status (§ lifecycle) |
| Campaigns | Partner outreach `N items need your approval…` | `founder-campaigns-view.mjs:258-262` | **Yes** | **none** | `#prospects`, unlinked | ∞ | **Yes** | 05 — `Review approvals` on the card | Primary control `Review approvals` → existing ranked list; filter the queue half by lane | **Done** — count corrected; `Review approvals` opens the ranked list |
| Campaigns | Reactivation Review — `The next audience is ready for your approval (N people).` | `founder-campaigns-view.mjs:145-151` | **Yes — approval** | **span** | legacy: preview → wave → send to queue → `#queue` → run | **4–5** | Yes | 05 | Single primary control to the existing approval surface | **Done** — one control opens the existing sending controls |
| Campaigns | Reactivation exception — `Delivery feedback is not connected.` | `founder-campaigns-view.mjs:127-135` | **Yes — setup** | **none** (`action:null`) | Settings → Integrations | ≥3 | Yes | 05 | Link to the existing connections surface | **Done** — `Open connections` on the exception |
| Campaigns | Campaign-type exception actions (e.g. `Review the safety limit`) | `founder-campaigns-view.mjs:124` | Yes | **dropped by the renderer** (`founder-campaigns.mjs:59` prints summary+detail only) | legacy card / `#queue` | ≥2 | Yes | 05 | Render the action | **Done** — lane exceptions now render their action |
| Campaigns | Bulk upload entry | `preview-server.mjs:27400` | Yes | `Upload a list` on the **legacy** hero | `#upload` | 1 (or none with outreach flag on) | Yes | 05 — inside Plan/setup | Add `Import audience` to campaign setup | **Done** — `Import audience` in Plan and setup, both flag states |
| Scoreboard | `N Needs attention` summary count | `founder-scoreboard.mjs:25-28` | **Yes** | **none — the counts are `<span>`s** | per-card `Open source`, if any | ≥2 | Yes | 07 | Corrective action beside the metric | **Done** — counted heading; each row links to its corrective action |
| Scoreboard | Card detail — `Add the current cash balance and an as-of date.`, `The cash as-of date is more than 45 days old.` | `founder-scoreboard.mjs:216-222`, service `:264,318` | **Yes — correction** | **none**; only `Open source` | owner-input form on the same page | 1–3 | Partly | 07 — `Update financials` | Bind the detail to the existing owner-input form | **Done** — `Update financials` to the owner-input form |
| Scoreboard | Health card — `Open Company Health for the next safe step.` | service `:418` | **Yes** | none | `#os-health`, not in the four-item nav nor Advanced; reachable via Settings → technical details | **3** | **Yes** | 07 — `Connect analytics` / setup action | Link the existing setup surface | **Done** — `Open platform health` beside the metric |
| Scoreboard | Corrective actions per metric | `founder-scoreboard-registry.mjs:72` | Yes | exist **only** behind `FOUNDER_OS_SCOREBOARD`, which is **off in production** | — | — | Yes | 07 | Decide flag strategy; do not fabricate | **Done behind `FOUNDER_OS_SCOREBOARD`** — the flag is NOT enabled |

### Purely informational (no mutation control to be added)

Today's date label, rank chips and five empty states; Relationships' `Showing N relationships.`,
last inbound/outbound, owner, role chips; Campaigns' safety strip and metric tiles; Scoreboard's
`Updated <date>`, `Source`, `Last refreshed`, and healthy `Live` cards. These link to supporting
detail where one exists and otherwise state that no action is required.

---

## Visible internal vocabulary

Classified **[V]** visible text, **[A]** accessible name/title, **[C]** code identifier, CSS
class, route hash or collection name (allowed to keep internal names).

The four Founder OS renderers are **close to clean**. Their own leaks:

| Term | Literal | Where | Class |
|---|---|---|---|
| suppressed | view tab `Suppressed` | `founder-os-config.mjs:145` → `partners-home.mjs:122` | [V] |
| suppressed | quick filter `Suppressed` | `partners-home.mjs:78` | [V] |
| suppressed | eligibility chip `Suppressed` | `relationship-service.mjs:46` → `partners-home.mjs:107` | [V] |
| prospect | category chip `Partner prospect` | `relationship-service.mjs:27` → `partners-home.mjs:93` | [V] |
| prospect / engine | `Source` values `Prospect discovery`, `Outreach engine`, `Reactivation engine` | `founder-kpi-registry.mjs:41-44` → `founder-scoreboard-registry.mjs:65` | [V] **only when `FOUNDER_OS_SCOREBOARD` is on** |
| prospect | `Partner and prospect records` | `founder-scoreboard-service.mjs:462` → `founder-scoreboard.mjs:248` | [V] |

Every other violation is on a surface rendered **on the same page** — the legacy Campaigns page
the founder block prepends above, and the `#prospects` / `#upload` destinations it depends on:

| Term | Literal | Where | Class |
|---|---|---|---|
| RCAP | `RCAP outreach, RCAP prospect lists, consumer reactivation…` | `preview-server.mjs:27400` | [V] |
| RCAP | row types `RCAP outreach campaign`, `RCAP prospect list`, `RCAP outreach attempt` | `:29421-29423` → `:27422` | [V] |
| RCAP | `RCAP pipeline`, `RCAP Prospects`, `Upload RCAP prospect list`, `Open RCAP review` | `:27448` | [V] |
| RCAP | Settings → Advanced entry `RCAP Program Review` | `founder-os-config.mjs:55` | [V] |
| engine | `Existing engines` | `:27421`; `:27323` | [V] |
| engine | `The send engine is off, so nothing goes out.` | `campaign-brain.mjs:104` → `:18804` | [V] |
| heartbeat | `Armed — will send during 8am–5pm ET heartbeat windows.` | `reactivation-os.mjs:1003` → `:18619` | [V] |
| heartbeat | `Running — heartbeat is sending eligible reactivation emails.` | `reactivation-os.mjs:1004` → `:18619` | [V] |
| threshold | `Stopped by safety threshold.` | `reactivation-os.mjs:1005` → `:18619` | [V] |
| lane | `Partner outreach lanes, held contacts, and deliverability…` | `:27418` | [V] |
| released wave | `Wave N: released.` / `Preview release` / `Run approved release` | `campaign-command.mjs:262-264`, `:18609`, `:18668` | [V] |
| suppression | `suppression checks` | `prospect-workbench.mjs:109` | [V] |

`projection`, `ledger`, `cron`, `autopilot`, `kill switch` and `live mode` have **no visible
occurrence** in these workspaces — identifiers and comments only.

Note the direct contradiction: the founder block says `Campaign running.` one screen above the
legacy readout saying `Running — heartbeat is sending eligible reactivation emails.`

---

## Cross-cutting findings

1. **The Campaigns lifecycle is entirely non-interactive.** Twenty stage actions render as
   `<span>` (`founder-campaigns.mjs:49`). This is the "controls that appeared functional and were
   not" pattern the brief warns against — here they do not even appear functional.
2. **Campaigns shows two campaign surfaces at once**, with contradictory vocabulary, because the
   founder runtime prepends rather than replaces.
3. **The partner-outreach approval count has no route to its destination.**
4. **`POST /api/outreach/approve` has no client caller**, so half the counted items are unactionable.
5. **`buildFounderCampaignsView().exceptions` has no consumer** — a campaign stopped for safety
   never reaches Today, though the code comment says Today reads it.
6. **Today's Needs-attention items carry no control**, and the id needed to build one is stripped
   in the compact projection.
7. **Scoreboard corrective actions exist only behind a flag that is off in production.**
8. **Dead-end destinations** under a four-item nav: `#meetings`, `#support`, `#social`,
   `#calendar`, `#os-health`, `#queue`, `#upload`, `#prospects`.
9. **Two defects in visible numbers:** the unfiltered `approvalQueue` count in partner outreach,
   and the Scoreboard group set (`Relationships`, `Health`) disagreeing with the charter's
   declared sections (`Pipeline`, `Platform health`, `founder-os-config.mjs:283-290`).

## Totals

- **Actionable items inventoried: 22.**
- **Corrected: 21.** The 22nd — confirming or merging a possible duplicate — is not built.
- **Required prior knowledge before: 17. After: 0.** All seventeen are now reachable by clicking a
  visible label from a workspace in primary navigation.

## Unresolved product capabilities

Three, and none of them is a placement problem. Each would need a business action that does not
exist, so this release states the condition plainly and adds no control that pretends otherwise.

| Gap | What is missing | What this release does instead |
|---|---|---|
| Lifting a contact's suppression | No route, no engine path, no approval rule. Removing suppression is a one-confirmation action in `06_SAFETY_AND_AUTOMATION_CONTRACT.md`, and nothing implements it | Shows the condition as `Not eligible to contact` on the relationship, and adds no lift control anywhere |
| Confirming or merging a possible duplicate | No merge route and no identity-resolution decision record. Merging two people is irreversible without one | Keeps `Possible duplicate: … Nothing has been merged.` visible, with no control |
| Approving a drafted partner email | `POST /api/outreach/approve` is server-authorized and still has **no client caller**. No reviewed workflow can display one of these messages, let alone decide it | Counts them **out** of the approval number and names them in words: "N drafted partner emails are also waiting, and there is no way to review them here yet." Wiring the endpoint would add a sending gate to a read-model correction, which is out of scope |

## The twenty lifecycle actions

Ten became real controls; ten are plain status because no truthful action exists at that stage.

| Lane | Real controls | Plain status |
|---|---|---|
| Social | Plan → `#social?view=weekly`; Review → `#social`; Run → `#social?view=weekly`; Monitor → `#social?view=weekly` (4) | Stop — posting is manual, nothing runs to stop (1) |
| Reactivation | Review, Run and Stop → one button that opens the existing sending controls (3) | Plan and Monitor — readings, not decisions (2) |
| Partner outreach | Plan → `#prospects`; Review → `#prospects` as `Review approvals` (2) | Run, Monitor, Stop — approving on Review is the only decision (3) |
| Press outreach (flag off, which is production) | Run → the drafted campaign, when one exists (1, and 0 with the flag off) | The rest report NOT BUILT, and a not-built lane offers nothing (4–5) |

No `<span>` action survives: the browser test asserts every `[data-campaign-action]` is an `<a>`
with a resolvable hash or a `<button>` with a registered control, and the renderer refuses to draw
a control whose target is not on the page.

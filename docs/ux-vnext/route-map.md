# CCX-001 route map

Source SHA: `8812c2f31328cf1e8e36d36efc22bac55e1f0498`

CCX-102 implementation note: all 75 entries below remain in the renderer registry.
The vNext compatibility resolver canonicalizes the 53 inventoried aliases, supports
exact Post/Campaign/Partner/File hashes, and preserves generic `#item` links. It does not
remove or rename a route. See `docs/ux-vnext/route-compatibility.md` for the implemented
parser, history, recovery, and source-mapping contract.

This inventory describes the legacy hash renderer without changing it. The source of
truth remains the `routeAliases` object, `knownPages` whitelist, primary-navigation
markup, `navSectionForPage(...)`, and render dispatcher in
`scripts/preview-server.mjs`. The side-effect-free mirror is
`scripts/ui/navigation.mjs`, and `scripts/test-vnext-route-inventory.mjs` compares the
mirror directly with those live sources.

## Router contract

- The browser reads the hash, except `/sources/import-social-calendar` defaults to
  `#sources` and an empty root defaults through `#cockpit` to Today.
- `#item/<collection>/<id>` is parsed before aliases and whitelist validation.
- Aliases resolve before the 75-entry whitelist.
- Unknown hashes fall back to `#today`.
- `#overview`, `#cockpit`, `#partner-hub`, and `#metrics` are present in the whitelist
  but are shadowed by aliases before their named renderer can be selected.
- No alias, route, label, or fallback behavior is changed by CCX-001.

## Visibility legend

- **Shell**: authenticated owner, admin, or operator may enter the legacy shell; full
  `/api/state` access is owner/admin, and viewer access is aggregate-report-only.
- **Endpoint-gated**: the page is not separately hidden by the hash router, but its
  reads/writes retain the existing server capability and role checks.
- **Owner live gate**: live social authority remains owner/server-controlled and off
  unless the separately reviewed environment and safety requirements are satisfied.

## Canonical renderer routes

| Canonical route/hash | Current label | Renderer/page function | Current exposure or entry point | Aliases | Role/visibility | Intended vNext destination | Required compatibility behavior | Migration classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#cockpit` | Cockpit | `cockpitHomeHtml` | Today bucket; alias-shadowed | — | Shell | Today | Preserve `#cockpit` as a Today alias; named renderer is currently unreachable by hash | Move into Today |
| `#upload` | Upload List | `uploadListPageHtml` | Campaigns/More links | `#upload-list`, `#list-upload`, `#import`, `#import-list` | Shell; preview/confirm endpoint-gated | Outreach | Retain list-import aliases and suppression/exclusion review | Move into Outreach |
| `#contacts` | Contacts | `contactsPageHtml` | Campaigns bucket and internal links | `#lists`, `#contact`, `#people` | Shell | Outreach | Preserve all contact aliases and source references | Move into Outreach |
| `#prospects` | Prospects | `rcapProspectsPageHtml` | Queue bucket and RCAP links | `#prospect`, `#prospects`, `#rcap-prospects`, `#rcap-pipeline` | Shell; approve/reject endpoint-gated | Outreach | Preserve self-alias and RCAP context; no approval bypass | Move into Outreach |
| `#revenue` | Revenue | `revenuePageHtml` | Campaigns bucket and partner tabs | `#money`, `#payments`, `#stripe` | Shell; read-only source truth | Outreach | Preserve aliases and unavailable/not-connected truth states | Move into Outreach |
| `#meetings` | Meetings | `meetingsPageHtml` | Queue bucket | `#calendar`, `#meeting`, `#meeting-prep` | Shell; Google reads endpoint-gated | Partners | Preserve aliases; calendar/email remain read-only | Move into Partners |
| `#support` | Support | `supportPageHtml` | Queue bucket | `#support-inbox` | Shell; intake endpoint-gated | Inbox | Retain support issue context and safe intake | Move into Inbox |
| `#alerts` | Alerts | `alertsPageHtml` | Queue bucket | `#notifications`, `#alert-center` | Shell; alert mutations endpoint-gated | Inbox | Preserve alert records; sending remains separately gated | Move into Inbox |
| `#pages` | Pages | `pagesPageHtml` | Review Desk bucket and Partner links | `#partner-pages-review`, `#page-review`, `#co-branded-pages` | Shell; review writes endpoint-gated | Partners | Keep page/partner context until Partner parity exists | Move into Partners |
| `#today` | Today | `commandCenterOverviewHtml` | Primary navigation: Today | `#overview`, `#cockpit` | Shell | Today | Remain a primary route and preserve both aliases | Keep as primary |
| `#overview` | Overview | `commandCenterOverviewHtml` | Today bucket; alias-shadowed | — | Shell | Today | `#overview` must continue resolving to `#today` | Move into Today |
| `#daily-run` | Daily Run | `todaySinglePaneHtml` | Today tools/internal links | — | Shell; daily-run transitions endpoint-gated | Today | Retain current session state and safe internal transitions | Move into Today |
| `#focus` | Focus | `focusPageHtml` | Today secondary tab | — | Shell | Today | Preserve direct bookmark until Today parity | Move into Today |
| `#decisions` | Decisions | `decisionsPageHtml` | Primary navigation label: Queue | — | Shell; decision/transition endpoints gated | Inbox | Preserve decision IDs, approval separation, and audit behavior | Move into Inbox |
| `#lee` | Le-E | `leePageHtml` | Floating Le-E control and direct hash | `#le-e` | Shell; chat/actions endpoint-gated | Advanced/internal only | Keep Le-E globally reachable; do not make it a primary destination | Advanced/internal only |
| `#growth` | Growth | `growthWorkspaceHtml` | More and Growth tabs | `#command`, `#marketing`, `#social`, `#social-media`, `#content-calendar`, `#posts` | Shell; domain actions endpoint-gated | Social | Preserve aliases until Social, Outreach, Inbox, and Partner overlap has parity | Move into Social |
| `#partner-hub` | Partner Hub | `sectionLandingPageHtml:partner-hub` | Partner surface; alias-shadowed | — | Shell | Partners | `#partner-hub` must continue resolving to `#partners` | Move into Partners |
| `#production` | Production | `productionWorkspaceHtml` | Review Desk bucket and Production tabs | — | Shell; review actions endpoint-gated | Social | Preserve production/readiness detail until Social parity | Move into Social |
| `#production-linkedin-queue` | LinkedIn Approval Queue | `linkedinApprovalQueueHtml` | Review Desk links | `#linkedin` | Shell; approval gated; owner live gate | Social | Preserve post/channel context and approval/publish separation | Move into Social |
| `#production-twitter-x-queue` | Twitter / X Approval Queue | `twitterXApprovalQueueHtml` | Review Desk links | `#twitter-x` | Shell; approval gated; owner live gate | Social | Preserve post/channel context and approval/publish separation | Move into Social |
| `#proof` | Proof | `proofWorkspaceHtml` | Reports bucket and Proof tabs | `#metrics`, `#kpis` | Shell | Files | Preserve proof/report/evidence references while Files projection is built | Move into Files |
| `#more` | More | `moreWorkspaceHtml` | Primary navigation: More | — | Shell | Deprecate after parity | Retain until every card has a tested final destination | Deprecate after parity |
| `#growth-inbox` | Growth Inbox | `growthInboxPageHtml` | Queue bucket and Growth tabs | `#replies`, `#inbox-replies` | Shell; growth mutations owner/admin-gated | Inbox | Preserve signal, reply, and source context | Move into Inbox |
| `#capture-inbox` | Capture Inbox | `captureInboxPageHtml` | Queue bucket and Today links | — | Shell; routing capability endpoint-gated | Inbox | Preserve capture IDs and explicit routing; capture never sends | Move into Inbox |
| `#tasks` | Tasks | `tasksPageHtml` | Queue bucket and More | — | Shell; task writes endpoint-gated | Inbox | Preserve task IDs, status, source references, and audit behavior | Move into Inbox |
| `#tasks-today` | Tasks Today | `tasksPageHtml` | Queue bucket/task subview | — | Shell; task writes endpoint-gated | Today | Preserve filtered view through Today/task parity | Move into Today |
| `#tasks-blocked` | Blocked Tasks | `tasksPageHtml` | Queue bucket and More | — | Shell; task writes endpoint-gated | Inbox | Preserve blocked filter and exact task links | Move into Inbox |
| `#tasks-waiting` | Waiting Tasks | `tasksPageHtml` | Queue bucket and More | — | Shell; task writes endpoint-gated | Inbox | Preserve waiting filter and exact task links | Move into Inbox |
| `#tasks-this-week` | This Week Tasks | `tasksPageHtml` | Queue bucket and More | — | Shell; task writes endpoint-gated | Today | Preserve weekly filter until Today parity | Move into Today |
| `#production-activation-rcap` | RCAP Program Review | `rcapReviewWorkspaceHtml` | More/Partner links | `#rcap` | Shell; activation/review/final approval capability-gated | Partners | Preserve RCAP state, approvals, handoff context, and alias | Move into Partners |
| `#operating-memory` | Operating Memory | `operatingMemoryPageHtml` | More and Today links | — | Shell; save endpoint-gated | Today | Preserve dated memory records and source links | Move into Today |
| `#morning-brief` | Morning Brief | `morningBriefPageHtml` | Today secondary tab | — | Shell; save endpoint-gated | Today | Preserve date-specific brief behavior | Move into Today |
| `#evening-reflection` | Evening Reflection | `eveningReflectionPageHtml` | Today links | — | Shell; save endpoint-gated | Today | Preserve date-specific reflection behavior | Move into Today |
| `#daily-closeout` | Daily Closeout | `dailyCloseoutPageHtml` | Today secondary tab | — | Shell; closeout writes endpoint-gated | Today | Preserve tomorrow-plan and closeout state | Move into Today |
| `#os-health` | App Status | `osHealthPageHtml` | More/Settings tabs | `#app-status`, `#health`, `#system` | Shell; diagnostics/refresh endpoint-gated | Settings | Retain all health aliases and fail-closed diagnostic rules | Move into Settings |
| `#smoke-test` | Self-Check | `smokeTestPageHtml` | More/internal links | — | Shell; run capability owner/admin | Advanced/internal only | Keep available to authorized operators | Advanced/internal only |
| `#evidence-room` | Evidence Room | `evidenceRoomPageHtml` | Reports bucket and Proof tabs | — | Shell; summary generation owner/admin | Files | Preserve evidence source links and generation metadata | Move into Files |
| `#handoff-contract` | Handoff Contract | `handoffContractPageHtml` | More/internal links | `#handoff-notes` | Shell; generation capabilities owner/admin | Advanced/internal only | Preserve handoff alias and review/approval boundary | Advanced/internal only |
| `#operator-manual` | Guide | `operatorManualPageHtml` | More | `#guide`, `#course-manual` | Shell | Settings | Retain guide aliases until contextual help parity | Move into Settings |
| `#roles` | Team Roles | `rolesPageHtml` | More/Settings | — | Shell; assignment mutation owner-only | Settings | Preserve role IDs and server-side authorization | Move into Settings |
| `#data-integrity` | Data Integrity | `dataIntegrityPageHtml` | More/Settings | `#data-check` | Shell; view/refresh owner/admin | Settings | Preserve alias and diagnostic truth | Move into Settings |
| `#operator-search` | Operator Search | `operatorSearchPageHtml` | More | — | Shell; action endpoint-gated | Deprecate after parity | Retain until global Search has object parity and safe links | Deprecate after parity |
| `#conversation-notes` | Conversation Notes | `conversationNotesPageHtml` | More | — | Shell; note writes endpoint-gated | Advanced/internal only | Preserve note/source context and permissions | Advanced/internal only |
| `#partner-programs` | Partner Programs | `partnerProgramsPageHtml` | Partner tabs/More | — | Shell; program writes endpoint-gated | Partners | Preserve program and Partner relationships | Move into Partners |
| `#partner-pages` | Partner Pages | `partnerPagesPageHtml` | Partner links | — | Shell; writes endpoint-gated | Partners | Preserve artifact and Partner context | Move into Partners |
| `#partner-dashboards` | Partner Dashboards | `partnerDashboardsPageHtml` | Partner links | — | Shell; writes endpoint-gated | Partners | Preserve artifact and Partner context | Move into Partners |
| `#partner-reports` | Partner Reports | `partnerReportsPageHtml` | Partner links | — | Shell; generation endpoint-gated | Partners | Keep exact Partner context; generated artifact also appears in Files | Move into Partners |
| `#partner-proposals` | Partner Proposals | `partnerProposalsPageHtml` | Partner links | — | Shell; generation endpoint-gated | Partners | Keep exact Partner context; generated artifact also appears in Files | Move into Partners |
| `#milestones` | Milestones | `milestonesPageHtml` | More/internal links | — | Shell; writes endpoint-gated | Today | Preserve milestone IDs and due/owner state | Move into Today |
| `#partners` | Partners | `partnersPageHtml` | Partner surface/More | `#partner`, `#partner-hub` | Shell; writes endpoint-gated | Partners | Remain the canonical Partner route and preserve aliases | Keep as primary |
| `#campaigns` | Campaigns | `campaignsControlPageHtml` | Primary navigation: Campaigns | `#campaign`, `#campaign-control`, `#campaigns-control` | Shell; campaign writes/launches separately gated | Outreach | Preserve campaign IDs, audience/suppression, approval, and aliases | Move into Outreach |
| `#funnel` | Funnel | `funnelPageHtml` | Campaigns bucket/Growth tabs | — | Shell; writes endpoint-gated | Outreach | Preserve snapshot truth and source timestamps | Move into Outreach |
| `#content-bank` | Content Bank | `contentBankPageHtml` | Review Desk bucket/Growth tabs | — | Shell; draft management owner/admin | Social | Preserve idea-to-post source references | Move into Social |
| `#queue` | Review Desk | inline `queueReviewShell` | Primary navigation: Review Desk | — | Shell; approval/draft actions gated; owner live gate | Social | Become Social Needs review; approval must not become publishing | Move into Social |
| `#sources` | Sources | inline `sourcesSection` | Campaigns/Growth tab and import path | — | Shell; source actions endpoint-gated | Social | Preserve `/sources/import-social-calendar` and source-to-post context | Move into Social |
| `#assets` | Assets | `assetLibraryPageHtml` | Review Desk/Production tabs | — | Shell; private assets permission-gated | Files | Preserve canonical asset references; expose them in Social without copying | Move into Files |
| `#posted` | Posted | inline `postedSection` | Review Desk/Production tabs | — | Shell; manual status/performance writes gated | Social | Preserve post IDs, publication truth, and unavailable analytics | Move into Social |
| `#autonomy` | Autonomy | `autonomyPageHtml` | Review Desk/Production tabs | — | Shell; autonomy management owner/admin | Settings | Preserve approval-before-apply and server authority | Move into Settings |
| `#automation` | Automation Inbox | `automationInboxPageHtml` | More/Settings Connectors tab | — | Shell; suggestions/actions endpoint-gated | Inbox | Move suggestions to Inbox; keep connector configuration in Settings | Move into Inbox |
| `#pilots` | Pilots | `pilotsPageHtml` | Partner tabs/More | — | Shell; writes endpoint-gated | Partners | Preserve Partner/program relationships | Move into Partners |
| `#compliance` | Compliance | `compliancePageHtml` | More/internal links | — | Shell; compliance actions endpoint-gated | Files | Preserve compliance records as File/Evidence projections | Move into Files |
| `#soc2` | SOC 2 Readiness | `soc2DashboardPageHtml` | Reports bucket/Proof tabs | — | Shell; reads endpoint-gated | Files | Preserve truthful readiness and evidence sources | Move into Files |
| `#soc2-access` | Access Reviews | `soc2AccessReviewsPageHtml` | Reports bucket | — | Shell; sensitive writes endpoint-gated | Settings | Preserve access-review records and authorization | Move into Settings |
| `#soc2-audit` | Audit Logs | `soc2AuditLogsPageHtml` | Reports bucket | — | Shell; audit visibility permission-gated | Advanced/internal only | Keep immutable audit context and authorized visibility | Advanced/internal only |
| `#soc2-changes` | Change Management | `soc2ChangesPageHtml` | Reports bucket | — | Shell; writes endpoint-gated | Settings | Preserve change/rollback/approval metadata | Move into Settings |
| `#soc2-vendors` | Vendor Inventory | `soc2VendorsPageHtml` | Reports bucket | — | Shell; writes endpoint-gated | Settings | Preserve vendor risk and review metadata | Move into Settings |
| `#soc2-incidents` | Incident Register | `soc2IncidentsPageHtml` | Reports bucket | — | Shell; writes endpoint-gated | Settings | Preserve incident confidentiality and audit trail | Move into Settings |
| `#soc2-evidence` | Evidence Center | `soc2EvidencePageHtml` | Reports bucket | — | Shell; writes endpoint-gated | Files | Preserve evidence source, period, quality, and renewal metadata | Move into Files |
| `#soc2-policies` | Policies | `soc2PoliciesPageHtml` | Reports bucket | — | Shell; writes endpoint-gated | Files | Preserve policy version, approval, and review dates | Move into Files |
| `#reports` | Reports | `reportsPageHtml` | Primary navigation: Reports | — | Shell; file generation/download endpoint-gated | Files | Preserve report source, generation date, and file access | Move into Files |
| `#dataroom` | Data Room | `dataRoomPageHtml` | Reports bucket/Proof tabs | — | Shell; records/writes endpoint-gated | Files | Become Investor Room while preserving item IDs and readiness truth | Move into Files |
| `#metrics` | Metrics | `metricsDashboardHtml` | Reports bucket; alias-shadowed | — | Shell | Files | `#metrics` currently resolves to `#proof`; preserve until Files metrics parity | Move into Files |
| `#settings` | Settings | inline `plainSettingsPageHtml` | More/Settings tabs and OAuth returns | `#privacy` | Shell; admin/diagnostic actions gated | Settings | Preserve alias, OAuth result messages, and server-only live gates | Move into Settings |
| `#safe-mode` | Safe Mode | `renderSafeBootShell` | More/Settings and recovery links | `#recovery` | Authenticated recovery shell; no full state required | Advanced/internal only | Preserve recovery alias and no-white-screen behavior | Advanced/internal only |
| `#item` | Artifact Viewer | `artifactViewerHtml` | Queue/Today exact-object controls | dynamic `#item/<collection>/<id>` | Shell; underlying collection permissions apply | Deprecate after parity | Preserve sanitized collection and encoded item ID until typed detail routes have parity | Deprecate after parity |

## Totals

| Classification | Routes |
| --- | ---: |
| Keep as primary | 2 |
| Move into Today | 11 |
| Move into Social | 8 |
| Move into Outreach | 6 |
| Move into Partners | 10 |
| Move into Files | 10 |
| Move into Inbox | 9 |
| Move into Settings | 10 |
| Advanced/internal only | 6 |
| Deprecate after parity | 3 |
| **Total** | **75** |

The final destination totals differ from classification totals only because the two
`Keep as primary` entries are Today and Partners. No future route is created here.

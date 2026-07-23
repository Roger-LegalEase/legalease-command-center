# Route inventory — evidence at current HEAD

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

- **Collected at:** `a3793c3156bc2c866dbd1f65e0ec420ae2352554` (origin/main tip), 2026-07-23.
- **Source of truth:** `scripts/preview-server.mjs` (`knownPages` whitelist, `routeAliases` object, primary-navigation markup) mirrored side-effect-free by `scripts/ui/navigation.mjs` (`routeRegistry`, `primaryNavigationInventory`), verified by `scripts/test-vnext-route-inventory.mjs`.
- **Verification run:** `node scripts/test-vnext-route-inventory.mjs` at this HEAD printed:
  `vNext route inventory verified: 75 canonical routes, 53 aliases, 6 primary navigation items.`

## Counts vs. the historical inspection (e620bde)

| Measure | Historical (e620bde) | Current HEAD (a3793c3) | Difference |
|---|---|---|---|
| Canonical routes | 75 | 75 | None |
| Aliases | 53 | 53 | None |
| Primary navigation items | 6 | 6 | None |

No routes were added, removed, or renamed between e620bde and a3793c3. The commits in
between (PRs #109–#111) changed Founder Mode storage reads and auth/session storage, not
the route registry.

## Current primary navigation (6 items)

| Route | Label | Existing vNext destination tag |
|---|---|---|
| `#today` | Today | Today |
| `#decisions` | Queue | Inbox |
| `#more` | More | Deprecate after parity |
| `#campaigns` | Campaigns | Outreach |
| `#queue` | Review Desk | Social |
| `#reports` | Reports | Files |

Note: the registry's `vnextDestination` field reflects the earlier "vNext" IA effort
(13 destinations: Today, Inbox, Partners, Social, Outreach, Scoreboard, Support, Calendar,
Company Health, Files, Settings, Advanced/internal only, Deprecate after parity). That
scheme is historical implementation context; the Founder OS charter collapses it to four
primary workspaces. The mapping from every route to the charter model is in
`../02_TARGET_PRODUCT_AND_IA.md`.

## 75 canonical routes (registry order)

Format: `route` — label — existing registry classification.

1. `cockpit` — Cockpit — Move into Today
2. `upload` — Upload List — Move into Outreach
3. `contacts` — Contacts — Move into Outreach
4. `prospects` — Prospects — Move into Outreach
5. `revenue` — Revenue — Move into Outreach
6. `meetings` — Meetings — Move into Partners
7. `support` — Support — Move into Inbox
8. `alerts` — Alerts — Move into Inbox
9. `pages` — Pages — Move into Partners
10. `today` — Today — Keep as primary
11. `overview` — Overview — Move into Today
12. `daily-run` — Daily Run — Move into Today
13. `focus` — Focus — Move into Today
14. `decisions` — Decisions — Move into Inbox
15. `lee` — Le-E — Advanced/internal only
16. `growth` — Growth — Move into Social
17. `partner-hub` — Partner Hub — Move into Partners
18. `production` — Production — Move into Social
19. `production-linkedin-queue` — LinkedIn Approval Queue — Move into Social
20. `production-twitter-x-queue` — Twitter / X Approval Queue — Move into Social
21. `proof` — Proof — Move into Files
22. `more` — More — Deprecate after parity
23. `growth-inbox` — Growth Inbox — Move into Inbox
24. `capture-inbox` — Capture Inbox — Move into Inbox
25. `tasks` — Tasks — Move into Inbox
26. `tasks-today` — Tasks Today — Move into Today
27. `tasks-blocked` — Blocked Tasks — Move into Inbox
28. `tasks-waiting` — Waiting Tasks — Move into Inbox
29. `tasks-this-week` — This Week Tasks — Move into Today
30. `production-activation-rcap` — RCAP Program Review — Move into Partners
31. `operating-memory` — Operating Memory — Move into Today
32. `morning-brief` — Morning Brief — Move into Today
33. `evening-reflection` — Evening Reflection — Move into Today
34. `daily-closeout` — Daily Closeout — Move into Today
35. `os-health` — App Status — Move into Settings
36. `smoke-test` — Self-Check — Advanced/internal only
37. `evidence-room` — Evidence Room — Move into Files
38. `handoff-contract` — Handoff Contract — Advanced/internal only
39. `operator-manual` — Guide — Move into Settings
40. `roles` — Team Roles — Move into Settings
41. `data-integrity` — Data Integrity — Move into Settings
42. `operator-search` — Operator Search — Deprecate after parity
43. `conversation-notes` — Conversation Notes — Advanced/internal only
44. `partner-programs` — Partner Programs — Move into Partners
45. `partner-pages` — Partner Pages — Move into Partners
46. `partner-dashboards` — Partner Dashboards — Move into Partners
47. `partner-reports` — Partner Reports — Move into Partners
48. `partner-proposals` — Partner Proposals — Move into Partners
49. `milestones` — Milestones — Move into Today
50. `partners` — Partners — Keep as primary
51. `campaigns` — Campaigns — Move into Outreach
52. `funnel` — Funnel — Move into Outreach
53. `content-bank` — Content Bank — Move into Social
54. `queue` — Review Desk — Move into Social
55. `sources` — Sources — Move into Social
56. `assets` — Assets — Move into Files
57. `posted` — Posted — Move into Social
58. `autonomy` — Autonomy — Move into Settings
59. `automation` — Automation Inbox — Move into Inbox
60. `pilots` — Pilots — Move into Partners
61. `compliance` — Compliance — Move into Files
62. `soc2` — SOC 2 Readiness — Move into Files
63. `soc2-access` — Access Reviews — Move into Settings
64. `soc2-audit` — Audit Logs — Advanced/internal only
65. `soc2-changes` — Change Management — Move into Settings
66. `soc2-vendors` — Vendor Inventory — Move into Settings
67. `soc2-incidents` — Incident Register — Move into Settings
68. `soc2-evidence` — Evidence Center — Move into Files
69. `soc2-policies` — Policies — Move into Files
70. `reports` — Reports — Move into Files
71. `dataroom` — Data Room — Move into Files
72. `metrics` — Metrics — Move into Files
73. `settings` — Settings — Move into Settings
74. `safe-mode` — Safe Mode — Advanced/internal only
75. `item` — Artifact Viewer — Deprecate after parity

## 53 aliases (alias → canonical)

`upload-list`→upload, `list-upload`→upload, `import`→upload, `import-list`→upload,
`lists`→contacts, `contact`→contacts, `people`→contacts,
`prospect`→prospects, `prospects`→prospects, `rcap-prospects`→prospects, `rcap-pipeline`→prospects,
`money`→revenue, `payments`→revenue, `stripe`→revenue,
`calendar`→meetings, `meeting`→meetings, `meeting-prep`→meetings,
`support-inbox`→support,
`notifications`→alerts, `alert-center`→alerts,
`partner-pages-review`→pages, `page-review`→pages, `co-branded-pages`→pages,
`overview`→today, `cockpit`→today,
`le-e`→lee,
`command`→growth, `marketing`→growth, `social`→growth, `social-media`→growth, `content-calendar`→growth, `posts`→growth,
`linkedin`→production-linkedin-queue,
`twitter-x`→production-twitter-x-queue,
`metrics`→proof, `kpis`→proof,
`replies`→growth-inbox, `inbox-replies`→growth-inbox,
`rcap`→production-activation-rcap,
`app-status`→os-health, `health`→os-health, `system`→os-health,
`handoff-notes`→handoff-contract,
`guide`→operator-manual, `course-manual`→operator-manual,
`data-check`→data-integrity,
`partner`→partners, `partner-hub`→partners,
`campaign`→campaigns, `campaign-control`→campaigns, `campaigns-control`→campaigns,
`privacy`→settings,
`recovery`→safe-mode

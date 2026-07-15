# CCX-002 founder-language registry

Source main SHA: `24b8d94bc56787d2b11f04b1201796403117d9c6`

This document and `scripts/ui/labels.mjs` define the plain-English vocabulary for
Command Center vNext. They are a presentation contract, not a runtime migration.
CCX-002 does not change current labels, routes, navigation, rendering, workflows,
authorization, safety controls, sending, publishing, storage, or business behavior.

## Product sentence

> The Command Center helps LegalEase plan today, publish social content, run outreach, manage partners, and organize company files.

Use this sentence when the product needs a one-sentence explanation. Do not explain
the product through engine names, queue taxonomies, safety architecture, or internal
event models.

## Five primary destinations

| Destination | Plain-English purpose |
| --- | --- |
| **Today** | Decide what deserves attention now and what comes next. |
| **Social** | Create, review, schedule, publish, and measure social content. |
| **Outreach** | Create and run partner or customer email campaigns. |
| **Partners** | Manage relationships, opportunities, programs, and next actions. |
| **Files** | Organize brand, partner, operating, compliance, and investor material. |

These five labels are exact. Do not add a sixth catch-all destination.

## Global utilities

| Utility | Use |
| --- | --- |
| **Inbox** | Human decisions, follow-ups, and updates across the product. |
| **Search** | Find an exact Post, Campaign, Partner, File, task, or report. |
| **Create** | Start a new object or quick note from one predictable menu. |
| **Le-E** | Ask for contextual assistance without granting action authority. |
| **Settings** | Connections, roles, automations, and advanced controls. |
| **Help** | Contextual product guidance. |
| **Profile** | The current user's identity and session controls. |

## Four core objects

| Object | Meaning |
| --- | --- |
| **Post** | One social-content record, including its variants, schedule, readiness, and results. |
| **Campaign** | One outreach effort, including its audience, messages, schedule, approvals, and results. |
| **Partner** | One relationship record, including its stage, activity, programs, outreach, and files. |
| **File** | One document-like record or artifact with source, status, permissions, and related objects. |

Today and Inbox are computed views over these objects and other operational records.
Displaying one object in several views never creates a second source of truth.

## Approved statuses

| Object or view | Approved statuses |
| --- | --- |
| Post | Idea; Draft; Needs review; Scheduled; Published |
| Campaign | Draft; Scheduled; Active; Paused; Completed |
| Partner | New; Qualified; In conversation; Proposal; Active; Closed |
| File | Draft; Current; Needs update; Archived |
| Inbox | Needs me; Waiting; Updates |

Internal states may remain more detailed. A later view adapter must map them into
these labels without changing the underlying engine state.

## Readiness and safety language

Use these exact phrases where their conditions are true:

- Ready to schedule
- Ready to launch
- Fixes needed
- Sending is off
- Publishing is off
- Delivery tracking is working
- Delivery tracking needs attention
- Temporarily excluded
- Will not receive this campaign
- Sending paused
- Needs approval
- Approved
- Completed

Readiness copy describes the current truth. It must never imply that approval sends,
that scheduling publishes, or that an unavailable source reports zero activity.

## Approved action verbs

| Intent | Approved verbs | Usage rule |
| --- | --- | --- |
| Create or change | Create, Add, Save, Edit, Upload | Name the object when the surrounding context does not make it unmistakable. |
| Inspect or navigate | View, Open, Download | Prefer View for information. Use Open only with an exact object or destination. |
| External workflow | Schedule, Publish, Launch, Pause, Resume, Share | State the externally meaningful action exactly; never use a generic substitute. |
| Human decision | Approve, Request changes, Complete, Snooze | Make clear whether the action decides, changes, or postpones work. |
| Record lifecycle | Archive, Restore, Delete | State the affected object and consequence. |
| Connection or recovery | Connect, Retry | Name the connection or failed action. |

Buttons normally use a verb plus an object: **Create post**, **Save campaign**,
**Approve changes**, **Connect LinkedIn**, or **Retry upload**.

## Legacy terminology replacements

Every current term below has an explicit disposition. A replacement may be
contextual because a legacy catch-all often spans more than one vNext destination.

| Legacy term | vNext replacement | Disposition and boundary |
| --- | --- | --- |
| `Work` | Use the specific destination or object name | Replace as a destination or section label. Ordinary prose may still use the word work. |
| `Queue` | Inbox | Use Needs me for the actionable Inbox group. |
| `Review Desk` | Social / Needs review | Review is a state inside Social, not a destination. |
| `Campaigns` | Outreach | Campaign remains the singular object name. |
| `Growth Inbox` | Capture | Use Inbox for follow-up and Capture for incoming ideas or signals. |
| `Content Bank` | Ideas | Ideas is a view inside Social. |
| `Production` | Social Library | Use readiness labels for work that still needs attention. |
| `Proof` | Investor Room or Files | Choose Investor Room for investor material and Files for broader artifacts. |
| `Evidence Room` | Files or Compliance collection | Preserve evidence meaning inside a clearly named Files collection. |
| `Data Room` | Investor Room | Investor Room remains a collection inside Files. |
| `Reports` | Results or generated report files | Results shows outcomes; generated artifacts live in Files. |
| `Partner Programs` | Programs inside Partner | Move the capability into its related Partner record. |
| `Partner Proposals` | Proposal files inside Partner | Also surface the same artifact in Files without duplication. |
| `Partner Reports` | Reports inside Partner | Also surface generated output in Files. |
| `Autonomy` | Automations | Explain what runs and what still needs approval; retain exact detail only in Advanced. |
| `Live gates` | Connection and readiness checks | Exact gate names are allowed only in Advanced diagnostics or Settings. |
| `Wave` | Batch | Show batch detail under Advanced only when operationally useful. |
| `Telemetry` | Delivery tracking | Exact telemetry fields are limited to authorized diagnostics. |
| `More` | No replacement | Remove the catch-all after every item has a real destination. |
| `Triage` | Review or Sort | Choose the verb that describes the actual user decision. |
| `Operator` | User or owner-specific language | Use Owner, Admin, or a person's name when role precision matters. |
| `OS Health` | App Status | Keep exact subsystem names inside Advanced diagnostics. |
| `Data Integrity` | Data Check | Keep technical integrity detail behind Advanced. |
| `Smoke Test` | Self-Check | Individual test identifiers may remain in diagnostic results. |
| `Operating Memory` | Notes & Decisions | Prefer the exact record type when known. |
| `Growth` | Use Social, Outreach, Partners, or Inbox | Remove the cross-product catch-all. |
| `RCAP` | Partner program | The acronym is allowed only in advanced Partner-program detail. |
| `LegalEase OS` | Command Center | Command Center is the product name. |
| `System Check` | Self-Check | The action should be Start self-check. |
| `Safe Mode` | Recovery Mode | The technical name may remain inside Advanced recovery diagnostics. |

## Terms forbidden in normal UI

All legacy terms in the table above are forbidden as normal navigation labels,
page headings, tabs, or generic action labels. The contract treats **Work** specially:
it is forbidden as an information-architecture label but remains ordinary English in
sentences such as “Your work is saved.”

Normal UI also must not expose raw machine identifiers, route names, rule IDs,
environment keys, provider payloads, or snake-case state values. Compatibility hashes
and internal identifiers remain stable but are not presentation copy.

## Terms allowed only in Advanced or Settings

Technical precision is valuable when diagnosing a real problem. It belongs behind an
explicit Advanced, Settings, diagnostics, or audit boundary and must be preceded by a
plain-language summary.

| Technical term | Normal summary | Allowed context |
| --- | --- | --- |
| API | Connection or service | Advanced diagnostics; Settings |
| OAuth | Connection | Advanced diagnostics; Settings |
| Webhook | Delivery update | Advanced diagnostics; Settings |
| Telemetry | Delivery tracking | Advanced diagnostics |
| Live gates | Connection and readiness checks | Advanced diagnostics; Settings |
| Suppression | Will not receive this campaign | Advanced delivery details; Settings |
| Idempotency key | Duplicate protection | Advanced diagnostics; Audit history |
| CSRF | Request protection | Advanced diagnostics |
| Environment variable | Server setting | Advanced diagnostics; Settings |
| Schema | Data structure | Advanced diagnostics |
| Storage backend | Storage connection | Advanced diagnostics; Settings |
| Provider response | Connection response | Advanced diagnostics; Audit history |
| Audit event | Activity record | Advanced diagnostics; Audit history |
| Event ID | Activity reference | Advanced diagnostics; Audit history |
| Operator | User or owner | Advanced diagnostics; Audit history |
| RCAP | Partner program | Advanced Partner-program details |

Approved Advanced and Settings headings include **App Status**, **Data Check**,
**Self-Check**, **Recovery Mode**, **Automations**, **Delivery details**,
**Connection details**, **Audit history**, and **System diagnostics**.

## Current terminology drift

The deterministic audit in `scripts/test-vnext-founder-language.mjs` inspects four
normal founder-facing source regions: the persistent shell, section-landing labels
and actions, secondary tabs, and the current Review Desk heading. It reports **23
unique pre-existing terms**. Repeated appearances count once and their locations are
grouped.

This is migration work for later packets, not a CCX-002 regression. The test fails if
the detected set changes without an intentional registry and documentation update.

| Current term | Detected normal-UI locations | Future replacement |
| --- | --- | --- |
| `Queue` | Shell; Section landing pages; Secondary tabs | Inbox |
| `Review Desk` | Shell; Review page | Social / Needs review |
| `Campaigns` | Shell; Section landing pages; Secondary tabs | Outreach |
| `Growth Inbox` | Section landing pages | Capture |
| `Content Bank` | Section landing pages; Secondary tabs | Ideas |
| `Production` | Section landing pages | Social Library |
| `Proof` | Section landing pages; Secondary tabs | Investor Room or Files |
| `Evidence Room` | Section landing pages | Files or Compliance collection |
| `Data Room` | Section landing pages; Secondary tabs | Investor Room |
| `Reports` | Shell; Section landing pages | Results or generated report files |
| `Partner Programs` | Section landing pages | Programs inside Partner |
| `Partner Proposals` | Section landing pages | Proposal files inside Partner |
| `Partner Reports` | Section landing pages | Reports inside Partner |
| `Autonomy` | Section landing pages; Secondary tabs | Automations |
| `More` | Shell; Section landing pages | No replacement |
| `Operator` | Shell | User or owner-specific language |
| `OS Health` | Secondary tabs | App Status |
| `Data Integrity` | Secondary tabs | Data Check |
| `Growth` | Section landing pages; Secondary tabs | Social, Outreach, Partners, or Inbox |
| `RCAP` | Section landing pages; Secondary tabs | Partner program |
| `LegalEase OS` | Shell | Command Center |
| `System Check` | Shell | Self-Check |
| `Safe Mode` | Secondary tabs | Recovery Mode |

## Writing rules

### Buttons

- Use a specific verb and object: **Create campaign**, **Schedule post**, or
  **Open partner**.
- Use **Open** only when the exact object or destination is already named. Replace a
  bare **Open** with **View details**, **Edit post**, or another truthful action.
- Avoid **Manage**, **Process**, and **Run** when the actual operation is Save, Review,
  Sort, Start, Approve, Launch, or Retry.
- A button must not imply an external action that the endpoint does not perform.
- Destructive and external actions must identify the affected object.

### Empty states

- Explain what the area is for.
- State the current truth without inventing records or connection status.
- Offer one useful next action.
- Do not stop at “No data,” “Nothing here,” or “Coming soon.”

### Errors

- Say what failed.
- Say what did not change, especially for sending, publishing, sharing, or storage.
- Give one safe next step such as Retry, Reconnect, Edit, or View details.
- Keep stack traces, rule IDs, provider payloads, and technical references in
  authorized Advanced detail.

### Readiness messages

- Lead with the state: **Ready to schedule** or **Fixes needed**.
- Explain each blocker in language the user can act on.
- Distinguish content fixes, missing connections, missing schedule, and approval.
- Never translate an unknown state into Ready, zero, sent, or published.

### Confirmations

- Name the completed action and affected object.
- Link to the created or changed object when possible.
- Say **Approved** only for approval and **Published** only after confirmed
  publication. Approval, scheduling, and execution remain distinct.

### Destructive actions

- Use the exact destructive verb: Delete, Remove access, Archive, or Disconnect.
- Preview the consequence and what can or cannot be restored.
- Require confirmation appropriate to the risk.
- Never use LegalEase orange as a substitute for semantic danger styling.

## Bad copy and approved replacements

| Avoid | Use instead |
| --- | --- |
| Open | Open partner; View delivery details; Edit post |
| Manage | Edit campaign; Add partner; View settings |
| Process queue | Review Inbox items |
| Run | Start self-check; Launch campaign; Retry upload |
| Review Desk | Social / Needs review |
| More | The real destination: Today, Social, Outreach, Partners, Files, Inbox, or Settings |
| Queue | Inbox; Needs me |
| Triage item | Review item; Sort capture |
| Telemetry unavailable | Delivery tracking needs attention |
| Live gate disabled | Publishing is off; Sending is off |
| Suppressed | Will not receive this campaign |
| Held | Temporarily excluded |
| Operation succeeded | Campaign saved; Post scheduled; File uploaded |
| Something went wrong | Campaign was not launched. Review the audience and try again. |

Vague labels are acceptable only when their object and effect are already
unmistakable. When a clearer action exists, use it.

## Contract boundary and rollback

- `scripts/ui/labels.mjs` is side-effect-free and has no runtime imports.
- The module is not imported by `preview-server.mjs` in CCX-002.
- Existing hashes, internal identifiers, engine state, and safety terminology in raw
  diagnostics remain unchanged.
- Rollback is a simple revert of the registry, documentation, test, and package-script
  entry; no state or migration rollback is required.

CCX-003 may use this contract when it introduces the feature-flag and shell boundary.

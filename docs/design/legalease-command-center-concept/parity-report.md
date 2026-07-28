# Concept parity — what was built, what was omitted, and why

Release: the visual layer over the functions #152 shipped. Presentation only. No gate, endpoint,
count rule or approval path changed.

Implementation screenshots: `implementation-evidence/` at 1600×1000, 1024×900 and 390×844.
Concept screens: `screens/`.

## Omitted rather than faked

Every element below appears in the concept and is NOT drawn, because no read model supplies it.
Each one is an omission, never a zero and never a placeholder.

| Screen | Element | Why it is not drawn |
| --- | --- | --- |
| Sidebar | Per-workspace counts on the nav rows (7, 12, 3) | The shell is rendered before any workspace payload is read. It has no count to show. |
| Sidebar | The product switcher ("LegalEase · All products") | One product. There is nothing to switch between. |
| Sidebar / brand | The orange "L" monogram tile | Forbidden by the approved visual contract (`scripts/ui/brand-contract.mjs`: "Do not … fabricate a monogram"). The approved wordmark is used instead. This is the one deliberate departure from the screen. |
| Top bar | The notifications bell | No notification read model exists. |
| Today | The name in the greeting ("Good evening, Roger.") | The session proves a role, not a person, and nothing stores the operator's own name. The greeting is time-aware and addresses nobody. |
| Today | "Three can be closed in under ten minutes" | Nothing records how long a piece of work takes. |
| Today | The clock chip (6:18 PM ET) | Not drawn from a stored value; the date line already carries the day. |
| Today / Now | The person block beside the primary action | The Today payload carries an item, not a counterparty record. |
| Campaigns | The headline stat on each type card (9 / 74 / 6 / 42) | No lane reports a single figure that would fill it. |
| Campaigns | "Campaign calendar" and "New campaign" header actions | No campaign-calendar route; creating a campaign lives in the global Create menu, which is one click away in the same bar. |
| Campaigns | "View archive" and the per-row overflow menu | No archive route and no per-row menu exist. |
| Campaigns table | Progress and Outcome cells on rows that have neither | Drawn per row: reactivation reports released-of-total audiences and a recorded send count; press campaigns report assigned journalists and have no denominator, so no bar. |
| Relationships | The "⋯" row menu | The three controls Release 3 shipped are drawn instead. |
| Scoreboard | Sparklines on the metric cards | The registry carries a current value and one prior period. Two points are not a series. |
| Scoreboard | The large time-series chart | Same reason. Nothing stores a metric's history. |
| Search | The record preview pane | Nothing supplies a preview of a selected result. |
| Le-E | The transcript, the focus plan, and the plan actions | The panel holds proposals and a message box; it has no stored conversation of that shape and no plan model. |

## Differences that are not omissions

* **Campaigns** keeps the per-lane lifecycle detail below the table. The concept has no such section,
  but every stage action there is a working control #152 shipped with tests that click it.
* **Relationships** keeps the four summary counts and the filter form the concept does not show;
  #152 made each count its own filter. The fields the concept's table has no column for — open
  commitments, last contact, inbound, outbound, owner, outreach, eligibility — moved into a per-row
  disclosure rather than being dropped.
* **Relationships / Strength** uses a four-bar meter. The product's strength scale has four named
  steps; the concept's meter has three, and three bars cannot show four states truthfully.
* **Type scale** floors at 11px. The concept sets some text at 9px.
* **Orange** is `#d93204` wherever white sits on it. The concept's `#ff3b00` is 2.9:1 against white.

## Where the stylesheets live

The concept layer is no longer one file in the head. Campaigns, Scoreboard, Relationships and Le-E
each load their layer with the lazy asset for that surface, so a workspace's visual layer is paid
for by the workspace rather than by every page in the shared critical-stylesheet budget.

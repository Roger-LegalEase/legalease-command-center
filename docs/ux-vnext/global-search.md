# Command Center vNext global Search

## Contract and architecture

CCX-104 replaces the temporary top-bar Search link with one Global Search palette
shared by desktop, tablet, and mobile. It is enabled only by the server-side
`COMMAND_CENTER_UX_VNEXT` flag and opens from every vNext destination without changing
data or fetching full application state.

The pure group/view contract is in `scripts/ui/global-search-view-model.mjs`;
rendering and browser interaction are in `scripts/ui/global-search.mjs`; authorized
projection, ranking, filtering, and pagination are in
`scripts/global-search-service.mjs`. The service and legacy Operator Search reuse the
pure compact-text and timestamp helpers in `scripts/search-index-helpers.mjs`.
Legacy Operator Search keeps its existing page and mutation actions; Global Search
returns no actions and performs only Open.

`GET /api/ui/search` authenticates and authorizes every request, reads current records,
applies object visibility, and returns compact projections. It does not mutate state,
invoke a provider, store a query, send, publish, approve, delete, or return full
records.

The response does not echo the raw query. Query text is used only for the current
authorized request and is not included in the compact result payload.

## Trigger, presentation, and keyboard

The top bar displays **Search** and an accurate `Ctrl K` or `⌘ K` hint. Click, touch,
Enter, Space, Control+K on Windows/Linux, and Command+K on macOS open the same dialog.
The shortcut is ignored while another input, textarea, select, contenteditable area,
or dialog form owns focus. The vNext capture handler also prevents the legacy command
palette from opening in those cases.

Desktop uses a centered palette inside the viewport. Mobile uses the same dialog and
data contract as a full-width sheet with practical 44-pixel controls. Opening Search
closes the mobile navigation drawer, Create menu or sheet, Profile menu, and
nonessential shell popovers first. A dirty Create form retains its existing
plain-language close confirmation; Search does not discard it silently.

The Search input receives focus. Tab and Shift+Tab remain contained. Arrow Down and
Arrow Up move through visible results; Home and End move to the first and last result;
Enter opens the active row; Escape and outside-click dismissal return focus to the
Search trigger. The combobox exposes the active row with `aria-activedescendant`.
Programmatic group headings and a restrained live region announce result-count
changes.

## Groups, sources, and exact links

The exact non-empty group order is:

1. Posts
2. Campaigns
3. Partners
4. Files
5. Tasks
6. Reports

| Group | Current source collection | Exact link | Destination |
| --- | --- | --- | --- |
| Posts | `posts` | `#social/post/<id>` | Social |
| Campaigns | `campaigns` | `#outreach/campaign/<id>` | Outreach |
| Partners | `partners` | `#partners/partner/<id>` | Partners |
| Files | `dataRoomItems` | `#files/data-room-item/<id>` | Files |
| Files | `evidencePackNotes` | `#files/evidence-note/<id>` | Files |
| Files | `soc2Evidence` | `#files/soc2-evidence/<id>` | Files |
| Files | `soc2Policies` | `#files/soc2-policy/<id>` | Files |
| Files | `brandAssets` | `#files/brand-asset/<id>` | Files |
| Tasks | `tasks` | `#item/tasks/<id>` | Inbox |
| Reports | `reports` | `#files/report/<id>` | Files |

Reports are excluded from Files and appear only in Reports. Visible labels come from
the founder-language contract rather than collection names. Search never exposes
`captureInbox`, `dataRoomItems`, `evidencePackNotes`, `partnerPrograms`,
`auditHistory`, engine names, or the old Operator Search label in normal vNext UI.

## Searchable fields and compact result

The server projects only truthful current fields:

- Posts: stable ID, title, hook, draft/body text, channel, and status.
- Campaigns: stable ID, name, type, goal, channel, and status.
- Partners: stable ID, organization, contact name, geography, next action, and stage.
  Contact email can contribute to matching only for a role already allowed to read
  sensitive data and is never displayed in the result.
- Files: stable ID, name/title, current section or collection, authorized notes or
  summary, and status.
- Tasks: stable ID, title, description, next action, priority, and status.
- Reports: stable ID, title, summary, reporting period, next action, and status.

Each immutable result contains only:

```text
id, objectType, title, context, status, updatedAt,
canonicalHref, destination, sourceKind
```

It contains no complete record, application state, provider response, secret,
credential, internal permission, contact email, private storage URL, audit payload, or
mutation action. Result rows use text nodes for user content and do not inject raw
HTML.

## Ranking, query validation, and pagination

Ranking is deterministic and non-AI:

1. exact stable ID;
2. exact title/name;
3. title/name prefix;
4. complete title/name token match;
5. title/name substring;
6. context/summary substring; then
7. most recent update, fixed group order, normalized title, and ID as stable
   tie-breakers.

Matching is case-insensitive and Unicode-safe while returned text preserves
international characters and punctuation. Duplicate canonical links are suppressed.
No external provider, embeddings, fabricated relevance score, or AI dependency is
used.

Queries are trimmed, limited to 160 characters, and reject control characters,
script-like markup, event-handler syntax, and dangerous URI schemes. The default
limit is 36 results and the enforced maximum is 60. A numeric cursor provides compact
continuation, `truncated` explains that more results exist, and Show more appends the
next page. An empty query never dumps the index.

The client debounces for 200ms, aborts the prior request when input changes, ignores
stale responses, suppresses identical requests, and preserves the typed query on a
recoverable error. Loading feedback appears immediately. Search issues no repeated
`/api/state` or boot-state request.

## Permissions and recently opened records

`GET /api/ui/search` requires the existing internal-read capability. Owner, admin, and
operator fixtures receive only records allowed by current role and object visibility.
Viewer access remains aggregate-report-only and cannot call Global Search. An
unauthorized stable ID produces zero results and no count disclosure. Exact links
reuse the existing authorized object viewer and do not bypass record access.

Recently opened results live only in memory for the current browser tab. The list is
deduplicated by canonical link, most recent first, and capped at eight. No query or
recent record is written to localStorage, sessionStorage, cookies, state, logs, or a
server collection. The list clears on reload. Before recents are displayed, their
exact links are submitted to the Search endpoint and rechecked against the current
authorized index.

## Compatibility routes and history

Opening Search from the top bar does not change the hash.

- `#search` is the founder-facing vNext compatibility entry.
- `#operator-search` opens the same vNext palette for old bookmarks.
- Either direct route uses Today as a safe background when no previous safe hash
  exists.
- Closing a direct palette replaces the utility hash with the safe previous hash or
  `#today`, avoiding a loop or duplicate load.
- Opening an exact result creates a normal history entry. Back returns to the prior
  page or direct Search route and reopens the palette when appropriate.

`#search` is a documented vNext utility route, not an inventoried legacy alias. The
75 canonical renderer routes and 53 aliases remain unchanged. With vNext disabled,
`#operator-search` continues to render the existing legacy Operator Search page and
its authorized actions byte for byte.

## Loading, empty, error, accessibility, and performance

The initial empty state explains how to search. No matches use:

- **No results found**
- “Try a different name, keyword, or record type.”
- Clear filters and Clear search.

Errors say: “Search could not load. No records were changed. Try again.” Retry keeps
the query and Close remains available. No endpoint, stack, SQL, JSON, collection,
environment, token, or parser detail is displayed.

The dialog has a visible accessible title, labelled input, visible focus, focus
containment and return, exposed headings, non-color status text, reduced-motion
support, and viewport-safe desktop/mobile layouts. Browser coverage requires zero
serious and zero critical axe findings, zero unexpected console/page errors, zero
failed critical same-origin requests, and no horizontal overflow at 1440, 1024, 768,
or 390 pixels.

CCX-105 keeps this error state scoped to the Search dialog. A shell or session
failure closes the palette before replacing authenticated main content; Search does
not bypass route authorization or remain enabled in Recovery Mode when required
full state is unavailable.

Representative fixture responses must stay below 250 KB and normally below 100 KB;
the isolated response target is below 750ms. Browser metrics record response bytes,
response time, request count, aborted/ignored stale requests, duplicate suppression,
full-state requests, result counts, and memory-only recent count.

## Verification, screenshots, rollback, and CCX-105

Run `npm run test:vnext-global-search` for the focused contract and `npm run
test:browser` for real Chromium coverage. Required review captures are under
`docs/ux-vnext/screenshots/ccx-104/`.

Rollback requires only unsetting `COMMAND_CENTER_UX_VNEXT` or setting it to `false`
and restarting. No migration, state cleanup, query cleanup, or storage rollback is
needed because Search is read-only and memory-only.

CCX-105 now supplies the surrounding shell resilience contract without adding Search
mutations, persisting queries, retiring the legacy Operator Search page, redesigning
destination workspaces, or weakening authorization and exact-link safety.

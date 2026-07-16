# CCX-102 route compatibility and exact deep links

Baseline SHA: `70583b2073d6d60428d99524b995e5590be4aa5a`

CCX-102 preserves the current 75-route renderer and its 53 aliases while giving the
vNext shell one deterministic route contract. It does not add a second router, copy a
page renderer, move a record, or grant record access. The legacy shell remains the
unchanged rollback path.

## Architecture

`scripts/ui/route-compatibility.mjs` is the authoritative parser and resolver. It reads
only the CCX-001 route registry, returns frozen plain data, and has no storage, network,
request-handler, authorization, sending, publishing, or business-engine dependency.
The same resolver function is serialized into the vNext HTML; there is not a second
browser implementation of the policy.

The vNext compositor in `scripts/ui/app-shell.mjs` replaces only the route-parsing block
in the generated vNext document. The existing route dispatcher, current page functions,
artifact viewer, state graph, action handlers, and authorization boundary are shared.
`COMMAND_CENTER_UX_VNEXT=false` continues to return the unmodified legacy document.

The normalized result identifies the route kind, requested safe hash, canonical route,
alias use, selected destination, exact object source, canonical safe hash, and recovery
reason. Unsafe input is never copied into the result.

## Canonical pages and aliases

- All 75 renderer route identifiers remain registered.
- All 53 current aliases remain one-hop mappings to an existing route.
- The intentional `#prospects` self-alias is treated as an already-canonical route, not
  as a redirect loop.
- Historical identifiers shadowed by live aliases retain their current behavior. For
  example, `#cockpit` and `#overview` resolve to `#today`; `#partner-hub` resolves to
  `#partners`.
- Route context after `?` is preserved during safe page canonicalization.
- `/sources/import-social-calendar` continues to render the existing `#sources` flow.

CCX-104 adds `#search` as a documented vNext-only utility entry without adding it to
the legacy canonical-route or alias inventory. `#search` and the existing
`#operator-search` open the shared Global Search palette over Today in vNext mode.
Closing returns to a safe previous hash or `#today`; opening an exact result uses a
normal history entry. In flag-off mode, `#operator-search` still renders the legacy
Operator Search page.

In vNext mode, a successfully resolved alias is replaced with its canonical hash by
`history.replaceState`. This does not reload the document and does not add a history
entry. Back and Forward therefore move between the user's actual navigation entries.
The resolver does not repeatedly canonicalize an already-canonical hash.

Legacy mode keeps its existing alias and unknown-route behavior. CCX-102 does not
canonicalize the flag-off document through the new contract.

## Exact founder-facing object links

Canonical object links use stored IDs, never display names:

| Object | Canonical hash | Current collection | Destination |
| --- | --- | --- | --- |
| Post | `#social/post/<encoded-id>` | `posts` | Social |
| Campaign | `#outreach/campaign/<encoded-id>` | `campaigns` | Outreach |
| Partner | `#partners/partner/<encoded-id>` | `partners` | Partners |
| File | `#files/<source-kind>/<encoded-id>` | Source-kind dependent | Files |

The File discriminator prevents collisions between records that happen to share an ID:

| File source kind | Current source collection |
| --- | --- |
| `report` | `reports` |
| `data-room-item` | `dataRoomItems` |
| `evidence-note` | `evidencePackNotes` |
| `soc2-evidence` | `soc2Evidence` |
| `soc2-policy` | `soc2Policies` |
| `brand-asset` | `brandAssets` |

These are the top-level File-like collections the current exact-item viewer can read.
CCX-102 deliberately does not invent a canonical Files collection or move local assets,
partner artifacts, reports, or evidence records.

The builder URL-encodes one exact stored ID. UUIDs, slugs, underscore identifiers,
Unicode identifiers, spaces, and encoded slashes survive a build/parse round trip.
Every canonical object link reuses the current `#item` artifact renderer internally,
so one requested record opens one matching record. A missing record keeps the shell
working and states that the record is not in loaded data; it never silently opens a list.

Authorization is unchanged. The existing authenticated state response still determines
which records can be resolved, and a missing or unauthorized record is not distinguished
in a way that exposes private record existence.

## Generic item compatibility

`#item/<collection>/<encoded-id>` remains supported for every current collection. Known
core collections select their founder destination and expose a canonical object link in
the normalized contract, but CCX-102 leaves the visible generic hash in place because
record existence is established by the existing viewer after authorized state loads.
This avoids canonicalizing a missing or unavailable record prematurely.

Non-core collections continue to use the existing exact-item viewer. The explicit
collection destination table selects Today, Inbox, Settings, or a primary destination;
no collection is classified by substring guessing.

Examples:

```text
#item/posts/post-001
#item/campaigns/browser-campaign-001
#item/partners/browser-partner-001
#item/dataRoomItems/data-room-traction-snapshot
```

## Unknown-route recovery

A safe but unknown hash remains visible and renders this recovery state inside the vNext
shell:

- **Page not found**
- “The link may be old or incomplete. No data was changed.”
- **Go to Today**
- **Search**, which opens the CCX-104 Global Search palette

The state uses the shared page-header and button primitives. Search, Create, Help,
Profile, the sidebar or drawer, and the existing Le-E control remain usable. Recovery
does not write state and does not redirect before the user can understand what happened.
Today remains the shell's selected safe-home destination while the explicit recovery
heading makes clear that the requested page was not Today.

## Unsafe-route rejection

The parser fails closed for malformed percent encoding, empty required segments,
control characters, HTML/script boundaries, dangerous protocols, backslashes,
traversal segments, invalid collections, unknown File source kinds, hashes over 2,048
characters, collections over 80 characters, and IDs over 240 characters.

Unsafe results contain no requested raw hash or ID. They execute nothing, select no
record, perform no write, and render the same safe recovery interface in vNext mode.
Safe-link validation and Content Security Policy are unchanged.

## Test data and browser coverage

Browser tests copy the tracked seed into two mode-specific temporary JSON files and add
one synthetic Campaign and one synthetic Partner to each disposable copy. The records
contain neutral example data only. The runner still blocks external network access,
keeps every live email/social gate off, and removes the temporary directory when it
shuts down.

Browser coverage verifies all five destination classes, representative aliases,
replace-state history behavior, exact Post/Campaign/Partner/File records, generic item
links, missing records, unknown and unsafe recovery, responsive selection, duplicate
full-state requests, accessibility, console/page errors, and horizontal overflow.

## Rollback and CCX-103 handoff

Rollback is immediate: omit `COMMAND_CENTER_UX_VNEXT` or set it to any value other than
the exact string `true`. The flag-off renderer and its route behavior are unchanged.

CCX-103 may use the exact-link builders after a create flow has persisted a real record.
It must not show a creation option until that flow exists, and it must not change the
parser, source mapping, authorization boundary, or safe recovery behavior as a shortcut.

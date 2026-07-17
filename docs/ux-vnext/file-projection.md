# File projection and canonical strategy

## Purpose

`FileView` is a pure, deterministic, authorization-aware projection over current
document-like records. It does not create a `files` collection, move records,
copy source payloads, migrate storage, expose an endpoint, or add UI/runtime
integration. Every included record remains authoritative in its existing source
collection.

The pure APIs are:

- `buildFileProjection(state, actor, now)` for frozen views plus non-sensitive
  projection diagnostics;
- `buildFileViews(state, actor, now)` for the frozen collection;
- `buildFileView(state, stableKey, actor, now)` for one projected identity.

The adapter reads no current clock. `now` is accepted for API parity but cannot
change stored source truth.

## Source matrix

The included matrix is limited to source kinds already reviewed by CCX-102,
Inbox, and Global Search.

| Authoritative source | Source kind | Exact link | Current truth |
| --- | --- | --- | --- |
| `reports` | `report` | `#files/report/<id>` | Generated and draft operating, Partner, campaign-result, and investor reports |
| `dataRoomItems` | `data-room-item` | `#files/data-room-item/<id>` | Data Room records and Global Create file/upload metadata; legacy `dataRoom` is an explicit mirror alias |
| `evidencePackNotes` | `evidence-note` | `#files/evidence-note/<id>` | Review-only evidence notes |
| `soc2Evidence` | `soc2-evidence` | `#files/soc2-evidence/<id>` | SOC 2 readiness evidence and generated snapshot metadata |
| `soc2Policies` | `soc2-policy` | `#files/soc2-policy/<id>` | SOC 2 readiness policy records |
| `brandAssets` | `brand-asset` | `#files/brand-asset/<id>` | Brand asset metadata and private asset references |

Uploaded document records are currently `dataRoomItems`; there is no separate
authoritative uploaded-document collection. A Campaign result explicitly stored
as a `report` remains a report and may link to its Campaign by stable ID.

## Included and deferred families

Included sources are the six typed families above. The following candidate
families are deliberately deferred and covered by the focused test:

- `partnerProgramArtifacts` and `handoffPackets`: current reviewed ownership and
  routes remain under Partners;
- `postImages`: current reviewed ownership remains under Social and individual
  image versions must remain linked to their Post;
- `localAssets`: local operational path metadata is private and has no typed
  File route;
- `postingKits`, `campaignKits`, and `assetBundles`: no reviewed File source kind
  exists; `assetBundles` also has no registered writer;
- `evidenceSummaries`: no reviewed File source kind exists;
- `soc2AccessReviews`, `soc2Changes`, and `soc2Incidents`: current reviewed
  ownership remains under Settings;
- `soc2AuditLogs`: raw audit records are activity evidence, not Files, and their
  payloads must not be copied.

SOC 2 snapshot records are included only when represented by `soc2Evidence`.
Dedicated campaign kits, Social exports, Partner artifacts, operational records,
and evidence summaries require future typed-route and authorization review.

## Normalized contract

Each recursively frozen view provides:

```js
{
  id,
  stableKey,
  name,
  fileType,
  sourceCollection,
  sourceKind,
  sourceId,
  status,
  owner,
  modifiedAt,
  verifiedAt,
  storageRef,
  sourceRef,
  relatedObjects,
  permissions,
  activity,
  href
}
```

Missing names, types, statuses, owners, modification dates, verification dates,
relationships, and storage references remain unavailable rather than being
invented.

## Canonical strategy and stable identity

CCX-600 is projection-first. It creates no canonical `files` collection and no
migration. Stable identity is namespaced as `<source-kind>:<source-id>`; filename
is never identity.

Unrelated same-name records remain separate. Repeated rows with the same
authoritative source identity resolve deterministically. The documented legacy
`dataRoom` mirror deduplicates against `dataRoomItems` by the same stable ID.
Explicit `duplicateOfId`/`canonicalSourceId` relationships may suppress a copy
within the same source family while the surviving `sourceRef` retains the
duplicate source IDs.

Version fields such as `versionOfId`, `previousVersionId`, and `supersedesId`
create explicit related-object references. Versions are never deduplicated: each
source ID remains a distinct FileView. A report and a campaign kit or export also
remain separate unless source truth explicitly represents the export as the same
report record.

## Name and file type

Names use only the source family's established name/title fields. File type uses
explicit MIME type, semantic file metadata, or an extension present in an
explicit filename/path field. It recognizes Image, PDF, Markdown, Text document,
Link, Report, Spreadsheet, Presentation, Folder or collection, and Unknown.

Extensions mentioned only in titles, notes, or prose are ignored. Evidence notes
and policies are text records by their explicit source kind. Reports remain
reports unless explicit file metadata establishes a more specific type.

## Status and verification

Status preserves the exact stored `status`, `evidenceStatus`, review state,
approval state, or explicit brand-asset approval boolean. The normalized key and
plain label are display helpers only. Missing status remains unavailable.

No status automatically claims Current, Verified, Ready, Shared, Published, or
Complete. Approval and generation do not imply verification. `verifiedAt` is
available only from an explicit verification field; approval/review timestamps
are not substituted.

## Safe storage references

`storageRef` distinguishes stored, linked, generated, and metadata-only records.
Owner/admin actors with the existing `view_private_assets` capability may receive
sanitized opaque internal references already stored on the source record.
Operators without that capability receive the FileView but private storage
references are suppressed.

The projection never returns:

- signed or query-bearing URLs;
- credentials, tokens, bucket secrets, or provider payloads;
- local absolute filesystem paths;
- traversal paths;
- an HTTPS public URL without explicit public source truth.

A storage reference does not claim that a file is accessible. An explicitly
public, credential-free HTTPS source may be returned as `publicUrl`; other URLs
remain suppressed.

## Related objects

Relationships use only explicit IDs. Supported summaries include Partner,
Campaign, Post, Program, report/evidence source, and File version relationships.
Partner, Campaign, Post, and typed File links use the current exact route
contract. Program references retain the current safe generic item route.

No title, filename, organization-name, or prose matching occurs.

## Permissions and privacy

The adapter requires an authenticated known role with `read_internal`. Missing or
unknown actors fail closed. Existing `allowedRoles`, visibility, sensitivity,
and owner-only policy is applied before output and diagnostic counts. The
permissions summary describes source truth and grants nothing.

Private storage metadata requires the existing `view_private_assets` capability.
UI visibility is never treated as authorization. The projection excludes source
bodies, evidence notes, provider payloads, legal records, raw audit values, and
storage credentials.

## Activity

Activity comes only from explicit, stable-ID-linked source history,
`activityEvents`, or `auditHistory`. Supported truthful events are created,
replaced, verified, shared, generated, and updated. Stable event IDs deduplicate
the same event across sources. Output contains only ID, normalized event kind,
plain label, timestamp, and source collection.

`modifiedAt` never fabricates an activity event. Raw audit payloads, provider
bodies, notes, and legal content are not projected.

## Exact links

Unsafe or missing source IDs fail closed. The only File link families are:

- `#files/report/<id>`
- `#files/data-room-item/<id>`
- `#files/evidence-note/<id>`
- `#files/soc2-evidence/<id>`
- `#files/soc2-policy/<id>`
- `#files/brand-asset/<id>`

CCX-600 does not extend route compatibility.

## Purity and performance

The modules perform no network request, storage write, source mutation, file
creation, upload, share, generation, endpoint action, or migration. Results are
deterministically sorted, input-order independent, and recursively frozen.

The focused detailed benchmark scans 130 authorized candidate rows, projects 120
FileViews, and performs 10 explicit deduplications. A current local sample took
28.985 ms and serialized to 202,781 bytes, with zero network requests, storage
writes, or source mutations.

This is an adapter benchmark, not an unpaginated endpoint proposal. Any later
endpoint must independently define pagination, authorization, summary shape, and
payload limits.

## Rollback

Rollback removes `file-sources.mjs`, `file-view.mjs`, the focused test, this
document, and the additive package script. No source records, routes, storage,
schema, or migrations require rollback.

## CCX-601 handoff

CCX-601 may consume the reviewed pure contract after CCX-600 is reviewed and
merged. It must not treat this benchmark as an endpoint contract or create a
canonical collection by default. Any new upload/share workflow must separately
review authorization, durable storage, signed/public URL handling, versioning,
sharing, endpoint pagination, and genuinely new canonical upload records.

# RCAP Prospect CRM — Wave 2 persistence, allowlist, index and rollback design

**Packet 5 deliverable.** Companion to `scripts/rcap-profile-contracts.mjs`.
Status: **design accepted, no migration shipped.** Nothing in this document has been applied to
a production database, and nothing in Wave 2 requires it to be.

---

## 1. Why there is no migration

The Wave 0 audit (§4) established that the Supabase backend stores business state in one generic
table:

```
leos_core_records (collection text, item_id text, payload jsonb, ...)
```

with a unique key on `(collection, item_id)`. A new collection is therefore **not** a new table.
It is a new value in the `collection` column, and the only code change required is registering
the name in `coreStateCollections` in `scripts/storage.mjs`.

This is the single most important fact about RCAP persistence, and it cuts both ways:

- **No DDL, no RLS change, no index migration is needed** for the nine collections below.
- **An unregistered collection is silently dropped.** It writes fine against the local JSON store
  and vanishes on Supabase. The audit records that this trap already destroyed `reactivationContacts`
  once and silently disabled `settings`. `scripts/test-rcap-profile-contracts.mjs` asserts
  membership for every name so it cannot happen again.

## 2. The nine collections

| Collection | Grain | Mutability | Written by |
|---|---|---|---|
| `rcapProspectSources` | one document, page, workbook row or note per account | upsert by content id | import, profile engine, human add |
| `rcapProspectClaims` | one attributed assertion | upsert; superseded rather than deleted | profile engine, human note |
| `rcapProfileRuns` | one durable job attempt | status transitions | profile engine |
| `rcapProfileVersions` | one profile generation | status transitions | profile engine, approval |
| `rcapProfileSections` | one of fifteen sections of a version | upsert; human edits guarded | profile engine, human edit |
| `rcapProfileUnknowns` | one open question with a resolution path | state transitions | profile engine, human answer |
| `rcapProfileCorrections` | one proposed change to a CRM field | state transitions | profile engine, human decision |
| `rcapProfileDependencies` | one edge for targeted invalidation | upsert | profile engine |
| `rcapProfileSnapshots` | one frozen version, for comparison | **append-only** | profile engine |

`rcapProfileSnapshots` is registered in `appendOnlyCollections`. A comparison basis that can be
rewritten proves nothing, and append-only also stops a stale scoped patch from erasing the
history a diff depends on — the same protection the send-claim ledgers get.

Every record carries `accountId`. There is no cross-account record and no global record.

## 3. Item ids

Ids are deterministic and content-derived: `rcapRecordId(prefix, ...parts)` returns
`<prefix>_<sha256(parts)[0:16]>`. Prefixes are `rsrc`, `rclm`, `rrun`, `rver`, `rsec`, `runk`,
`rcor`, `rdep`, `rsnp`.

This matters because `(collection, item_id)` is the unique key. A deterministic id means:

- re-running an import over unchanged rows **upserts** instead of growing a duplicate every pass;
- the same claim derived twice from the same sources collapses to one row;
- a retry after a crashed run does not fork the record set.

Ids are never index-keyed. The audit records that index-keyed row shredding is what destroyed
`reactivationContacts`, and every writer here stamps a stable id before the write.

## 4. Allowlist and authorization

No new role. Wave 0 blocker B5 was resolved in Wave 1 by expressing RCAP semantics as three
capabilities over the existing four roles, registered in `scripts/roles.mjs`:

| Capability | Grants |
|---|---|
| `read_rcap_prospects` | read sources, claims, profile versions and sections |
| `manage_rcap_prospects` | queue a run, add a source, edit a section, answer an unknown |
| `approve_rcap_prospect_work` | approve a version, accept or reject a proposed correction |

Wave 2 adds **no** new capability. The read endpoint refuses without `read_rcap_prospects` (403),
and the approve path is the only route to an `approved` version or an `accepted` correction.

Authorization is server-authoritative, checked before the projection runs — never in the browser
runtime, which receives only what the server already decided it may see.

## 5. RLS

**No RLS change is required or proposed.** `leos_core_records` is reached exclusively through the
service role from the Node process; there is no direct client connection to Supabase, so the row
policies that would matter for a browser-facing PostgREST surface do not apply here. Access
control lives in the application layer, at the capability check above.

If a future wave exposes PostgREST directly, the policy shape these records want is
`collection = any(<rcap collections>) AND payload->>'accountId' = <caller's permitted account>`.
That is recorded here so the requirement is not rediscovered later; it is **not** part of Wave 2.

## 6. Indexes

The existing unique index on `(collection, item_id)` serves every read Wave 2 performs, because
every read is either:

1. **by collection** — hydrate all sources for the state graph; or
2. **by collection + item_id** — fetch one version, one run.

Account-scoped filtering happens in application code after the collection read, which is the
pattern every other collection in this repository uses. At the projected data volume — the
directory workbook is ~48 organizations, each with a handful of documents and fifteen sections —
this is comfortably correct.

**The threshold at which this stops being true**, recorded so it is a decision rather than a
surprise: when `rcapProspectClaims` exceeds roughly 50,000 rows, a per-collection scan on every
hydration becomes the dominant read cost. At that point the answer is a partial index on
`(collection, (payload->>'accountId'))` for the claim and section collections — a
`CREATE INDEX CONCURRENTLY`, non-blocking, no data change. Not needed now, and adding it now
would be optimizing a table with three digits of rows.

`rcapProfileSnapshots` grows monotonically. If it becomes large it belongs in
`hydrationExcludedCollections` alongside `auditEvents`, read only through explicit
`readCollections([...])`. Not needed at Wave 2 volumes; recorded as the known next step.

## 7. Rollback

Rollback is in three independent layers, weakest coupling first.

**Layer 1 — the feature flag.** `COMMAND_CENTER_RCAP_CRM_V1=false` removes every RCAP surface,
runtime, stylesheet and endpoint. The server output returns byte-for-byte to what it is without
the flag, which the desktop-shell suite asserts by name. No data is touched. This is the rollback
for anything user-visible and it is instant.

**Layer 2 — revert the code.** The nine collections stop being written. Existing rows remain in
`leos_core_records`, inert and unread: a collection name nobody reads is invisible. Reverting the
`coreStateCollections` registration is *optional* and, if done, means those rows also stop being
hydrated. **No data is lost by reverting, and none needs to be deleted.**

**Layer 3 — remove the data.** Only if explicitly authorized, and only as
`DELETE FROM leos_core_records WHERE collection IN (...)`, scoped to the nine names. This is the
only destructive step and it is not part of any planned rollback. `LEGACY_DELETION_AUTHORIZED`
governs it.

There is no schema change to reverse, so there is no down-migration to get wrong. That is the
main practical benefit of the generic-table design and the reason this packet ships no migration.

## 8. What this design deliberately does not do

- **It does not touch the authoritative record.** Sources, claims and sections are research
  *about* an organization. The organization itself stays in the existing relationship substrate;
  Wave 1 established that and Wave 2 does not open a second source of truth.
- **It does not apply corrections.** A proposed correction is a row with a `proposed` state. The
  write to the account happens through the existing relationship action contract, after a person
  with `approve_rcap_prospect_work` decides. Rule 5 forbids a silent stage change; the same
  reasoning covers every other field.
- **It does not store participant data.** Rule 25 and `docs/privacy-data-inventory.md`: no
  participant criminal-record facts, eligibility answers, case documents, or participant PII.
  Every record above is organization-level research about a potential partner. The source kinds
  are documents, pages, workbook rows, email threads and human notes about *organizations*.
- **It does not add a provider scope.** See §9.

## 9. Blocker B2 remains open

Packet 6 wants Google Drive and Docs read access. The current OAuth grant
(`googleReadOnlyScopes` in `scripts/google-workspace.mjs`) is:

```
openid, email, profile,
https://www.googleapis.com/auth/gmail.readonly,
https://www.googleapis.com/auth/calendar.readonly
```

`drive.readonly` and `documents.readonly` **do not exist in it**. Adding them requires an OAuth
consent change and security review, which is owner work, not implementation work
(`SECRETS_OR_PROVIDER_CONFIG_CHANGES_AUTHORIZED=false`).

Wave 2 therefore ships the Drive/Docs **adapter** with the scopes declared and the grant checked,
so that a document which cannot be read is recorded as `not_authorized` with the reason attached,
rather than as an absence. The live five-document pilot and the migration of the remaining linked
Docs stay unbuilt until B2 clears. Every surface says so in words rather than showing an empty
profile.

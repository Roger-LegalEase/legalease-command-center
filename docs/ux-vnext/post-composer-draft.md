# CCX-302A Post composer draft contract

## Scope

`buildPostComposerDraft(state, actor, postId, context)` is a pure, deterministic, authorization-aware read model for one exact Post. It composes merged CCX-300 `PostView`, CCX-303A Social creative catalog, CCX-304A channel variants, and CCX-305 Social readiness into a founder-facing draft contract.

This packet adds no composer UI, Social page, endpoint, browser controller, CSS, editor, autosave, channel-selection write, variant write, schedule, approval, publication, provider call, storage write, image generation, or CCX-302B behavior.

## Contract

The deeply immutable projection contains:

- canonical `postId`, exact `href`, and caller-supplied valid `generatedAt`;
- truthful shared content and explicit selected-channel truth;
- selected and unselected stored channel variants;
- exact template and creative-selection relationships;
- separate schedule, approval, readiness, and stored-publication truth;
- compact source references, availability counts, diagnostics, and all-false capabilities.

Missing source truth remains `null`, `missing`, or `unavailable`; it never becomes false, passed, zero, approved, scheduled, or published.

## Source matrix

| Source | Contract use | Authority boundary |
| --- | --- | --- |
| CCX-300 `PostView` | Canonical Post identity, exact `#social/post/...` link, normalized sources, schedule, and stored-result context | The composer adapter never creates another identity or route |
| CCX-304A Post channel variants | Shared headline/body/hook/CTA/hashtags, exact shared creative/disclaimer references, selected channels, and independent variants | Shared fallback fields retain `source: shared`; they are not stored into variants |
| CCX-303A Social creative catalog | Approved templates/assets, source references, template relationships, safe previews, and surface compatibility | An ID alone does not establish approval; missing, hidden, failed, deprecated, ambiguous, and incompatible records remain unavailable |
| CCX-305 Social readiness | Content, creative, channel, schedule, approval, and publishing checks | Hints are projected as non-executable guidance; raw rule failures are not returned |
| Authorized Post and related Post image facts | Explicit selection IDs, creative surface, schedule field presence, and approval evidence | Exact stable fields only; no inference from filenames, copy, dimensions, or visual similarity |

CCX-304A selection is normalized before CCX-305 is evaluated, so an unselected stored variant does not become a selected readiness channel. The normalization is an in-memory clone and performs no source mutation.

## Shared content and variants

`sharedContent` retains the CCX-304A field-state contract, including stored, missing, explicitly blank, and shared-fallback truth. `selectedChannels` comes only from explicit CCX-304A selection truth. `channelVariants` preserves customized variants, selected channels without customization, and stored variants for unselected channels.

A selected channel does not imply customization. A stored variant does not select a channel. Removing a channel does not remove its stored variant. Empty unmarked variant fields use shared presentation fallback; explicit blank fields remain distinguishable. Ambiguous variants fail closed. No shared copy is persisted or duplicated into channel records.

## Creative selections

The `creative` block projects exact stored selections for:

- one Social template;
- one approved logo;
- one approved Wilma pose;
- one approved background;
- approved disclaimer blocks;
- other exact approved catalog assets or exact related Post-image references.

Each relationship retains its requested canonical ID. Singular roles with conflicting IDs are ambiguous and unavailable. A catalog lookup must resolve exactly once under the current actor before an approved brand asset is returned. Missing or unauthorized assets, incompatible asset roles, and missing template relationships are explicit unavailable conditions; no logo, Wilma pose, background, disclaimer, template, or other asset is substituted.

The official white LegalEase wordmark remains `brand-contract-white-wordmark`. It resolves only when stored creative-surface truth is sufficiently dark. A light surface returns `incompatible_surface`; an unspecified surface returns `surface_unavailable`. The adapter never redraws, recolors, optimizes, copies, or generates the wordmark.

Raw bytes, data URLs, local absolute paths, signed URLs, credentials, tokens, environment values, provider payloads, and unapproved assets are never projected. Safe previews remain repository-relative references from CCX-303A.

## Readiness, schedule, approval, and publication

Readiness preserves CCX-305 check categories, blocking state, and hard-failure truth. Standardized check keys are returned, but raw stored rule IDs and raw audit bodies are not. `actionHint` becomes read-only `guidance` with `executable: false`; the adapter grants no mutation intent.

Schedule is independently classified:

| State | Meaning |
| --- | --- |
| `valid` | A valid stored schedule is present |
| `missing` | The schedule field is explicitly present but empty |
| `invalid` | Stored schedule text or status is invalid/conflicting |
| `unavailable` | No authoritative schedule source field is present |

Approval is independently classified as `not_required`, `required`, `pending`, `changes_requested`, `approved`, or `unavailable`. Approval is true only from explicit Post or related approval evidence; scheduling and publishing do not fabricate it.

Publication remains inside readiness as stored-result truth. `published` requires explicit results for every selected channel; `partial` requires explicit mixed channel results; `scheduled` is not published. An approved Post is not thereby scheduled or published, and a scheduled Post is not thereby published.

Hard content and creative failures remain blocking. Missing content blocks as missing content without being relabeled as an authoritative rule failure. Outcome promises, required disclaimers, unsupported personalization, and other reviewed failures retain distinct CCX-305 check keys.

## Authorization, privacy, and determinism

Missing or unknown actors fail closed. Actor visibility is applied before the Post, variants, related sources, catalog records, counts, or output are composed. A hidden Post returns no Post identifier, link, references, or counts. Hidden variants and creative records cannot affect visible selections, customization, ambiguity, or counts.

Stable source ordering and exact relationships make input order irrelevant. The result and every nested object and array are frozen. The modules use no clock unless the caller provides a timestamp and make zero network requests, provider calls, filesystem writes, storage writes, Post mutations, variant mutations, selection mutations, autosaves, schedules, approvals, publications, or image generations.

## Performance and rollback

The focused benchmark projects 100 detailed Posts with five standard channels, 500 variants, shared and customized content, exact creative relationships, ten unavailable background relationships, readiness checks, and authorized related records. It reports projection time, serialized size, variant count, asset relationships, unavailable relationships, readiness-check count, and every mutation/action count.

This is an adapter benchmark, not an endpoint or composer proposal. Rollback removes the two pure modules, focused test, this document, and the additive package script; no migration, runtime, UI, browser, or stored data needs reversal.

## CCX-302B handoff

CCX-302B may consume this immutable contract for a separately reviewed composer UI. It can use canonical identity and links, field-state truth, exact asset references, selected/customized separation, read-only format guidance, and readiness summaries without recomputing authorization or silently resolving assets. It must add its own separately reviewed edit, persistence, approval, scheduling, and publication gates; this contract grants none of them.

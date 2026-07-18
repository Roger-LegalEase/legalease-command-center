# CCX-304A Post channel variants

## Scope

`buildPostChannelVariants(state, actor, postId)` is a pure, deterministic, authorization-aware read model for shared Post content and explicitly stored channel variants. It consumes CCX-300 `PostView` for canonical Post identity, exact links, normalized source references, and the existing Post asset relationship contract.

CCX-304A does not add a Social page, composer, editor, endpoint, browser controller, CSS, autosave, selection write, approval, schedule, publication, provider call, or CCX-304B behavior.

## Contract

The deeply immutable result contains:

- canonical `postId`;
- truthful `shared` fields and exact shared creative/disclaimer references;
- explicitly stored `selectedChannels`;
- stable channel `variants`;
- compact availability, issue, and count truth;
- normalized PostView `sourceReferences`;
- read-only diagnostics and capabilities that grant no mutation authority.

Shared and variant content fields use `{ value, source, state, explicitlyBlank }`. `source` is `shared`, `variant`, `missing`, or `unavailable`. This allows a consumer to present shared fallback copy without rewriting or duplicating it into stored variants.

## Inspected source matrix

The repository stores variants on canonical Post records; it does not have a separate Post-variant collection.

| Source | Use | Relationship rule |
| --- | --- | --- |
| `posts` through `PostView` | Canonical Post identity, shared content, exact link, normalized source references | Exact Post ID only |
| `posts.channelVariants` | Current embedded array or channel-keyed variant truth | Explicit `channel`/`platform`, or explicit map key |
| `posts.channel_variants` | Legacy embedded variant truth | Same explicit rules |
| `posts.variantsByChannel` | Channel-keyed variant truth | Exact stored map key |
| `postImages` | Shared or channel-specific image references | Exact Post relationship or asset ID |
| `brandAssets` | Shared or channel-specific brand references | Exact canonical ID or exact stored slug |
| `postingKits` | Shared or channel-specific kit references | Exact Post relationship or asset ID |
| `library` | Disclaimer and guidance references | Exact canonical ID |
| `settings.localAssets` | Registered asset references | Exact canonical ID; private paths never project |

No channel is inferred from copy, dimensions, filenames, hashtags, asset metadata, or provider payloads.

## Selection and customization truth

Explicit `targetChannels`, `target_channels`, `selectedChannels`, or `selected_channels` are authoritative when the field exists, including an intentionally empty array. A stored primary `platform` or `channel` is used only when no explicit selection field exists. Stored variants never select their channels.

The output is the union of explicitly selected channels and authorized stored variant channels. Selected channels without variants remain selected and use shared fallback presentation. Stored variants for unselected channels remain visible as unselected. Removing a channel therefore never deletes or hides its stored variant.

A variant is customized only when it has non-empty stored channel content, an explicitly blank field, or an exact channel-specific creative/disclaimer reference. An empty unmarked override falls back to shared content and does not silently erase it. An explicitly blank value requires stored blank truth such as `explicitBlankFields`, a blank field state, or a field-specific explicit-blank flag. Empty stored hashtag arrays are also exact blank truth.

## Stable variant resolution

One authorized record for a channel resolves directly. Multiple records resolve only when there is exactly one explicitly current record with stable identity, or when every record shares an explicit lineage ID and has a unique numeric version; the unique highest version wins. Timestamps, array order, copy text, filenames, dimensions, and fuzzy similarity never select a winner. Any other duplicate set is `ambiguous_variant` and fails closed without choosing content or a source reference.

Known channels sort LinkedIn, Instagram, Facebook, X, then Threads. Safe unknown channel IDs remain available afterward under sanitized founder-facing labels.

## Format guidance

Format guidance is read-only and comes only from stored Post or variant guidance fields. Character, hashtag, image/aspect, link, and limitation text is sanitized and classified as advisory unless stored reviewed truth explicitly marks it as a hard constraint. Every projected guidance block states that this adapter does not assert current platform limits. It does not turn a soft recommendation into a platform rule.

## Asset references and failure behavior

Assets remain references containing only source collection, canonical source ID, and relationship. Metadata, bytes, paths, URLs, signed URLs, credentials, storage tokens, and provider payloads are never copied into shared content or variants.

Relationships resolve by exact canonical ID or exact stored slug. Missing, unauthorized, or ambiguous records create a compact `asset_unavailable` or `ambiguous_asset_reference` issue and make the affected shared or channel scope unavailable. No logo, image, posting kit, disclaimer, or other creative is silently substituted. Shared and channel-specific relationships remain distinct.

## Authorization and determinism

The adapter requires an authenticated current role with `read_internal`, then applies the repository's `recordVisibleToActor` rule before counts, resolution, and output. Missing or unknown actors fail closed. Hidden Posts look absent. Hidden variants and assets cannot affect channels, customization, counts, ambiguity, or availability.

Canonical identity is built from an authorized-state `PostView`; the adapter cannot broaden CCX-300 access. Stable source sorting and explicit version truth make input order irrelevant. The result and every nested value are frozen. The modules use no environment, clock, network, storage, filesystem, browser, endpoint, or provider service.

## Performance and rollback

The focused adapter benchmark exercises 100 authorized Posts, five reviewed channels, 500 authorized variants, selected and unselected variants, shared and customized content, restricted Posts and variants, and ten missing relationships. It reports Posts and variants examined, variants projected, customized variants, missing relationships, projection time, serialized size, and every mutation/action count.

This is an adapter benchmark, not an endpoint or unpaginated composer proposal. Rollback removes the two pure modules, focused test, this document, and the additive package script; no stored data, migration, endpoint, UI, schedule, approval, or publication state requires reversal.

## CCX-302 and CCX-304B handoff

CCX-302 may consume this immutable model to display authorized shared and per-channel truth without recomputing selection, fallback, ambiguity, or asset availability. CCX-304B may use canonical source references and field-state truth in a separately reviewed editor/persistence packet. Neither consumer may treat selection or visibility as publishing authority, overwrite another channel, delete deselected variants, duplicate shared copy into storage, or bypass connection, approval, scheduling, and publication gates.

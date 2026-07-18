# CCX-303A Social creative catalog

## Scope and contract

`buildSocialCreativeCatalog(state, actor, context)` is a pure, deterministic, authorization-aware projection of the repository's stored Social creative foundations. It returns deeply immutable `generatedAt`, `categories`, `templates`, `assetGroups`, `brandGuidance`, `availability`, performance diagnostics, and explicit non-mutation capabilities. It does not render a page, expose an endpoint, generate or edit an image, compose a Post, select an asset, persist a selection, or change any Post, approval, schedule, connection, or publication state.

CCX-303A is the catalog foundation only. CCX-303B remains responsible for separately reviewed composer selection and persistence.

## Inspected template source matrix

The repository has no dedicated `socialTemplates` collection. The catalog consumes the two real stored template families instead of inventing a replacement schema.

| Source | Stored contract | Inclusion truth | Relationship fields |
| --- | --- | --- | --- |
| `generationProfiles` | `profileName`, `visualBucket`, `platformOverrides`, `usesLogo`, `usesWilma`, `defaultAssetIds`, `active` | Stable ID, `active: true`, not explicitly unapproved, failed, blocked, rejected, retired, or deprecated | Exact `defaultAssetIds` and other explicit asset/disclaimer/preview IDs |
| `brandAssets` with `assetType: template` | Approved stored template metadata and optional safe repository-relative preview | Stable ID and `approved: true`; failed or deprecated records are excluded | Exact stored asset, disclaimer, and preview IDs |

Active generation profiles are reported as the repository's active profile truth. They do not confer approval on any referenced asset. Typed template assets still require explicit approval.

## Inspected asset and guidance source matrix

| Source | Catalog use | Approval and safety boundary |
| --- | --- | --- |
| Repo-native `brandContract` | Exact official all-white LegalEase wordmark, official color tokens, and logo usage rules | Static reviewed configuration only; the approved visual-direction reference is never treated as a logo asset |
| `brandAssets` | Logos, Wilma references/poses, backgrounds, examples, brand documents, and other stored creative assets | Requires `approved: true`; explicit AI-generated logos and failed/deprecated records are excluded |
| `settings.localAssets` | Registered local Wilma, background, or brand assets | Requires both explicit `approved: true` and an active record; `active` alone is not approval |
| `library` | Approved disclaimer blocks, visual references, and usage guidance | Requires `status: approved`; restricted or draft text is excluded |
| `postingKits` | Reusable posting kits | Requires `approved: true` and `reusable: true` |
| `assetBundles` | Explicit bundle-to-asset and bundle-to-rule relationships | Relationship source only; missing or ambiguous assets create issues and are never substituted |
| `brandRules` | Compact active usage guidance | Raw rule payloads are not returned; only an explicitly stored summary or hard-rule sentence is projected |

Authorized records are filtered before catalog counts, diagnostics, relationship resolution, and availability. Hidden records therefore cannot change a caller's counts or reveal that a hidden ID exists.

## Template categories

Only explicit stored category fields are classified. The reviewed equivalence mapping is:

| Founder-facing category | Stored equivalents |
| --- | --- |
| Legal education | Legal education, education, expungement education, explainer, explainer carousel |
| FAQ | FAQ, frequently asked questions, Q&A, Wilma answer/explainer graphic |
| Partner story | Partner story, partner proof, case study, testimonial |
| Quote | Quote, quote card |
| Product update | Product update, feature update, product/interface support graphic |
| Proof point | Proof point, pilot proof, data point, data/stat graphic |

An unknown stored category remains available under its sanitized founder-facing stored label and the `other` key. Empty categories and templates are never fabricated merely to fill the six-category vocabulary.

## Template and asset shapes

Each template contains its stable ID and name, mapped category, compact explicit description, explicitly supported channels, surface tone, required asset roles, default disclaimer reference, preview reference, exact source reference, reference-only asset relationships, missing relationship details, and availability. Assets contain their stable ID and name, kind, role, approved status, suitable surface, exact source reference, safe preview reference, and compact usage guidance. Templates retain references only; asset data is never copied into a template or Post.

The catalog groups approved records as LegalEase logos, Wilma poses, brand colors, backgrounds, disclaimer blocks, reusable posting kits, usage guidance, other approved assets, and a reference-only template-linked asset group. Groups appear only when stored or static reviewed truth exists.

## White-wordmark rule

The exact official white wordmark is `assets/brand/logos/legalease-logo-white-2025.png` from the repo-native brand contract. It is offered only when `context.surfaceTone` explicitly identifies a sufficiently dark surface such as dark or deep navy. A light surface excludes it and emits `white_wordmark_requires_dark_surface`. An unspecified surface does not offer it. The catalog never redraws, recolors, optimizes, or replaces the file, and it never promotes the AI-rendered visual-direction reference into a logo asset.

## Missing assets and no substitution

Template, disclaimer, preview, and bundle relationships resolve by exact canonical ID only. No filename, slug, title, visual, or fuzzy similarity participates. A missing, hidden, unapproved, failed, deprecated, surface-incompatible, or ambiguous referenced asset leaves the template unavailable and produces a compact issue naming the unresolved canonical ID. Another logo, Wilma pose, background, disclaimer, or posting kit is never selected as a substitute.

An asset ID alone does not establish approval. Explicitly approved source truth must survive authorization and status filtering before the relationship can resolve.

## Preview, privacy, and authorization

Safe preview references are limited to repository-relative PNG, JPEG, WebP, SVG, or PDF paths under `assets/` or `data/assets/`. Absolute local paths, traversal, query strings, fragments, remote and signed URLs, data URLs, raw image bytes, provider payloads, credentials, tokens, private paths, and sensitive notes are omitted. Missing or unknown actors fail closed with unavailable counts and no templates, assets, guidance, or issues.

The supplied `context.generatedAt` or `context.now` is the only clock. Stable source and output sorting makes input order irrelevant. Output is recursively frozen, and the modules read no environment configuration, filesystem, browser state, network, endpoint, or storage service.

## Performance and rollback

The focused production-like fixture contains 100 templates and 500 stored assets across six categories, including 20 restricted assets and ten missing relationships. A representative run scanned 596 authorized/static candidates, projected 100 authorized templates and 480 authorized stored assets, reported ten missing relationships and 20 fixture-level excluded restricted records, and completed in approximately 40 ms with about 253 KB of serialized catalog output. Network requests, storage writes, source mutations, Post mutations, image generations, and selection writes were zero. This is a pure catalog benchmark, not a composer or persistence proposal.

Rollback is deletion of the two pure modules, focused test, this document, and the additive package script. There is no database, migration, endpoint, UI, runtime, image, or stored selection to reverse.

## CCX-302 and CCX-303B handoff

CCX-302 may render the authorized catalog's categories, template summaries, asset groups, guidance, and availability without recomputing approval or relationships. CCX-303B may use exact source references for separately reviewed selection and persistence. Neither consumer may treat catalog visibility as mutation authority, copy asset data into Posts, silently substitute unavailable references, or bypass composer, approval, scheduling, connection, or publishing gates.

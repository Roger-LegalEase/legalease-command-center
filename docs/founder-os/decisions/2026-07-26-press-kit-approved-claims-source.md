# Decision — the July 2026 press kit is the Press lane's approved proof and claims source

**Date:** 2026-07-26
**Decided by:** Roger
**Implemented in:** `scripts/press-kit.mjs`, `scripts/press-outreach.mjs`,
`scripts/ui/view-models/founder-campaigns-view.mjs`, `scripts/test-founder-os-press.mjs`

## The decision

`docs/press/LegalEase_Press_Kit_July_2026_Rebuilt.pdf` — nine sections, 13 pages, current as of
2026-07-26 — is the one ratified source for what a press pitch may claim. Two consequences, both
enforced rather than documented:

1. **Proof.** Every Pitch Map proof requirement now resolves to a kit section that supplies it, to
   a kit section that shapes it partially, or to a follow-up artifact.
2. **Claims.** Seven boundary claims from the kit are hard-fail rules in the same gate as the
   Pitch Map guardrails.

## Traction and participant stories are follow-up, not blockers

Roger's framing, which the build follows exactly: **pitches go out on the kit alone.** Traction
figures and a participant story are real and obtainable — Roger shares figures with a journalist
who shows interest, and will pursue a story, and the consent it needs, if one is wanted — but they
are not in an approved source today.

So a draft **offers** them and never **claims** them:

| | traction figures | participant story |
|---|---|---|
| blocks a pitch | no | no |
| may be stated in a draft | no (`no_unbacked_figure`) | no (`requires_participant_consent`) |
| may be offered on request | yes | yes |
| shown in Plan as outstanding | no — shown as an offer | no — shown as an offer |

The consent gate is **unchanged and unrelaxed**. Reclassifying the story as follow-up material
changes when Roger goes and gets one; it does not change what a draft may say without one. If a
story is ever told, recorded consent comes first.

## The seven boundary claims

Each is a hard fail, and each failure reports the kit sentence it broke rather than a rule id.

| rule | the kit's boundary |
|---|---|
| `not_a_law_firm` | LegalEase is not a law firm. |
| `no_legal_advice_or_representation` | It does not provide legal advice or representation. |
| `may_be_able_to` | Outcome language stays bounded — "may be able to". |
| `guidance_only` | Automatic and no-filing relief is guidance only; no packet is sold for it. |
| `no_guaranteed_outcome` | No guaranteed eligibility, acceptance, approval or record removal. |
| `fifty_dollar_excludes_representation` | The $50 path does not include representation. |
| `state_table_is_product_support` | The state table is product support, not a legal conclusion. |

### Negation is not contradiction

The trap this gate had to survive: **the approved sentences contain the forbidden words.** "Does
not provide legal advice or representation" contains "provide legal advice"; "no packet is sold for
automatic relief" contains "automatic … packet". A contradiction therefore counts only when it is
*asserted* — matched, with no negator in the 50 characters of the same sentence preceding it **and
none inside the matched span**. The span check is load-bearing: in "the $50 product does not include
representation", the word that cancels the assertion sits inside the match, not before it.

One legacy rule was made negation-aware for the same reason: `no_unqualified_eligibility` matched a
bare "guarantee", which failed the kit's own "the product will not guarantee … record removal" —
the exact sentence a pitch is supposed to carry. `no_lawyer_replacement` was deliberately **not**
made negation-aware: its pattern matches "without an attorney", where the negator is the violation.

### One knock-on change

`SUBSTANCE_PATTERN` — what rescues an identity-framed draft from `no_identity_only_framing` — was
almost entirely traction terms. Once `no_unbacked_figure` blocks traction numbers, that rule could
only be satisfied by a phrase failing another rule, leaving the founder-growth angle no lawful way
to pass. Kit-proven facts (50 states and D.C., attorney-reviewed, packet-capable, fails closed,
$50) now count as substance. This is the reframe made mechanical: identity plus the build, never
identity plus a number.

## Effect on the Plan stage

Plan is `ready`, never `attention`, and carries no blocked reason. Per angle it shows what the kit
proves, what it proves in part with the limit stated, and what is offered on request — never a
"missing" list. The one thing Roger cannot clear is not shown as something he must.

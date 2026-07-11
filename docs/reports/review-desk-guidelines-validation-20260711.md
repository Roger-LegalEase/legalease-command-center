# Review Desk validation vs social media guidelines - 2026-07-11

Ruleset: `docs/legalease-social-media-guidelines.md` (adopted; HARD FAIL items now enforced
mechanically in the post pipeline). Validation ran against the LIVE prod state
(Render/Supabase) using the same `socialGuidelinesGate` code that now gates the pipeline.
Nothing was deleted or modified; this is a read-only report for culling decisions.

## What the "24 drafts" actually are

The Review Desk currently renders exactly 24 rows, but only some are social drafts:

| Rows | Type | Guidelines apply? |
|---|---|---|
| 8 | Social posts (of **9** total; the desk caps the post list at 8, so 1 post is hidden) | Yes - fully validated |
| 4 | Reports (Investor Update, Weekly Operating Report, 2x Weekly Evidence Pack) | Copy scanned (voice/dignity) |
| 4 | Partner follow-ups (Clean Slate Initiative, Fulton County Solicitor-General, Goodwill of Mississippi, Harris County/Commissioner Ellis) | N/A - operational rows, no outbound copy |
| 4 | Channel setup reviews (facebook, instagram, linkedin, threads - all `setup_required`) | N/A |
| 4 | Product signals (funnel snapshots, 2026-07) | N/A |

All 9 posts were validated (including the one hidden by the 8-row cap).

## Social posts: 6 PASS, 3 FAIL

### FAIL (all three are the "RecordShield before the job interview" fanout, status needs_review)

1. **post-recordshield-before-the-job-interview-linkedin-33f49d99** (LinkedIn)
   - HARD FAIL `voice_em_dash` (§2): body contains em-dashes: "confusing—especially" and "decide—but".
   - Note: "it can't guarantee what an employer will see" is a negated disclaimer and is
     correctly NOT flagged as an outcome promise.
2. **post-recordshield-before-the-job-interview-instagram-3283393c** (Instagram)
   - HARD FAIL `voice_em_dash` (§2): body contains "fast—and".
3. **post-recordshield-before-the-job-interview-facebook-5ae40f86** (Facebook)
   - HARD FAIL `voice_em_dash` (§2): body contains "may appear—so".

All three are one find-and-replace away from passing (swap each em-dash for a comma,
period, or rewrite). The gate now blocks approve/schedule for them until fixed.

Judgment-level notes on the same three (style guidance, NOT hard fails, not blocking):
- Hashtag counts exceed the max-two guidance: Facebook 5, Instagram 5, LinkedIn 4.
- Facebook post targets a platform the guidelines' platform section (§5) doesn't define
  (LinkedIn/Instagram/X are the named surfaces).

### PASS (6 posts - all mechanically clean)

4. **demo-post-blocked** (LinkedIn, blocked_channel_not_connected) - "Do not launch a campaign without tracking"
5. **demo-post-campaign** (Instagram, approved) - "A partner campaign is only real when distribution happens"
6. **demo-post-image** (LinkedIn, approved) - "A county pilot needs a story people can repeat"
7. **demo-post-posted** (LinkedIn, manually_posted) - "Fresh Start Campaign produced the first proof loop"
8. **demo-post-ready** (LinkedIn, approved) - "RecordShield turns uncertainty into a clear next step"
9. **demo-post-review** (Facebook, needs_review) - "Wilma explains the process without sounding like a lawyer"

Culling context for 4-9: these are demo-seeded posts (ids `demo-post-*`). They pass every
mechanical check, but they are seed content, not drafts written for publication.

## Reports on the desk: 4/4 PASS

Investor Update, Weekly Operating Report, and both Weekly Evidence Packs scan clean for
voice/dignity violations in their visible copy (all already `exported`).

## Images / render QA

Prod has ZERO rendered post images (`postImages` is empty), so §6 render QA had nothing to
validate retroactively. Every future render now goes through the QA gate automatically
(overlay character-for-character verification, corruption/spelling, asset-integrity locks,
thumbnail-legibility proxy, palette prompt lock), and a QA failure stores as `qa_failed`,
which can never be marked image-ready.

## What is enforced mechanically vs by declaration

Mechanical (blocks approve/schedule/render): em-dashes; AI-sounding constructions;
outcome promises (negation-aware); person-first language (with criminal-record/history
carve-outs); before/after framing; banned imagery and stock clichés in copy and image
prompts (negation-aware for prompts); overlay verbatim match; render corruption/spelling;
brand-asset locks; quote-card typographic requirement; overlay length (legibility proxy);
palette prompt lock.

By declaration (mechanically checked for presence, humans supply the truth):
- Numbers: any numeric token outside the whitelist ($50, plain years, 24/7) hard-fails
  unless the post carries `verifiedNumberSources` naming the source. The gate cannot
  verify the source is real; it can only refuse untraced numbers.
- UPL-sensitive content (statute citations, specific-situation directives) hard-fails
  unless `lawrenceSignoffAt` is set on the post.
- "journey" is flagged on every use (a regex cannot read metaphor); rewrite or accept.
- Pixel-level checks (Wilma identity, exact palette in AI backgrounds) are enforced by
  construction (compositing from the canonical asset; palette lock in the prompt), not by
  image analysis.

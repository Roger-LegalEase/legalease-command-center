# Triage of the 30 stale extended-test failures

Hygiene workstream. The `extended` CI job runs the 180 suites `npm test` does not, and it is
a **differential** gate: it fails only on failures that are new versus the merge-base. Thirty
suites have been failing on main for some time and are therefore tolerated. This is the
record of what each one actually is, so they can be ported or retired deliberately rather
than left to rot.

Produced 2026-07-25 by running the suite on an idle machine and then re-running every
failing suite individually. **Categories: 27 stale, 3 broken tests, 0 environmental,
0 real bugs.**

## Correction to the count

`test-vnext-performance-contract.mjs` is **not** one of the thirty. It passes standalone and
only trips under machine contention, because it asserts a p95 page-read latency budget. Any
local run that reports 31 failures is reporting 30 plus that flake. This matters: it is the
single most misleading suite in the set.

## The three broken tests — the test is wrong, the product is right

| Suite | What it claims | What is actually true |
|---|---|---|
| `test-held-contact-disposition` | No suppression row is written when an operator suppresses a held contact | The row **is** written. Commit `90de797` renamed the fixture address from a real-looking consumer domain to `co@example.com` and missed one regex, so the assertion looks for an address the fixture no longer uses. One-character fix |
| `test-privacy-route` | The privacy page leaks credentials | The match is on the English words "credential", "token value", "service role key" appearing in honest security prose. No secret value leaks. As written the guard catches no secrets and blocks accurate copy; it should match value shapes instead |
| `test-rcap-page-usability` | The `rcap` alias is missing from the route alias map | The alias is present. The test slices a fixed 260-character window and the alias now sits at offset 274 because `routeAliases` grew |

## Two that must not be "made to pass" by changing the product

1. **`test-twitter-x-oauth-callback:30`** asserts that `/api/x/oauth-diagnostics` is in
   `publicPaths`. It was deliberately removed in commit `a7d7362`. Editing the product to
   satisfy this test would re-open a public diagnostics endpoint. The correct port inverts
   the assertion: prove it is **not** public and that its access decision still gates it.
2. **`test-privacy-route:17`** as above: the fix is to tighten the pattern to credential
   *values*, not to remove the security prose that currently trips it.

## The systemic cause

Twenty of the thirty are source-text greps against the 42,000-line
`scripts/preview-server.mjs`, using a hand-rolled `functionBlock()` boundary regex and
fixed-width `slice(index, index + 260)` windows. Three distinct rot modes appeared: the
function was deleted (`socialPageHtml`, `socialContentCardHtml`, `workPageHtml`,
`proofPageHtml`), the function became a one-line delegate (`productionWorkspaceHtml`), or a
literal string was replaced by a derived helper call (`emailPostureRow`,
`publishingPostureRow`).

**The durable fix is the Founder OS extraction itself.** As each workspace's surface moves
out of the monolith into a module with a real interface, these greps should be replaced by
rendering the surface and asserting on its output, which is what the passing `test-vnext-*`
suites already do.

## Dispositions

**Retire (4)** — the thing they tested no longer exists: `test-every-visible-button-works`
(two of three anchors deleted), `test-founder-language-and-clutter` (all three anchors
deleted), `test-linkedin-readiness` and `test-twitter-x-readiness` (the asserted copy has
zero occurrences anywhere), `test-social-workspace` (superseded by thirteen passing
`test-vnext-social-*` suites).

**Port (26)** — update the assertion to current truth with the reason recorded inline. The
two security-relevant ports above are the highest value; the rest are copy and selector
drift.

**Fix product (0).** Every candidate was checked against actual product behaviour rather
than trusting the test. The `/api/health` minimisation (`d146413`) and the emptying of the
static-token registry (`scripts/access-control.mjs:83`) are both intentional hardening, not
regressions.

## Related finding, not a test failure

`docs/data-storage-audit.md` still names `DATABASE_URL` Postgres the canonical production
storage contract, while `lib/storage/index.mjs:57` disables that adapter for hosted
production in favour of Supabase. That stale document is the source `test-env-contract`
reads from.

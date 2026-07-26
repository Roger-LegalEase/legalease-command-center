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

---

# Execution record — 2026-07-26

Worked on branch `founder-os-hygiene-extended-tests`. Each suite was validated individually
with `node scripts/<suite>.mjs` before moving on. **Start: 30 failures. End: 1 failure.**

The analysis above stands, with two corrections proved during execution:

1. **"Fix product (0)" is now "Fix product (1)".** `/api/x/oauth-diagnostics` returns **500 for
   every owner and admin caller**. `ownerTokenMatched` at `scripts/preview-server.mjs:6590` is an
   undeclared free variable — the only occurrence in the repo is that one read — so the `ok:true`
   branch of `xOAuthDiagnosticsAccessDecision()` throws a `ReferenceError`. Confirmed in the
   server log as `{"status":500,"code":"ReferenceError"}`. The triage above could not see this
   because the suite failed earlier, on authentication, and never reached the bug.
2. **Two of the five retire recommendations were wrong.** `test-linkedin-readiness` and
   `test-twitter-x-readiness` were ported, not retired: only their Production-workspace copy is
   dead, while their App Status, Activation Center and Growth assertions all still hold. Retiring
   them would have thrown away ~30 live assertions, including the live-posting safety negatives.

## Two systemic causes the analysis above under-counted

- **The static token registry was emptied** (`scripts/access-control.mjs:86`, `const registry =
  []`). Every suite that authenticated with an `x-command-center-token` header, or by putting the
  raw bootstrap credential into a `leos_session` cookie, was silently being treated as anonymous.
  This is intentional hardening: bootstrap credentials are accepted only by `POST /api/auth/login`,
  which issues an opaque HttpOnly session plus a CSRF token that state-changing requests echo as
  `x-csrf-token`. Fixed with a shared `loginAtBaseUrl` helper in the test-support harness.
- **`/api/health` was minimised** (`d146413`) to exactly `{status:"ok"}`. Four suites read posture
  fields from it. Every one was inverted to assert the minimisation, because asserting those fields
  would assert that an anonymous caller can enumerate connected accounts, live gates and storage
  config.

## Vacuous assertions found and repaired

These were passing while testing nothing. Repairing them is why some ported suites now have more
assertions than before, not fewer:

| Where | Fault |
|---|---|
| `test-proof-workspace` | `functionBlock()` over-captured past the end of `proofWorkspaceHtml` into `const MORE_DIRECTORY_GROUPS`, a nav catalogue containing "Production" and "RCAP workspace". The forbidden-term negatives were reading a neighbouring function and reporting a leak the Proof workspace does not have. Same fault fixed in `test-ux-emergency-repair` |
| `test-proof-workspace` | Two regexes written with **doubled** backslashes inside regex literals — `/People Helped[\\s\\S]{0,500}\\b\\d+\\b/` — so they matched a literal backslash and could never fire. Same class as the `\s` outage in `client-script-escaping-outage` |
| `test-calendar-readonly-safety` | The three calendar **write-scope** negatives ran against `preview-server.mjs`, which no longer declares any Google scope. Repointed at `scripts/google-workspace.mjs` and extended to `gmail.send` / `gmail.modify` |
| `test-linkedin-readiness`, `test-twitter-x-readiness`, `test-linkedin-connect-button`, `test-connector-readiness` | Safety negatives ("Post Now", "Publish Now", "Send to LinkedIn", `LINKEDIN_CLIENT_SECRET`, `accessTokenEncrypted`) ran against `productionWorkspaceHtml`, now a three-line delegate. Repointed at `productionCommandSurfaceHtml`, with a length guard so they cannot go vacuous again |
| `test-proof-workspace` | Section-order assertions compared `indexOf` results that were `-1` after headings were recased, so they passed vacuously. Each heading's presence is now asserted first |

## Disposition of all thirty

| # | Suite | Disposition | Reason |
|---|---|---|---|
| 1 | `test-activation-center` | ported | "Draft-only" moved into `cockpitEmailDraftWorkflowHtml()`, which the Activation Center interpolates |
| 2 | `test-app-status-recovery` | ported | Literal "Publishing: Off" became the derived `publishingPostureRow()`; asserts call site plus derivation |
| 3 | `test-calendar-readonly-safety` | ported | Google scope list moved to `google-workspace.mjs`; three write-scope negatives had gone vacuous |
| 4 | `test-connector-readiness` | ported | Hardcoded "Email sending is off." replaced by derived `emailPostureLabel()`; Connected Accounts moved to the Activation Center |
| 5 | `test-env-contract` | ported | `DATABASE_URL` deliberately absent from `.env.example`; `PUBLIC_APP_BASE_URL` renamed `APP_BASE_URL`. Required keys now imported from `lib/storage/index.mjs` so they cannot drift |
| 6 | `test-every-visible-button-works` | **retired** | `runAction`, `pendingActions` and every `founder*` handler deleted; covered by passing `test-vnext-today-page`, `-today-view-model`, `-quick-capture`, `-task-workbench` |
| 7 | `test-external-action-outbox` | ported | Demanded a populated outbox table that was never built; card is now an honest empty state. All safety negatives kept |
| 8 | `test-founder-language-and-clutter` | **retired** | Policed a five-item nav that is now six items, and Today copy that no longer exists |
| 9 | `test-held-contact-disposition` | ported | Matched `/co@yahoo/`; `90de797` renamed the fixture to `co@example.com` and missed this regex. Now an exact match |
| 10 | `test-linkedin-connect-button` | ported | Delegate rot plus the Connected Accounts move to the Activation Center |
| 11 | `test-linkedin-oauth-callback` | ported | Static-token auth plus the hardened fail-closed callback contract |
| 12 | `test-linkedin-readiness` | ported (**not** retired) | Dead Production copy dropped; App Status, Activation Center and Growth assertions all still hold |
| 13 | `test-meta-connector` | ported | Static-token auth, CSRF on POST, hardened callback, `/api/health` minimisation |
| 14 | `test-no-filesystem-production-db` | ported | Fail-closed message reworded; asserts message and machine-readable `storageMode` |
| 15 | `test-privacy-route` | ported (**security**) | Word-match replaced by credential value-shape patterns with positive/negative controls |
| 16 | `test-production-hardening-health` | ported | `/api/health` minimised; posture now read from `/api/production/readiness` via a real login session |
| 17 | `test-proof-workspace` | ported | Title Case → sentence case recasing, over-capturing block boundary, two doubled-backslash regexes |
| 18 | `test-public-legal-pages` | ported | Four privacy sentences rewritten; each replaced by the sentence now carrying the same commitment |
| 19 | `test-queue-workspace` | ported | `#queue` retitled "Review Desk"; duplicate Title-Case filter chips replaced by the wizard |
| 20 | `test-rcap-page-usability` | ported | Fixed 260-char window; the alias now sits at offset ~274. Sliced to end of declaration |
| 21 | `test-route-map-integrity` | ported | Alias resolution wrapped in the artifact deep-link ternary; both branches asserted |
| 22 | `test-social-posting-safety` | ported | `claimSocialPublish` moved to `social-publish-service.mjs`/`storage.mjs`; whole claim chain asserted |
| 23 | `test-social-workspace` | **retired** | `socialPageHtml` and all fourteen asserted handlers deleted; covered by twelve passing `test-vnext-social-*` suites |
| 24 | `test-sources-social-calendar-import` | ported | Asserted the pre-Release-1 seven-item nav; ported to the live six-item nav |
| 25 | `test-storage-durability` | ported | Canonical contract is Supabase, not `DATABASE_URL`. Strengthened: `DATABASE_URL` alone must not make production look storable |
| 26 | `test-today-email-followups` | ported | "Email note" absent product-wide; asserts the surviving email→Proof linkage and its no-send guarantee |
| 27 | `test-today-standup-page` | ported | Hardcoded "Rewrite with Le-E" replaced by the Now block's data-driven "Ask Le-E" → `openLeeBubble()` |
| 28 | `test-twitter-x-oauth-callback` | ported + **left failing** | Security inversion done and passing; remainder blocked on the `ownerTokenMatched` ReferenceError. See below |
| 29 | `test-twitter-x-readiness` | ported (**not** retired) | Same as `test-linkedin-readiness` |
| 30 | `test-ux-emergency-repair` | ported | Metrics/KPIs subtitle replaced by per-metric notes; over-capturing block boundary fixed |

Totals: **26 ported, 3 retired, 1 left failing.**

## The two security-relevant ports

**`test-twitter-x-oauth-callback`** — the assertion that `/api/x/oauth-diagnostics` appears in
`publicPaths` was **inverted**, never satisfied. `publicPaths` is the only literal-path list in
`scripts/access-control.mjs`, so the endpoint must not be named there at all:

```js
assert(!accessControlSource.includes("/api/x/oauth-diagnostics"), "Twitter / X OAuth diagnostics must never be named in access-control.mjs; the only literal-path list there is publicPaths (removed in a7d7362)");
assert.notEqual(permissionForRequest("GET", "/api/x/oauth-diagnostics"), "public", "the top-level route gate must not classify Twitter / X OAuth diagnostics as a public path");
assert.notEqual(permissionForRequest("POST", "/api/x/oauth-diagnostics"), "public", "the top-level route gate must not classify Twitter / X OAuth diagnostics writes as public either");
assert(xDiagnosticsRouteBlock.includes("xOAuthDiagnosticsAccessDecision(request)"), "the Twitter / X OAuth diagnostics route must run its owner/admin access decision on the request");
assert(/if\s*\(!\s*diagnosticsAccess\.ok\)/.test(xDiagnosticsRouteBlock), "the Twitter / X OAuth diagnostics route must return early when the access decision denies, before emitting any payload");
assert(xDiagnosticsRouteBlock.indexOf("xOAuthDiagnosticsPayload") > xDiagnosticsRouteBlock.indexOf("diagnosticsAccess.ok"), "the Twitter / X OAuth diagnostics payload must only be built after the access decision passes");
```

Note that the anonymous denial now reports `requiredPermission: "read"`, not `"owner/admin"`:
removing the path from `publicPaths` means anonymous callers are stopped **earlier**, by the
generic route gate, and never reach the route's own decision. That is more protection, not less,
so the runtime assertion was retightened to what matters — the denial must not be `"public"`, and
must leak no diagnostics field.

**`test-privacy-route`** — the pattern was tightened to credential **value shapes**; the honest
security prose it used to flag ("encrypted connector credentials", "Raw credentials … are not
intended for logs", "service role key is server-side only") is untouched and now has explicit
negative controls. Twelve patterns replace `/credential|token value|service role key/i`:

```js
const CREDENTIAL_VALUE_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, "OpenAI-style secret key"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, "Stripe-style key"],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, "SendGrid API key"],
  [/\bwhsec_[A-Za-z0-9]{16,}/, "webhook signing secret"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key block"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT (Supabase anon / service-role key shape)"],
  [/\bpostgres(?:ql)?:\/\/[^\s:@"'<>]+:[^\s@"'<>]+@/i, "Postgres URL with an inline password"],
  [/(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/, "bare high-entropy secret (32+ chars, mixed case and digits)"]
];
```

Applied to both `/privacy` and `/terms`, with a twelve-sample positive-control block and a
four-sample negative-control block so the guard cannot rot into a vacuous one.

Two traps when editing those control samples, both hit during this pass:

- The Postgres sample host must stay on exactly `example.com` (no subdomain), or the repo's
  pre-commit PII gate reads the `user:password@host` segment as a real email address and blocks
  the commit.
- `scripts/test-secret-exposure.mjs` scans every file in the repo and requires any `sk-…` literal
  of 24+ characters to contain `test`, `placeholder` or `redacted`, and any
  a Postgres connection URL carrying an inline password to contain `example`, `placeholder`, `redacted`, `USER` or
  `PASSWORD`. The first draft of the OpenAI-shaped sample did not, which turned
  `test-secret-exposure` red — the one self-inflicted failure of this pass, caught by the final
  extended run and fixed by embedding `placeholder` in the sample.

## Left failing, with the reason

`test-twitter-x-oauth-callback` — one suite, one reason: `GET /api/x/oauth-diagnostics` returns
**500 to every authorized owner and admin** because `ownerTokenMatched` is an undeclared free
variable at `scripts/preview-server.mjs:6590`.

Not ported around, because that would mean encoding a bug as expected behaviour. Not fixed,
because the fix is a product decision, not a hygiene one: the branch that reads the variable
synthesises an owner actor for an *unauthenticated* request —
`{ id:"owner", role:"owner", label:"Owner", authenticated:true, permissions:roleDefinitions.owner.can }`
— so guessing the intended value risks granting owner identity to the wrong caller. It needs
Roger's call.

Everything before that point in the suite is ported and passing, including the security inversion.
The failing assertion states the root cause in its own message, so the next person to run it sees
the bug rather than assuming more test rot:

```
GET /api/x/oauth-diagnostics 500s for every owner/admin caller: `ownerTokenMatched` is an
undeclared free variable at scripts/preview-server.mjs:6590, so the ok:true branch of
xOAuthDiagnosticsAccessDecision throws a ReferenceError. This is a real product bug, not test
rot — see the comment above this assertion.
```

## Two dead-code findings, not fixed

- The friendly OAuth cancel/expired copy at `scripts/preview-server.mjs:35911-35948`
  ("LinkedIn connection was cancelled. Try again from Settings.", "Meta connection expired.", and
  siblings) is **unreachable**. It sits inside the `if (!accessDecision.ok)` branch, but the
  top-level OAuth gate now returns `400 {"error":"OAuth callback rejected."}` for any callback
  without a valid session-bound state before that branch is evaluated. An authorized callback goes
  to the real route handler instead, which returns the sanitized provider error.
- `docs/data-storage-audit.md` still names `DATABASE_URL` Postgres the canonical production storage
  contract (the "Related finding" above). `test-env-contract` no longer depends on that claim —
  it now imports `requiredProductionEnv` from `lib/storage/index.mjs` — but the document is still
  wrong and still says so.

## Execution record — the one real bug, and what happened to it

The triage above concluded **"Fix product (0)"**. That was wrong by one, and the reason it was
wrong is worth more than the count: **the broken test was hiding a live 500.**

`GET /api/x/oauth-diagnostics` returned **500 to every authorized owner and admin** — the only
callers who can reach the relevant line. `ownerTokenMatched` was read at
`preview-server.mjs:6603` and declared **nowhere in the repository**, so in strict-mode ESM the
`ok:true` branch of `xOAuthDiagnosticsAccessDecision()` threw a `ReferenceError`. The original
suite died on authentication before it ever got there, so nobody saw it.

**Fixed, and the fix needed no judgement call.** The branch runs only when `ownerOrAdmin` is
true, and that requires `actor.authenticated === true`; the removed condition tested
`!actor.authenticated`, which is therefore necessarily false. The ternary was unreachable on its
own terms, so deleting it changes no behaviour that could ever have occurred and invents no
identity — `actor` is the owner or admin the access decision already validated. That reachability
argument is what made it safe to fix rather than escalate.

**The lesson for the remaining twenty-nine, and for the next batch:** a suite that fails early
proves nothing about the code after the failure point. "0 real bugs" was a statement about what
the tests could see, not about the product. Re-running each ported suite individually is what
surfaced this.

### Still failing after the pass: `test-twitter-x-oauth-callback`

Left failing deliberately, with the cause understood and NOT papered over.

The suite expects an unauthenticated OAuth callback with a bad state to produce a friendly 302
back to Settings. It gets **400 `{"error":"OAuth callback rejected."}`** from a hardened global
guard at `preview-server.mjs:35849-35855`, which requires **both** an authenticated session and a
verified owner-started state before any provider route runs, and additionally consumes the state
nonce single-use.

That guard is deliberate CSRF hardening and **must not be relaxed to make a test pass** — the
same trap the `publicPaths` case in this document warns about. The consequence is a genuine
dead-code finding: the friendly "Twitter / X connection expired" copy inside the provider route
(`preview-server.mjs:41060`) is **unreachable in every bad-state case**, because the guard rejects
those requests before the route executes.

Porting it honestly means either asserting the 400 (which loses the success-path coverage) or
minting two separate session-bound states so the single-use nonce is not exhausted. The second is
correct and is more than a test edit; it is left for whoever next touches that route, with this
note so the reason is not rediscovered.

**This failure is pre-existing on main and therefore does not move the differential gate**, which
fails only on failures new versus the merge base.

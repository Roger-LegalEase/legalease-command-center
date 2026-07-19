# CCX-310 Social acceptance accounting

## Audit result

Current `main` contained the authoritative atomic safety and projection checks for every Social packet, but it did not contain the complete ten-step CCX-310 browser acceptance workflow. Most CCX-303 through CCX-308 evidence is intentionally pure, read-only `A`-packet foundation coverage. This packet adds only deterministic acceptance accounting and a test-only browser fixture. It changes no production runtime, endpoint, route, page, publishing gate, authority rule, provider adapter, or stored collection.

## Coverage matrix

| # | Required workflow | Existing test and fixture | Existing assertion | CCX-310 completion |
| --- | --- | --- | --- | --- |
| 1 | Add an idea and turn it into a Post | `tests/browser/quick-capture.spec.mjs`, Today synthetic fixture | One inert Post idea and exact Open link | Same canonical ID moves from Idea to Draft |
| 2 | Create a Post from a template | `scripts/test-vnext-social-creative-catalog.mjs`, synthetic catalog | Exact authorized template identity only | One inert Post stores exact `selectedTemplateId` |
| 3 | Select Wilma and a brand asset | Creative catalog synthetic approved assets | Exact source references; no hidden or missing substitution | Exact Wilma and logo IDs persist |
| 4 | Trigger and resolve a guideline failure | `scripts/test-vnext-social-readiness.mjs`, hard-failure fixture | Outcome promise is blocking and founder-facing | Browser fixture remains blocked until safe copy and explicit passing gate |
| 5 | Render without silent asset substitution | `scripts/test-social-guidelines-gate.mjs` plus creative catalog | Render/asset integrity stays hard | Missing requested asset creates no image; exact selected assets render |
| 6 | Add LinkedIn and Instagram variants | `scripts/test-vnext-post-channel-variants.mjs` | Independent stored variants; deselection is nondestructive | Both exact variants are stored and reprojected |
| 7 | Schedule the Post | `scripts/test-vnext-post-schedule-plan.mjs`, synthetic schedule projection | Exact stored schedule remains distinct from publication | Browser fixture stores exact time and timezone |
| 8 | Move it on the calendar | `scripts/test-vnext-post-schedule-plan.mjs`, synthetic schedule projection | Schedule is exact and separate from publication | One date change and one audit record; zero publications |
| 9 | Publish manually without credentials | `scripts/test-vnext-post-publishing-controls.mjs`, gate-off fixture | Manual fallback is explicit and non-executable | One manual package, zero provider calls, no false Published state |
| 10 | Prove gated live publish cannot double-post | `scripts/test-social-publish-claims.mjs`, two temporary stores racing for one claim | Exactly one contender acquires the durable claim; ambiguous reconciliation cannot publish | Repeated browser action reuses per-channel claims and never calls the injected adapter twice |

The machine-readable accounting is `scripts/social-acceptance-coverage.mjs`. `scripts/test-vnext-social-acceptance.mjs` verifies the mapped evidence remains present and executes the joined synthetic workflow. `tests/browser/social-acceptance.spec.mjs` exercises the same contract through accessible browser controls.

## Safety boundary

The fixture starts with no credentials, no connected accounts, and every live gate off. Manual publishing creates informational package truth only. The gated test path is unavailable without an explicitly injected function supplied by the test. That function has no provider or network implementation. Durable synthetic claims are keyed by exact Post, channel, and idempotency key before the injected adapter can run, so repeating the browser action cannot double-post.

No production code consumes the fixture. Synthetic records use stable non-production IDs and contain no personal data. The tests perform no full-state browser read or write, provider request, credential read, environment-gate mutation, analytics refresh, schedule execution, or external action.

## Defects and corrections

The audit found an acceptance-accounting gap, not a production runtime regression: atomic packet tests existed, but their relationship to the ten CCX-310 workflows was implicit and browser transitions were absent. The new aggregator and browser workflow make that relationship executable and explicit. No production defect was corrected and no publishing behavior changed.

The older `scripts/test-scheduled-publishing.mjs` is not used as an acceptance anchor because unchanged `main` currently reaches its known baseline `401` under the hardened authentication contract. CCX-310 does not alter that baseline test or the extended failure set. Current passing schedule-plan and durable-claim tests provide the authoritative atomic evidence instead.

## Limitations

This packet proves the joined contract with synthetic test-only actions. CCX-303A, CCX-304A, CCX-305, CCX-306A, CCX-307A, and CCX-308A remain read-model foundations as documented. Their separately reviewed `B`-packet production composer controls are outside CCX-310 and are not fabricated by this acceptance fixture. Therefore the safety and acceptance accounting is explicit, but the full Phase 3 production-workspace exit criterion remains dependent on those production integrations.

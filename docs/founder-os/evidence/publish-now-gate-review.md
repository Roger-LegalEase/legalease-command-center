# Publish Now live-gate review — evidence at current HEAD

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

- **Collected at:** `a3793c3156bc2c866dbd1f65e0ec420ae2352554`, 2026-07-23.
- **Question:** does the manual Publish Now path re-check `livePostingEnabledForChannel`, or is the gap found at e620bde still open?

## Verdict: GAP STILL OPEN

At current HEAD, the manual `POST /api/posts/{id}/publish-now` path publishes to the live
provider without ever consulting the per-channel live-posting environment gate
(`livePostingEnabledForChannel`). The scheduled publisher enforces that gate; the manual
path omits exactly that block. The e620bde audit finding is unremediated.

## Evidence

All symbols live in `scripts/preview-server.mjs`.

**The gate itself** — `scripts/preview-server.mjs:702`:

```js
function livePostingEnabledForChannel(channel) {
  return (livePostingEnvKeys[channel] || []).some((key) => process.env[key] === "true");
}
```

**Manual path (gate absent):**

- Frontend `publishNow(id)` button → `POST /api/posts/{id}/publish-now` (`scripts/preview-server.mjs:34699`, `:34715`).
- Route handler at `scripts/preview-server.mjs:41323–41336` applies only RBAC (`authorizeRequest`, `:35755`) then calls `publishPostNow`.
- `publishPostNow` (`scripts/preview-server.mjs:5801–5910`): its only preflight is `publishReadiness` (`:5814`), then an idempotency claim (`acquireSocialPublishClaim`, `:5836`), then the real provider POST via `publishToChannel` (`:5864`). No `livePostingEnabledForChannel` call anywhere on this path.
- The bypass is explicit: `publishReadiness` (`:1869–1916`) calls `channelReadinessDetails(state, post, { requireLiveGate: false })` at `:1890`, and `channelDryRun`'s live-gate check is `ok: !requireLiveGate || result.livePostingEnabled` (`:4635`) — forced `true` when `requireLiveGate` is false.
- `publishToChannel` (`:5353–5360`) dispatches straight to the provider functions (e.g. `publishLinkedInPost` at `:5131`), which check only token/account presence.

**Scheduled path (gate enforced), for contrast** — `runPublishingWorker` (`scripts/preview-server.mjs:5565`), gate at `:5625–5660`:

```js
if (!livePostingEnabledForChannel(channel)) {
  ...
  publishingStatus: "blocked_live_gate",
  ...
  continue;   // never reaches acquireSocialPublishClaim / publishToChannel
}
```

**Gates that ARE present on the manual path** (so the finding is scoped precisely):
approval-state check (status must be `approved|scheduled|publishing|retry_ready`, `:1873`),
high `complianceRisk` block (`:1876`), finalized image / confirmed preview (`:1881`, `:1884`),
channel dry-run OAuth + account-connected + caption/length checks (`:4636–4664`),
`scheduledFor` present (`:1907`), route RBAC, and the publish idempotency claim.
`socialGuidelinesGate` runs on draft/update flows (`:2145`, `:2242`, `:2871`, `:2925`), not
inside `publishPostNow` — but posts cannot reach `approved` without passing it.
The single missing gate versus the scheduled worker is `livePostingEnabledForChannel`.

**Parallel copy:** `social-clean/scripts/preview-server.mjs` replicates the same gap
(manual path at `:5569–5622`, `requireLiveGate: false` bypass at `:1735`, scheduled gate at
`:5407`). That copy is older — its `publishPostNow` lacks the `acquireSocialPublishClaim`
idempotency machinery entirely.

## Practical exposure today

The pipeline is dormant: no channel's live-posting env keys are set to `"true"` in
production, and the charter defines manual posting (copy/export) as the product. The
exposure is that Publish Now, clicked with provider OAuth configured, would post live even
with every live-posting flag off.

## Consequence for the Founder OS package

- The audit-fixes PR listed as a Release 1 precondition in `../08_DELIVERY_PLAN.md` must close this gap (make `publishPostNow` enforce `livePostingEnabledForChannel` the way `runPublishingWorker` does) **before** any future activation of live posting.
- Per `../workspaces/campaigns.md`, the new Campaigns surface must not inherit this gap: any Publish Now affordance it exposes must call the same gate the scheduled worker calls.
- This document records the finding only; the fix is explicitly out of scope for the documentation PR.

---

## Status update 2026-07-23 — per-channel gap CLOSED by PR #113

Everything above is preserved as the historical record; it describes the code before
PR #113 (branch `audit-fixes-01`, gate fix commit `8373e97`, branch tip `0beb01e`).

**The fix.** `publishPostNow` now enforces the gate itself: immediately after the
`publishReadiness` check and **before** `acquireSocialPublishClaim` and
`publishToChannel`, it calls `livePostingEnabledForChannel(channel)`; when the channel's
flag is off it records `publishingStatus: "blocked_live_gate"`, writes a publish event
with `errorCode: "live_gate_disabled"` (identical to the scheduled worker's block), and
rejects without creating a claim or touching the provider. The route response surfaces
`errorCode`.

**The test.** `scripts/test-publish-now-live-gate.mjs` (auto-discovered by
`test:extended`) proves three layers: (1) source order — the gate call precedes the
claim and provider calls; (2) behavior — `publishPostNow` in a vm sandbox with the real
gate code blocks when the channel's flag is off *even when a different channel's flag is
on* (the exact residual hole), and publishes via a mock provider when on; (3) HTTP — the
endpoint-hardening layer still 403s the route outright.

**Correction to the original analysis.** The route-level review above ("applies only
RBAC") missed `guardForbiddenEndpoint` (`scripts/auth-endpoint-hardening.mjs`): its
`publish-post` rule 403s `POST /api/posts/:id/publish-now` **unconditionally** — the
route was never reachable over HTTP, with any gate value. Its reason string falsely
claimed the block applied "while live gates remain 0"; a truth-only comment/reason fix
ships in the follow-up test-fixes PR. The in-function per-channel gate from #113 is the
second enforcement layer for if that shield is ever deliberately relaxed.

**Practical-exposure correction (2026-07-23).** The "pipeline is dormant: no channel's
live-posting env keys are set to `true` in production" claim above is **no longer true**:
production `/api/version` reported `liveGatesCount: 5` on 2026-07-23 — all five
channels' live-posting env flags are enabled in the prod environment (render.yaml says
`"false"`; the dashboard values differ). The unconditional hardening 403 (and absent
provider OAuth) are what currently stand between the scheduled worker/Publish Now and a
live post. Owner decision needed on whether those flags should be returned to off.

**Merge status at refresh time:** PR #113 was still OPEN and production ran `a3793c3`
(pre-fix). The gap is closed in code on `audit-fixes-01`; it is closed on main only once
#113 merges.

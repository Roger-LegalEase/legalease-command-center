# Safety gates — re-verification at current HEAD

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

- **Collected at:** `a3793c3156bc2c866dbd1f65e0ec420ae2352554`, 2026-07-23.
- **Purpose:** re-verify that the three enforcement points from the e620bde inspection still exist as **blocking code** (throw / HTTP 400–403 / non-zero exit), not config or comments.

**Verdict: all three enforcement points are present and blocking at current HEAD.**

## 1. Send approval layers — outreach, reactivation, and dispatcher blocks

### scripts/outreach-os.mjs (B2 partner outreach)

- **Live-send gate, fail-closed, default OFF** — `outreachLiveSendEnabled` (`scripts/outreach-os.mjs:104–107`) requires `OUTREACH_LIVE_SEND` truthy; `resolveOutreachSendDecision` (`:434–451`) returns `status: "dry_run"` unless the flag AND `SENDGRID_API_KEY` are both present — only `status: "live"` authorizes a network send.
- **Queue-then-approve** — `planOutreach` never sends; it queues `status: "queued_for_approval"` (`:609`). `actOutreach` processes only items with `status === "approved"` (`:656`).
- **Suppression, enforced twice** — `isSuppressed` (`:145–178`, 8 reasons: do_not_contact, replied, unsubscribed, bounced, existing_customer, manually_suppressed, bad_domain, duplicate) is checked at queue time (`:577`) and re-checked at send time (`:681–685`, blocked + queue rejected).
- **Atomic send claims, fail-closed** — deterministic `outreachClaimId` (`:62–63`); in `actOutreach` (`:709–765`): an existing claim in any state blocks the send (`:721–725`); if no claim path is available the send is refused (`:726–731`, `no_claim_path`); a lost concurrent claim skips; a send error marks the claim `failed` permanently with no silent retry (`:780–792`).
- **Send-time re-checks** — classification routing (`:689–694`), compliance (`:696–701`), caps (`:703–707`).

### scripts/reactivation-os.mjs (consumer reactivation)

- **Live-mode gate + kill switch** — `reactivationLiveSendEnabled` (`scripts/reactivation-os.mjs:62–66`, env `REACTIVATION_LIVE_SEND`, default OFF); the kill switch overrides everything in `resolveReactivationSendDecision` (`:146–148`, returns `dry_run` with `reason: "kill_switch"`). `status: "live"` requires owner live-mode authority AND the SendGrid key AND an active campaign AND thresholds not tripped AND inside the sending window (`:149–164`).
- **Wave release is a human gate** — contacts are inert until `releaseWave` enrolls them (`:369–388`); `autoAdvanceWaves` defaults false (`:240`); suppressed/held contacts are never bucketed (`:311`).
- **Suppression re-checked at send time** — import (`:263`, `:291`), assignment (`:311`), release (`:375`), and send (`:762`, skip `held_suppressed_or_paused`).
- **Durable send claims, fail-closed** — `reactivationClaimId` (`:52–53`); `actReactivation` (`:804–848`): existing claim blocks (`:808–811`), missing claim path fails closed (`:812–816`), claim write failure means no send (`:836–840`), concurrent loss skips (`:841–845`).
- **Threshold auto-pause before sending** — defaults `hard_bounce: 0.02, spam_complaint: 0.001, unsubscribe: 0.025` (`:226`); `evaluateThresholds` (`:449–461`); a trip pauses the campaign and returns without sending (`:733–737`).

### Dispatcher blocks

- Reactivation SendGrid dispatcher throws on non-OK provider responses — `scripts/preview-server.mjs:5491–5504`.
- Alert email dispatcher hard-locks the recipient to the owner — `scripts/preview-server.mjs:5513–5518` (`recipient_not_owner_locked`).
- Publishing worker blocks per channel on readiness failure and on the live-posting gate — `scripts/preview-server.mjs:5586–5658` (`live_gate_disabled` → `continue`, never reaches the provider). The manual Publish Now path is the exception — see `publish-now-gate-review.md`.
- Prospect discovery is gated behind `PROSPECT_LIVE_DISCOVERY`; flag off returns zero rows with no I/O — `scripts/preview-server.mjs:5546–5563`.
- Outreach executor `not_sent` results are honored: no send is recorded and the queue item is rejected (`scripts/outreach-os.mjs:772–778`).

## 2. socialGuidelinesGate and renderQaForGeneratedImage

### socialGuidelinesGate — defined `scripts/preview-server.mjs:11217–11267`

Returns `{ passed: hardFails.length === 0, hardFails, ... }` (em-dashes, AI-phrase tells, outcome promises, dignity/person-first language, banned imagery, UPL sign-off, untraced numbers).

Blocking call sites:

| Call site | Behavior on hard fail |
|---|---|
| `preview-server.mjs:2871–2874` — `updateApprovalItem` approve | **throws** ("Guidelines hard fail - cannot approve") |
| `preview-server.mjs:5379–5382` — schedule path | **throws** ("Guidelines hard fail - cannot schedule") |
| `preview-server.mjs:41425–41432` — `/api/posts/update` direct approve | **returns HTTP 400** with `guidelinesHardFails` |
| `preview-server.mjs:2925–2929` — batch approve | failing item skipped and reported blocked |
| `preview-server.mjs:11938–11939` — `autoRenderNewPosts` | render skipped (`continue`) |

Advisory (non-blocking) stamps at `:2145`, `:2242`, `:9898` annotate drafts. Note the gate
runs at approve/schedule time, not inside `publishPostNow` — a post cannot reach an
approvable status without passing it.

### renderQaForGeneratedImage — defined `scripts/preview-server.mjs:11341–11430+`

Overlay-verbatim vs approved copy, corruption patterns, spelling, legibility caps
(headline >90 / support >220 chars), text-free/no-logo/palette prompt locks, brand-mark
leakage, Wilma compositing checks.

Blocking call site: `generateImageForPost` (`preview-server.mjs:12096–12108`) — a
QA-failed image is stored `qa_failed` and never becomes a usable draft; the approve path
returns **HTTP 400** when the latest image is `qa_failed`/`failed`/`renderQa.passed ===
false` (`preview-server.mjs:41437–41439`).

## 3. Manual deploy + prod commit gate

- `render.yaml:9` and `render.yaml:83` — `autoDeploy: false` on both services. Production only changes via manual promote.
- `scripts/prod-commit-gate.mjs` — `evaluateCommitGate` (`:28–60`) passes only when the prod commit equals the required commit, is an approved commit, or contains the required commit as an ancestor (`git merge-base --is-ancestor`, `:65`). Blocks via exit code: usage error `exit(2)` (`:84–87`), unreachable prod `exit(1)` (`:89–92`), final `process.exit(allOk ? 0 : 1)` (`:108`). Also asserts `authProtected === true` and `supabaseConnected === true` from `/api/version` (`:94–97`). Read-only — it only GETs `/api/version` and queries local git.

## Supporting protections (cited by 06_SAFETY_AND_AUTOMATION_CONTRACT.md)

- **CSRF protection** — state-changing requests require matching origin + valid CSRF token or 403 (`scripts/preview-server.mjs:35924–35933`); tokens issued at login (`:35751`); client attaches `x-csrf-token` on non-GET (`:19114`, `:19170`). Exempt: login, SendGrid webhook, product events, cron/local actor (`:35921–35923`).
- **Server-side authorization** — `authorizeRequest` gates every request (`scripts/preview-server.mjs:35755`; denials 401/403 at `:35811–35813`, `:35735`); owner token compared timing-safe (`scripts/session-auth.mjs:49`, `:57`, `:137`).
- **CAN-SPAM validation** — `assembleCompliantMessage` is the only message builder and throws without postal address/from (`scripts/outreach-os.mjs:302`, `:307`); `validateCompliance` hard-fails on missing postal/from/subject, deceptive subject, missing `List-Unsubscribe`, missing one-click, missing unsub link, address-not-in-body (`:404–416`).
- **Sending windows** — `withinSendingWindow` blocks weekends and enforces ET business hours (`scripts/outreach-os.mjs:471–475`); enforced in `capCheck` (`:496`) and reactivation decisions (`scripts/reactivation-os.mjs:160–162`).
- **Volume caps** — `capCheck` blocks on `daily_cap`, `per_domain_cap`, `per_classification_cap` (`scripts/outreach-os.mjs:495–503`); reactivation `perWaveDayCap: 1400` (`scripts/reactivation-os.mjs:210`, `:646`).
- **Provider signature verification** — SendGrid webhook: ECDSA P-256/SHA-256 over timestamp+rawBody, fail-closed when unconfigured or invalid (`scripts/sendgrid-webhook.mjs:56–85`); endpoint rejects 401 (`scripts/preview-server.mjs:38362–38366`), rate-limits 429 (`:38351`), replay-claim dedupe (`:38372–38374`).
- **No secrets in browser payloads** — `scripts/test-secret-exposure.mjs:39`, `:42` asserts client source contains no secret env values or names.

## Focused gate tests present at this HEAD

`scripts/test-outreach-os.mjs`, `test-outreach-claims.mjs`, `test-reactivation-os.mjs`,
`test-reactivation-claims.mjs`, `test-reactivation-live-mode.mjs`,
`test-social-guidelines-gate.mjs`, `test-sendgrid-webhook.mjs`,
`test-webhook-http-security.mjs`, `test-owner-token-auth.mjs`,
`test-secret-exposure.mjs`.

---

## Post-#113 delta — 2026-07-23

Everything above is preserved as collected at `a3793c3`. The audit-fixes work landed as
PR #113 (branch `audit-fixes-01`, tip `0beb01e`; still OPEN/unmerged at refresh time —
verify merge before relying on main). Changes relevant to this file:

- **Publish Now live gate — CLOSED.** `publishPostNow` now enforces the per-channel
  `livePostingEnabledForChannel` check before the publish claim and the provider call
  (`errorCode: "live_gate_disabled"`, matching the scheduled worker), with
  `scripts/test-publish-now-live-gate.mjs` proving off-blocked / on-allowed. The
  "manual Publish Now path is the exception" caveat in §1 no longer applies once #113
  merges — see `publish-now-gate-review.md` dated update, including the correction that
  the endpoint-hardening layer 403s the route unconditionally.
- **sharp CVEs — resolved.** `sharp` pinned exactly at `0.35.3` (libvips
  CVE-2026-33327/-33328/-35590/-35591 fixed); no API accommodations were needed and the
  render QA suites pass unchanged.
- **Node pinned.** `"engines": { "node": "24.x" }` in package.json and
  `NODE_VERSION=24.x` on both render.yaml services, matching the Node 24.14.1 observed
  in production deploy logs (previously floating on Render's default).
- **PII contained.** The four `suppression_*.csv` exports and both MVP-user workbooks
  moved from the repo root into gitignored `data/private/`; a pre-commit gate
  (`scripts/pre-commit-pii-gate.mjs` via `.githooks/pre-commit`, activated per clone by
  `npm run hooks:install`) blocks staged suppression exports and email addresses in
  CSV/XLSX content, reusing the security-scan tooling. **CI enforcement is proposed**
  (recorded in `../08_DELIVERY_PLAN.md`) so the protection stops depending on per-clone
  hook installation.
- **Production observation (owner attention):** on 2026-07-23 production `/api/version`
  reported `liveGatesCount: 5` — all five live-posting env flags enabled in the prod
  environment, contradicting render.yaml's `"false"` values and the dormant-pipeline
  assumption above. It also reported `supabaseConnected: false` at that moment. Neither
  is changed by #113; both are owner decisions.

# 06 — Safety and Automation Contract

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

All enforcement references below were re-verified at `a3793c3` — see
`evidence/safety-gates.md` for quoted code.

## Confirmation policy

### Actions requiring no confirmation

These are internal, reversible, and must never trigger a prompt:

- Complete an internal task
- Add a note
- Set a follow-up date
- Change priority
- Mark waiting or blocked
- Save a draft
- Update an internal relationship stage
- Record a manually sent email

### Actions requiring exactly one confirmation

One clear confirmation — never two, never zero:

- Send an external email
- Start a live campaign
- Release a new audience
- Remove suppression
- Publish content
- Delete important information

## The four decisions

Distinguish these four decisions:

1. **Approve content** — this copy may exist and be used.
2. **Release audience** — these people may be contacted.
3. **Run campaign** — the machine may work through the released audience.
4. **Send message** — this one message goes out now.

The simplified interface may make them understandable but must never collapse their
safety semantics. Today these are physically separate mechanisms: content approval is the
approval queue + `socialGuidelinesGate` / outreach `review_state: "approved"`; audience
release is `releaseWave` (`scripts/reactivation-os.mjs:369–388`); running is the
live-mode/autopilot authority (`resolveReactivationSendDecision`,
`scripts/reactivation-os.mjs:146–164`; `resolveOutreachSendDecision`,
`scripts/outreach-os.mjs:434–451`); sending is the per-message claim + dispatcher.
Renaming them for founders (see `workspaces/campaigns.md`) changes language only.

## Non-negotiable existing protections

Each with its enforcement reference from `evidence/safety-gates.md`:

| Protection | Enforcement |
|---|---|
| Server-side authorization | `authorizeRequest` gates every request (`scripts/preview-server.mjs:35755`; 401/403 at `:35811–35813`); owner token compared timing-safe (`scripts/session-auth.mjs:49,57,137`) |
| CSRF protection | Matching origin + valid CSRF token or 403 (`scripts/preview-server.mjs:35924–35933`); tokens issued at login (`:35751`) |
| Suppression checks | `isSuppressed`, 8 reasons (`scripts/outreach-os.mjs:145–178`); enforced at queue AND send time (`:577`, `:681–685`); reactivation re-checks at import/assign/release/send (`scripts/reactivation-os.mjs:263,291,311,375,762`) |
| Reply stop rules | `replied` is a suppression reason (`scripts/outreach-os.mjs:145–178`) — a reply stops the sequence |
| CAN-SPAM validation | `assembleCompliantMessage` throws without postal/from (`scripts/outreach-os.mjs:302,307`); `validateCompliance` hard-fails on missing unsubscribe/one-click/postal-in-body (`:404–416`) |
| Sending windows | `withinSendingWindow` — ET business hours, no weekends (`scripts/outreach-os.mjs:471–475`; reactivation `scripts/reactivation-os.mjs:160–162`) |
| Volume caps | `capCheck` — daily / per-domain / per-classification (`scripts/outreach-os.mjs:495–503`); reactivation `perWaveDayCap: 1400` (`scripts/reactivation-os.mjs:210,646`) |
| Durable send claims | Atomic insert on `outreachSendClaims` / `reactivationSendClaims` before any live send; missing claim path fails closed (`scripts/outreach-os.mjs:709–765`; `scripts/reactivation-os.mjs:804–848`); append-only (`scripts/storage.mjs:231`) |
| Threshold auto-pause | hard_bounce 2% / spam 0.1% / unsubscribe 2.5% defaults; trip pauses before sending (`scripts/reactivation-os.mjs:226,449–461,733–737`) |
| Manual production deployment | `render.yaml:9,83` `autoDeploy: false`; `scripts/prod-commit-gate.mjs` ancestor rule, non-zero exit on failure (`:28–60,108`) |
| Provider signature verification | SendGrid webhook ECDSA verification, fail-closed (`scripts/sendgrid-webhook.mjs:56–85`; 401 at `scripts/preview-server.mjs:38362–38366`) |
| No secret exposure | `scripts/test-secret-exposure.mjs:39,42` — no secret env values or names in browser payloads or outbound HTML |
| Content gates | `socialGuidelinesGate` throws on approve/schedule, 400 on direct approve (`scripts/preview-server.mjs:2871–2874,5379–5382,41425–41432`); `renderQaForGeneratedImage` blocks QA-failed images from approval (`:12096–12108,41437–41439`) |

## Automation posture

- Every heartbeat engine's `act()` runs only when its autopilot toggle is ON; all default
  OFF (`autopilotEnabled`, `scripts/heartbeat.mjs`). Several engines are plan-only with
  no `act()` at all (codebase health, engagement growth, operating loops, inbox
  intelligence, company memory projector).
- Inbox intelligence reads Gmail only when its toggle is ON, is bound to the single
  authorized mailbox, is read-only scoped (`gmail.readonly`), and has **no send route** —
  drafts never send (`scripts/inbox-intelligence.mjs`; `scripts/preview-server.mjs:12968`,
  `:38031`).
- Le-E is propose-only: internal action proposals execute through the existing approval
  path; it drafts but does not send.
- The Automation Control Center is structurally read-only (`AUTOMATION_REVIEW_POSTURE`
  frozen `reviewOnly: true`, `scripts/automation-control-center-service.mjs`).

## The relocation invariant

**Any new or relocated route that approves, schedules, sends, or publishes must call the
same existing gate functions** — `socialGuidelinesGate`, `renderQaForGeneratedImage`,
`resolveOutreachSendDecision`, `resolveReactivationSendDecision`, `isSuppressed`,
`validateCompliance`, `withinSendingWindow`, `capCheck`, the claim primitives
(`claimCollectionItems` on the send-claim ledgers), and `livePostingEnabledForChannel` —
never copies, wrappers that weaken semantics, or re-implementations.

Passing gate tests (`test-social-guidelines-gate.mjs`, `test-outreach-claims.mjs`,
`test-reactivation-claims.mjs`, `test-reactivation-live-mode.mjs`,
`test-sendgrid-webhook.mjs`, `test-owner-token-auth.mjs`, and the suites listed in
`evidence/safety-gates.md`) are **required before any superseded route is retired**.

Known inherited defect the invariant must not replicate: the manual Publish Now path
skips `livePostingEnabledForChannel` (`evidence/publish-now-gate-review.md`). Any new
Campaigns surface exposing Publish Now must enforce that gate; closing the gap on the
existing route is a documented Release 1 precondition in `08_DELIVERY_PLAN.md`.

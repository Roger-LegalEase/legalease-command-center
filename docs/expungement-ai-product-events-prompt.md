# Prompt: wire Expungement.ai product events to the LegalEase Command Center

You are working in the Expungement.ai product repo. Your task is to emit signed
product analytics events to the LegalEase Command Center so its conversion
funnel (web visits, screenings started, reached checkout, paid) reflects real
product activity. The receiving side is already live and verified; nothing on
the Command Center side needs to change.

Verified receiver facts (checked 2026-07-09 against the live server): the
endpoint exists, HMAC auth is armed, events auto-apply to the funnel on
receipt, and replayed events are deduplicated server-side. As of that date the
Command Center has never received a single product event, so this is a fresh
wire-up, not a repair.

## Endpoint

```
POST https://legalease-command-center-prod.onrender.com/api/events/product
Content-Type: application/json
```

## Authentication: HMAC (the configured option)

The emitter signs every request with the shared secret. In this product repo
the secret should already exist as the emitter-side config named
LEGALEASE_OS_EVENTS_SECRET (with LEGALEASE_OS_EVENTS_ENDPOINT and
LEGALEASE_OS_EVENTS_ENABLED alongside it). If the secret is absent here, stop
and ask Roger for it; do not mint a new one, because the receiver validates
against its own copy.

Per request:

1. `timestamp` = current unix seconds (or any string; it is bound into the
   signature, the receiver does not enforce freshness).
2. `signature` = lowercase hex HMAC-SHA256 over the exact string
   `"<timestamp>.<rawRequestBody>"` keyed with the secret. rawRequestBody must
   be byte-identical to what is sent; sign after serialization, never
   re-serialize after signing.
3. Headers:

```
X-Legalease-OS-Timestamp: <timestamp>
X-Legalease-OS-Signature: sha256=<hex>
```

A bad or missing signature gets a 4xx and changes nothing. Replay protection
is NOT timestamp-based; it is identity-based (see sourceEventId below), so
retries of the same event are safe and encouraged on network failure.

## Event body

```json
{
  "eventType": "expungement_intake_started",
  "product": "expungement_ai",
  "anonymousId": "<stable per-user-or-session opaque id>",
  "timestamp": "<ISO 8601 of when the event happened>",
  "campaignSlug": "",
  "partnerId": "",
  "state": "",
  "source": "",
  "metadata": {}
}
```

Field rules:

- `eventType` is required and must be one of the supported types below;
  anything else is rejected.
- Identity: send `anonymousId` (opaque, stable). You may send `userId`
  instead; the receiver records only WHETHER a userId was present, never the
  value. Never send email, name, phone, or case details anywhere in the
  payload; `metadata` is PII-redacted on receipt by key-name matching, so keep
  it to counts and amounts.
- Dedupe identity: the receiver deduplicates on
  `(product, eventType, userId-or-anonymousId, timestamp, campaignSlug)`.
  Fire each real occurrence with its own timestamp; retry an unacknowledged
  send with the SAME timestamp so it can never double-count.
- `metadata.amount` (integer, cents preferred) on `payment_completed` records
  revenue; amounts over 1000 are treated as cents and divided by 100.
- `campaignSlug` and `partnerId` are optional attribution; include when known.

## Events to instrument, in priority order

| Product moment | eventType | Scoreboard effect |
|---|---|---|
| Landing page rendered | `landing_page_viewed` | Web visits |
| User starts the expungement intake / screening | `expungement_intake_started` | Screenings started |
| User reaches checkout / payment form | `payment_started` | Reached checkout |
| Payment succeeds | `payment_completed` (with `metadata.amount`) | Paid + funnel revenue |

Also supported when convenient: `campaign_cta_clicked`,
`recordshield_user_created`, `recordshield_check_started`,
`recordshield_check_completed`, `recordshield_result_viewed`,
`cleanup_cta_clicked`, `packet_generated`, `packet_completed`,
`petition_filed`, `outcome_known`.

## Implementation requirements

1. Emit from the SERVER side of the product, not the browser, so the secret
   never ships to clients.
2. Fire-and-forget with a short timeout (2 to 5 seconds) and a bounded retry
   (same body, same timestamp); never block or fail a user-facing request on
   emitter errors.
3. Gate the emitter behind LEGALEASE_OS_EVENTS_ENABLED so it can be switched
   off without a deploy.
4. Log emitter failures quietly (status code only, never the body or secret).

## Verification once wired

Send one real staging-or-dev signed event, then confirm:

- The POST returns 2xx with `"autoApplied": true` in the response body for
  funnel metric events.
- Ask Roger (or whoever operates the Command Center) to confirm the Today
  scoreboard funnel moved by exactly the events sent. Counts are honest: the
  scoreboard shows real events only, so a test event DOES count toward the
  live funnel. Prefer verifying with one `landing_page_viewed` (lowest-stakes
  metric) rather than payment events, and note in the handoff exactly how many
  test events were sent so they can be accounted for.

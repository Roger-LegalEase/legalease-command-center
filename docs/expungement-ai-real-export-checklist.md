# Expungement.ai Real Export Checklist

## Purpose

Use this checklist to export a real Expungement.ai lifecycle CSV for Command Center preview QA.

The preview step is read-only. It should confirm that the live sync mapper understands the real export shape before any lifecycle records, lifecycle events, reactivation contacts, suppressions, emails, waves, gates, or autopilot settings are touched.

Do not run confirm until preview QA passes.

## Where To Export From

Export from the Expungement.ai system or data tool that contains user lifecycle and marketing consent/status fields.

Use the export that represents lifecycle activity, not raw legal case data, packet data, document uploads, payment card data, or Wilma conversation transcripts.

## Safe Column List

Include these columns when available:

```csv
email,first_name,full_name,phone,state,jurisdiction,lifecycle_stage,screening_status,checkout_status,payment_status,dropoff_step,source_record_id,last_seen_at,consent_status,consent_captured_at,privacy_version,unsubscribed,bounced,complained,do_not_contact,deleted_or_erasure_requested,utm_source,utm_campaign,referrer
```

Recommended column definitions:

| Column | Use |
| --- | --- |
| `email` | Required for matching and preview classification. |
| `first_name` | Optional safe personalization field. |
| `full_name` | Optional fallback for first name only. |
| `phone` | Optional contact field; do not use for sending in this QA. |
| `state` | State detected from user profile or screening flow. |
| `jurisdiction` | County, court area, or jurisdiction label if safe and operational. |
| `lifecycle_stage` | Preferred canonical stage when available. |
| `screening_status` | Used to infer started, abandoned, or completed screening. |
| `checkout_status` | Used to infer checkout started or checkout abandoned. |
| `payment_status` | Used to identify paid customers for exclusion. |
| `dropoff_step` | Safe product funnel step, not legal/case detail. |
| `source_record_id` | Internal Expungement.ai record id, if non-sensitive. |
| `last_seen_at` | Most recent activity timestamp. |
| `consent_status` | Marketing/privacy consent state. |
| `consent_captured_at` | Consent timestamp. |
| `privacy_version` | Privacy policy/consent version. |
| `unsubscribed` | Boolean suppression flag. |
| `bounced` | Boolean suppression flag. |
| `complained` | Boolean suppression flag. |
| `do_not_contact` | Boolean suppression flag. |
| `deleted_or_erasure_requested` | Boolean privacy deletion/erasure flag. |
| `utm_source` | Acquisition attribution. |
| `utm_campaign` | Acquisition attribution. |
| `referrer` | Referrer URL or source label. |

## Lifecycle Values

When possible, use these canonical `lifecycle_stage` values:

```text
screening_started
screening_abandoned
screening_completed
checkout_started
checkout_abandoned
paid
packet_generated
support_requested
unsubscribed
deleted_or_erasure_requested
```

If canonical lifecycle stage is not available, include `screening_status`, `checkout_status`, `payment_status`, and `dropoff_step`; the mapper can infer common stages from those fields.

## Blocked Sensitive Columns

Do not export these fields into Command Center:

- Criminal charges
- Conviction details
- Arrest details
- Case numbers
- Docket numbers
- Court documents
- Uploaded IDs
- Packet PDFs
- Generated legal forms
- Eligibility explanations
- Wilma transcripts
- User free-text legal explanations
- Payment card details
- Stripe payment identifiers unless absolutely necessary and explicitly approved
- Social Security numbers
- Dates of birth
- Addresses unless needed later and explicitly approved

Also avoid broad notes fields, free-text intake answers, document filenames, court filing history, eligibility reasoning, or anything that would reveal legal/case facts rather than lifecycle status.

## File Naming

Use a date-stamped name:

```text
expungement-ai-lifecycle-export-YYYY-MM-DD.csv
```

Example:

```text
expungement-ai-lifecycle-export-2026-06-30.csv
```

## Workspace Placement

Place the real CSV in:

```text
data/imports/expungement-ai/
```

If that folder does not exist, create it locally before placing the file there. Do not commit the real export file.

## Before Asking For Preview QA

Check the CSV manually:

- Confirm it is a `.csv` file, not `.xlsx`.
- Confirm the first row is the header row.
- Confirm `email` is present.
- Confirm lifecycle/status columns are present.
- Confirm no blocked sensitive columns are present.
- Confirm there are no raw legal case details, packet details, uploaded document details, SSNs, dates of birth, or payment card details.
- Confirm the file is placed under `data/imports/expungement-ai/`.

## Preview QA Instructions

Ask for production preview QA only after the real CSV is available in the workspace.

The preview request should use:

```json
{
  "sourceNote": "real_expungement_ai_csv_preview",
  "csvText": "<contents of the real CSV>"
}
```

Run preview only:

```text
POST /api/sync/expungement-ai/preview
```

Do not run:

- `/api/sync/expungement-ai/confirm`
- Consumer import confirm
- Any successful held-contact disposition
- Any send, gate, autopilot, wave release, or enrollment action

Preview QA must verify:

- `writesState:false`
- `noSend:true`
- Warning says nothing sends
- Samples are masked
- No raw full emails are exposed in the report
- No raw sensitive legal/case detail is exposed in the report
- Production before/after counts are unchanged


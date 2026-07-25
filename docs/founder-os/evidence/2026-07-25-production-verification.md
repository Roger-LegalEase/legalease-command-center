# Production verification of PRs #116–#118 — 2026-07-25

> Reuse and consolidate the existing foundation. Do not rebuild it. Do not create another destination when the capability belongs inside Today, Relationships, Campaigns, or Scoreboard. Do not expose internal machinery as the product. Every visible action must complete meaningful founder work or be removed.

- **Status:** live verification **COMPLETE**.
- **Recorded:** 2026-07-25, at repo HEAD `fdbc3341e50500a643dec35a89844a7fe9dd62ac`.
- **Provenance:** every item in "Verified" below is an **owner observation reported by
  Roger** against the running production service. This documentation PR performed no
  deploy, no database access, no environment change, and no gate change; nothing here was
  measured from this repo. Code-side claims live in `2026-07-25-delta.md`.

## Verified (owner-observed, 2026-07-25)

| # | Observation | What it confirms |
|---|---|---|
| 1 | Deployed commit **`fdbc334`** live on Render | Production runs current `main` — the full #116 + #117 + #118 arc, not a partial fix |
| 2 | `/api/version` reports **`supabaseConnected: true`** and **`supabaseState: "connected"`** | The three-state probe (`storage.mjs:1088–1099`) reports the healthy state, and the read circuit is closed with no recent failure. Closes the `supabaseConnected:false` item open since 2026-07-23 |
| 3 | Supabase CPU **0.30%**, after a sustained **87–91%** before the fix | The request storm and the mutation convoy are both gone in the live environment. 91% is the figure recorded in the #116 migration header from `pg_stat_statements` |
| 4 | **Today loads** | The targeted `/api/today/summary` read path (#117) works against production data volume |
| 5 | One deliberate save — task **"Test"** via `/api/ui/quick-capture` — completed in **258ms**, with **`queueDepth: 0`** and **`outcome: ok`** | A real write goes through the FIFO core-mutation executor, is attributed by the new `supabase_core_mutation` telemetry, and finds an empty queue: no convoy, no saturation, no shed |
| 6 | A login-triggered write via `/api/ui/discovery/onboarding` cleared in **106ms** | The remaining login-path write is fast and unqueued. Distinct from the *automatic* route-change analytics write removed by #118 — that one no longer happens at all |
| 7 | **Heartbeat cron re-enabled** the same afternoon | Scheduled work resumed on a service judged healthy. The hourly cron's own gates are unchanged (`safety-gates.md`) |

Items 5 and 6 together are the meaningful end-to-end proof: **a passive load performs no
durable write, and a deliberate save completes promptly** — the objective #118 was built
to satisfy, now observed in production rather than only in
`tests/browser/passive-boot-write-free.spec.mjs`.

## Still open (observation items, not code work)

None of these blocks the verification above; each is a measurement that has not been
taken.

| # | Open item | Why it is still open | What would close it |
|---|---|---|---|
| O1 | **Idle `pg_stat_activity` mutation-count re-check** | The convoy was diagnosed at ~45 concurrent mutation RPCs. A quiet-period capture confirming the count is now at rest has not been taken. The earlier `pg_stat_activity` request never arrived | One `pg_stat_activity` snapshot during an idle window, filtered to core-mutation backends, showing a resting count |
| O2 | **Render instance-count confirmation** | The executor bounds **one Node process**. Multiple instances — or a deploy overlap running old and new together — can each hold one active mutation. That residual is documented in `storage.mjs:621–623` and is unquantified in production | Confirm the production service's instance count; if >1, record the real per-process ceiling (instances × 1 active mutation) |
| O3 | **Gated timeout-ordering migration** — `supabase/maintenance/20260725_core_mutation_statement_timeout.sql` | **Prepared, not executed, evidence-gated.** Its gate requires a live capture proving core-mutation backends stayed `active` past the client's timeout (i.e. the database kept holding advisory locks after the client abandoned the request), plus the observed duration of legitimate mutations so the ceiling is set rather than guessed. Neither the `pg_stat_activity` capture nor the `pg_get_functiondef` output has arrived | Satisfy both gate conditions (a) and (b) in the file header, then Roger runs it manually |

Also still un-run, and deliberately so: the **`soc2AuditLogs` retention script**
(`supabase/maintenance/20260725_soc2_audit_log_retention.sql`, prepared by #117). It is a
one-off operator action on data — archive, verify row-for-row, trim to 90 days, abort on
any verification failure — and Roger runs it manually.

## Scope note

This file records production observations only. It does not change any DECIDED row, does
not lift any safety gate, and does not authorize running either prepared SQL file. The
open items above are the owner's to close.

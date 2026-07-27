// Reconciliation of stranded reactivation send-claims against SendGrid's own records.
//
// A claim is written before a send and confirmed after it. When the confirmation is lost, the
// claim sits at "claimed" forever and permanently blocks that (contact, step) — by design,
// because auto-retrying an unconfirmed send is how you email someone twice. The cost of that
// safety is that lost confirmations must be resolved deliberately, against evidence.
//
// This module decides NOTHING on its own guesses. Every claim it resolves carries the evidence
// that resolved it, and anything it cannot evidence is left exactly as it found it.
//
// Two evidence sources, because they have very different retention (see sendgrid-activity.mjs):
//
//   per_message  — SendGrid Email Activity names the recipient and the message. Definitive.
//                  Short retention; measured on 2026-07-27 as reaching only that same day.
//   daily_totals — SendGrid's accepted-request count for a day, compared against how many
//                  claims we created that day. Long retention. Cannot name a recipient, so it
//                  speaks for a whole day or not at all, and only when the two counts agree.
//
// Anything neither source can speak for is "undetermined" and is LEFT BLOCKED. That is the
// conservative direction: a blocked claim costs one touch of a five-touch sequence, whereas a
// wrongly released one emails somebody a second time — the exact harm of the 2026-07-08
// duplicate-send incident.

import { activityCoverage, messagesForDay, SendGridUnavailableError } from "./sendgrid-activity.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const lower = (value = "") => clean(value).toLowerCase();
const dayOf = (value = "") => clean(value).slice(0, 10);

export const RECONCILE_CLAIMS_COLLECTION = "reactivationSendClaims";
export const RECONCILE_STUCK_STATUS = "claimed";
// A claim younger than this may simply be a send in flight. Only older ones are candidates.
export const RECONCILE_MIN_AGE_MS = 30 * 60 * 1000;

export const RECONCILE_CLASSES = Object.freeze({
  CONFIRMED_PER_MESSAGE: "confirmed_per_message",
  CONFIRMED_DAILY_TOTALS: "confirmed_daily_totals",
  // An owner decision, not an inference. Used only for a day the automatic rules decline
  // because SendGrid's accepted count and the claims created that day do not agree exactly.
  // Kept as its OWN class, never merged into confirmed_daily_totals, so these stay
  // distinguishable from evidence-only confirmations and can be revisited if better evidence
  // ever appears. The evidence recorded on each claim carries the exact discrepancy.
  CONFIRMED_OWNER_DECISION: "confirmed_day_level_owner_decision",
  NO_RECORD: "no_record",
  UNDETERMINED: "undetermined"
});

export function stuckClaims(state = {}, { now = new Date(), minAgeMs = RECONCILE_MIN_AGE_MS } = {}) {
  const cutoff = new Date(now).getTime() - minAgeMs;
  return list(state[RECONCILE_CLAIMS_COLLECTION]).filter((claim) => {
    if (lower(claim?.status) !== RECONCILE_STUCK_STATUS) return false;
    const claimedAt = new Date(clean(claim?.claimed_at)).getTime();
    return Number.isFinite(claimedAt) && claimedAt <= cutoff;
  });
}

// Build the reconciliation plan. READ-ONLY: it returns decisions, it never mutates state and
// never sends. Apply is a separate, explicitly-invoked step.
export async function planReactivationReconciliation(state = {}, options = {}) {
  const {
    now = new Date(), env = process.env, fetchImpl = fetch, minAgeMs = RECONCILE_MIN_AGE_MS,
    // Days the owner has explicitly decided to confirm at day level despite the counts not
    // agreeing exactly. Never a default: an empty list means the automatic rules alone decide.
    ownerConfirmedDays = [], ownerDecisionBy = "", ownerDecisionNote = ""
  } = options;
  const ownerDays = new Set((Array.isArray(ownerConfirmedDays) ? ownerConfirmedDays : []).map(dayOf).filter(Boolean));
  const candidates = stuckClaims(state, { now, minAgeMs });
  const days = [...new Set(candidates.map((claim) => dayOf(claim.claimed_at)).filter(Boolean))].sort();

  const plan = {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    candidates: candidates.length,
    days,
    evidence: { perMessageDays: [], dailyTotalsDays: [], unavailable: [] },
    decisions: [],
    counts: { [RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE]: 0, [RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS]: 0, [RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION]: 0, [RECONCILE_CLASSES.NO_RECORD]: 0, [RECONCILE_CLASSES.UNDETERMINED]: 0 },
    ownerConfirmedDays: [...ownerDays],
    notes: []
  };
  if (!candidates.length) return plan;

  // How many claims did we create on each of those days? This is the denominator the daily
  // totals are compared against, and it counts ALL claims that day, not only the stuck ones.
  const claimsPerDay = {};
  for (const claim of list(state[RECONCILE_CLAIMS_COLLECTION])) {
    const day = dayOf(claim?.claimed_at);
    if (day) claimsPerDay[day] = (claimsPerDay[day] || 0) + 1;
  }

  let coverage;
  try {
    coverage = await activityCoverage(days, { env, fetchImpl });
  } catch (error) {
    if (!(error instanceof SendGridUnavailableError)) throw error;
    // No provider evidence at all: every candidate is undetermined and nothing may be applied.
    plan.ok = false;
    plan.evidence.unavailable = days.map((day) => ({ day, reason: clean(error.message).slice(0, 200) }));
    plan.notes.push("SendGrid could not be reached, so no claim can be reconciled. Nothing is proposed.");
    for (const claim of candidates) {
      plan.decisions.push(decision(claim, RECONCILE_CLASSES.UNDETERMINED, { source: "none", detail: "SendGrid unavailable" }));
      plan.counts[RECONCILE_CLASSES.UNDETERMINED]++;
    }
    return plan;
  }

  const coveredDays = new Set(coverage.covered.map((entry) => entry.day));
  plan.evidence.perMessageDays = coverage.covered;
  plan.evidence.unavailable = coverage.uncovered;

  // Per-message evidence, for the days activity retention still reaches.
  const messagesByDay = new Map();
  for (const day of coveredDays) {
    try { messagesByDay.set(day, await messagesForDay(day, { env, fetchImpl })); }
    catch { messagesByDay.set(day, []); }
  }

  // Daily-totals evidence, for the days it does not. A day qualifies only when SendGrid's
  // accepted-request count MATCHES the claims created that day — one request per claim. Any
  // other relationship (fewer requests than claims, or more) leaves the day unproven, because
  // then we cannot say a given claim is among the ones that went out.
  const dailyVerdict = {};
  for (const day of days) {
    if (coveredDays.has(day)) continue;
    const requests = Number(coverage.totalsByDay?.[day]?.requests || 0);
    const claimed = Number(claimsPerDay[day] || 0);
    const matches = claimed > 0 && requests === claimed;
    dailyVerdict[day] = { day, requests, claimsCreated: claimed, matches };
    if (matches) plan.evidence.dailyTotalsDays.push(dailyVerdict[day]);
    else plan.notes.push(`${day}: SendGrid accepted ${requests} messages but ${claimed} claims were created that day; the counts do not agree, so no claim from that day is resolved.`);
  }

  for (const claim of candidates) {
    const day = dayOf(claim.claimed_at);
    const recipient = lower(claim.to);
    if (coveredDays.has(day)) {
      const match = (messagesByDay.get(day) || []).find((message) => message.to === recipient);
      if (match) {
        plan.decisions.push(decision(claim, RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE, {
          source: "sendgrid_email_activity",
          detail: `status=${match.status}`,
          msgId: match.msgId,
          lastEventTime: match.lastEventTime
        }));
        plan.counts[RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE]++;
        continue;
      }
      // Activity covers this day and does NOT list the recipient: a genuine no-send.
      plan.decisions.push(decision(claim, RECONCILE_CLASSES.NO_RECORD, {
        source: "sendgrid_email_activity",
        detail: "activity covers this day and holds no message for this recipient"
      }));
      plan.counts[RECONCILE_CLASSES.NO_RECORD]++;
      continue;
    }
    const verdict = dailyVerdict[day];
    if (verdict?.matches) {
      plan.decisions.push(decision(claim, RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS, {
        source: "sendgrid_daily_totals",
        detail: `SendGrid accepted ${verdict.requests} messages on ${day}; ${verdict.claimsCreated} claims were created that day (1:1)`
      }));
      plan.counts[RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS]++;
      continue;
    }
    if (ownerDays.has(day)) {
      plan.decisions.push(decision(claim, RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION, {
        source: "owner_decision_on_daily_totals",
        detail: verdict
          ? `SendGrid accepted ${verdict.requests} messages on ${day} against ${verdict.claimsCreated} claims created (${verdict.requests - verdict.claimsCreated}); the owner accepted day-level confirmation for this day`
          : `no per-message activity for ${day}; the owner accepted day-level confirmation for this day`,
        requests: verdict?.requests ?? null,
        claimsCreated: verdict?.claimsCreated ?? null,
        decidedBy: clean(ownerDecisionBy) || "owner",
        note: clean(ownerDecisionNote),
        // Spelled out so a later pass can tell exactly what this rested on, and revisit it.
        reversible: true
      }));
      plan.counts[RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION]++;
      continue;
    }
    plan.decisions.push(decision(claim, RECONCILE_CLASSES.UNDETERMINED, {
      source: "none",
      detail: verdict
        ? `per-message activity does not reach ${day} and its daily totals do not agree with the claims created`
        : `per-message activity does not reach ${day}`
    }));
    plan.counts[RECONCILE_CLASSES.UNDETERMINED]++;
  }
  return plan;
}

function decision(claim, classification, evidence) {
  return {
    claim_id: clean(claim.id),
    contact_id: clean(claim.contact_id),
    step_number: Number(claim.step_number || 0),
    to: lower(claim.to),
    claimed_at: clean(claim.claimed_at),
    classification,
    // What will happen to the claim if this plan is applied.
    resolution: classification === RECONCILE_CLASSES.NO_RECORD ? "release" : (classification === RECONCILE_CLASSES.UNDETERMINED ? "leave_blocked" : "confirm"),
    evidence
  };
}

// Apply a plan. Pure state-in/state-out; the caller persists. Nothing is ever deleted: a
// confirmed claim keeps its claimed_at and gains its resolution and the evidence for it; a
// released claim is marked released (and so no longer blocks) while remaining on the ledger.
export function applyReactivationReconciliation(state = {}, plan = {}, { now = new Date(), actor = "owner" } = {}) {
  const at = new Date(now).toISOString();
  const byId = new Map(list(plan.decisions).map((entry) => [clean(entry.claim_id), entry]));
  let confirmed = 0;
  let released = 0;
  let left = 0;
  const claims = list(state[RECONCILE_CLAIMS_COLLECTION]).map((claim) => {
    const entry = byId.get(clean(claim.id));
    if (!entry) return claim;
    // Only ever touch a claim still sitting at "claimed": if something else resolved it between
    // the plan and the apply, the plan is stale for that row and must not overwrite it.
    if (lower(claim.status) !== RECONCILE_STUCK_STATUS) return claim;
    if (entry.resolution === "confirm") {
      confirmed++;
      return {
        ...claim,
        status: "sent",
        resolved_at: at,
        reason: `reconciled:${entry.classification}`,
        reconciliation: { at, actor, classification: entry.classification, evidence: entry.evidence }
      };
    }
    if (entry.resolution === "release") {
      released++;
      return {
        ...claim,
        status: "released",
        resolved_at: at,
        reason: `reconciled:${entry.classification}`,
        reconciliation: { at, actor, classification: entry.classification, evidence: entry.evidence }
      };
    }
    left++;
    return claim;
  });
  return {
    state: { ...state, [RECONCILE_CLAIMS_COLLECTION]: claims },
    confirmed,
    released,
    leftBlocked: left
  };
}

export const RECONCILE_ATTEMPTS_COLLECTION = "reactivationAttempts";

// Restore the attempt records that were lost in the same aborted writes as the confirmations.
//
// Confirming a claim records "this send happened" in the SAFETY ledger. The planner does not
// read that ledger — it derives how many touches a person has had, and when, from
// reactivationAttempts. With those rows missing, the planner keeps proposing the step that was
// already sent, and the claim correctly refuses it: a permanent loop that confirmation alone
// cannot break. Restoring the attempt is what tells the planner which step each person actually
// received, so they advance to the NEXT one on the normal schedule.
//
// Every restored row is marked `reconstructed: true` with the evidence class that confirmed its
// claim, so it can never be mistaken for a directly observed send. The timestamp is the claim's
// own claimed_at — the real send time — so cadence and the minimum-spacing floor are computed
// from when the person was actually emailed, not from today.
export function restoreReconciledAttempts(state = {}, { now = new Date() } = {}) {
  const at = new Date(now).toISOString();
  const attempts = list(state[RECONCILE_ATTEMPTS_COLLECTION]);
  // One attempt per (contact, step) — the same identity the claim ledger uses.
  const seen = new Set(attempts.map((attempt) => `${clean(attempt.contact_id)}|${Number(attempt.step_number || 0)}`));
  const restored = [];
  const skipped = { alreadyRecorded: 0, notReconciled: 0, notConfirmed: 0 };
  for (const claim of list(state[RECONCILE_CLAIMS_COLLECTION])) {
    if (!claim?.reconciliation) { skipped.notReconciled++; continue; }
    if (lower(claim.status) !== "sent") { skipped.notConfirmed++; continue; }
    const key = `${clean(claim.contact_id)}|${Number(claim.step_number || 0)}`;
    if (seen.has(key)) { skipped.alreadyRecorded++; continue; }
    seen.add(key);
    const evidence = claim.reconciliation.evidence || {};
    restored.push({
      // Deterministic id derived from the claim, so re-running restores nothing twice.
      id: `react-attempt-recon-${clean(claim.id).replace(/^react-claim-/, "")}`,
      contact_id: clean(claim.contact_id),
      campaign_id: clean(claim.campaign_id) || "mvp-reactivation",
      wave: claim.wave,
      step_number: Number(claim.step_number || 0),
      to: lower(claim.to),
      provider: "sendgrid",
      provider_message_id: clean(evidence.msgId),
      status: "sent",
      // The day the message actually went out, NOT today: the daily cap counts by sent_date and
      // must not see these as today's traffic.
      sent_date: dayOf(claim.claimed_at),
      created_at: clean(claim.claimed_at),
      // Provenance. This row was reconstructed from provider evidence, never observed directly.
      source: "reconciliation",
      reconstructed: true,
      reconciliation_class: clean(claim.reconciliation.classification),
      reconstructed_at: at
    });
  }
  return {
    state: { ...state, [RECONCILE_ATTEMPTS_COLLECTION]: [...restored, ...attempts] },
    restored: restored.length,
    skipped
  };
}

// A released claim must stop blocking. The send path treats an existing claim in ANY state as a
// block, so "released" is spelled out here as the one status that does not.
export function claimBlocksSend(claim = {}) {
  return Boolean(claim) && lower(claim.status) !== "released";
}

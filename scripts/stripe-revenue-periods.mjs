// Founder OS Release 5 — honest period figures from the real Stripe snapshot.
//
// The Scoreboard service used to read `stripe.monthGross`, `stripe.refundsThisMonth`,
// `stripe.previousMonthGross` and `stripe.previousRefunds`. **The real fetcher produces none of
// them.** `fetchStripeRevenueSnapshot` (`preview-server.mjs:12798-12808`) returns exactly:
//
//   { source, fetchedAt, available, configured, livemode, gross, since, sinceLabel, currency,
//     dailyGross }
//
// so every one of those reads resolved to undefined and the cards were permanently Unavailable
// while Stripe was working perfectly. This module maps what the fetcher actually sends onto what
// the Scoreboard needs, and — this is the whole point — **refuses to produce a figure the source
// cannot honestly support.**
//
// Two refusals matter:
//
// 1. COVERAGE. `dailyGross` only contains days on or after a fixed cutoff
//    (`STRIPE_REVENUE_CUTOFF_ISO`, currently 2026-06-25). Summing the days it happens to hold
//    for a month that began BEFORE the cutoff would present a partial month as a whole month —
//    understating it, with no visible sign that anything was missing. A period is reported only
//    when the cutoff is on or before its first day. Otherwise: null, with the reason.
// 2. REFUNDS DO NOT EXIST IN THIS SOURCE. The fetcher sums charges; it never queries refunds.
//    There is no adjacent number that stands in for a refund total, so refunds are always null
//    here. Deriving them from anything would be exactly the substitution the charter forbids.
//
// Gross is also gross: `amount_captured` with no fee deduction and no refund netting. Callers
// must not present it as net revenue, cash, or profit.

const clean = (value = "") => String(value ?? "").trim();

function monthKeyOf(value) {
  const text = clean(value);
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 7);
}

function firstDayOfMonthKey(monthKey) {
  return /^\d{4}-\d{2}$/.test(monthKey) ? `${monthKey}-01` : "";
}

function previousMonthKey(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Sums the dailyGross days belonging to one month. Returns null when the month is not fully
// covered by the snapshot, because a partial sum presented as a month total is a false number.
function monthTotal(dailyGross, monthKey, coverageSince) {
  if (!monthKey) return { value:null, reason:"no period" };
  const firstDay = firstDayOfMonthKey(monthKey);
  const since = clean(coverageSince);
  if (!since) return { value:null, reason:"the payment snapshot does not say how far back it reaches" };
  if (since > firstDay) {
    return {
      value:null,
      reason:`payment history only reaches back to ${since}, so ${monthKey} is not fully covered`
    };
  }
  if (!dailyGross || typeof dailyGross !== "object") {
    return { value:null, reason:"the payment snapshot has no daily breakdown" };
  }
  let total = 0;
  for (const [day, amount] of Object.entries(dailyGross)) {
    if (monthKeyOf(day) !== monthKey) continue;
    const parsed = numberOrNull(amount);
    if (parsed === null) continue;
    total += parsed;
  }
  // A fully covered month with no charges genuinely IS zero. That is a measured zero, not a
  // missing one, and it is the one case where zero is the honest answer.
  return { value:Math.round(total * 100) / 100, reason:null };
}

/**
 * Derives the period figures the Scoreboard needs from the real snapshot shape.
 * Every field is either a number the source genuinely supports, or null with a reason.
 */
export function stripeRevenuePeriods(stripe = null, now = "") {
  const currentKey = monthKeyOf(now);
  const previousKey = previousMonthKey(currentKey);
  const unavailable = (reason) => Object.freeze({
    available:false,
    currency:clean(stripe?.currency) || "usd",
    currentMonth:null,
    currentMonthReason:reason,
    previousMonth:null,
    previousMonthReason:reason,
    refunds:null,
    refundsReason:REFUNDS_REASON,
    coverageSince:clean(stripe?.since) || null,
    grossIsBeforeFeesAndRefunds:true
  });

  if (!stripe || typeof stripe !== "object") return unavailable("no payment snapshot was read");
  if (stripe.available !== true) {
    return unavailable(clean(stripe.error) || "the payment provider did not answer");
  }

  const current = monthTotal(stripe.dailyGross, currentKey, stripe.since);
  const previous = monthTotal(stripe.dailyGross, previousKey, stripe.since);

  return Object.freeze({
    available:true,
    currency:clean(stripe.currency) || "usd",
    currentMonth:current.value,
    currentMonthReason:current.reason,
    previousMonth:previous.value,
    previousMonthReason:previous.reason,
    // Always null: this source does not carry refunds at all.
    refunds:null,
    refundsReason:REFUNDS_REASON,
    coverageSince:clean(stripe.since) || null,
    // Carried so no caller can present this as net revenue by accident.
    grossIsBeforeFeesAndRefunds:true
  });
}

export const REFUNDS_REASON =
  "The payment snapshot totals charges only and carries no refund figure, so this cannot be shown.";

// Founder OS Release 5 — the trusted KPI registry.
//
// The charter (docs/founder-os/workspaces/scoreboard.md) requires NINE fields on every metric.
// Five already exist on the Founder Scoreboard's cards — label, source, freshness, current
// value, status label. Four do not exist anywhere at HEAD, verified by grep before this file
// was written: **Definition, Target, Variance, Corrective action**. This registry supplies the
// declarative half of those four, per metric, for the 28 cards the service already builds.
//
// It is DATA, not logic. Every entry is a statement about what a number means and where a
// founder goes to act on it. Variance is computed from the numbers themselves (see
// founder-scoreboard-registry-view.mjs); a target is a stored decision, not a guess.
//
// THREE RULES, all of them the charter's honesty rules made concrete:
//
// 1. A definition says what the number IS, including what it is not when that is the trap.
//    Revenue collected is not cash. Gross is not net.
// 2. `targetSource` names where a target comes from. A metric with no target says so and shows
//    no variance — an invented target would make a fabricated variance, which is worse than
//    no target at all.
// 3. `correctiveAction` is one link to the surface where the work actually happens, never a
//    dashboard that merely restates the number.

// Where a target legitimately comes from. There is no "inferred" member on purpose.
export const KPI_TARGET_SOURCES = Object.freeze({
  // Owner-entered, stored in the existing runwayInputs singleton.
  manual_finance: "manual_finance",
  // Owner-entered, stored in the existing settings singleton.
  settings: "settings",
  // No target exists for this metric, and none should be invented.
  none: "none"
});

// A metric is only as trustworthy as its source. `live` means a connected system answers for
// it; `manual` means Roger typed it; `unavailable` means nothing answers for it yet. These
// mirror SCOREBOARD_STATUSES rather than introducing a second vocabulary.
export const KPI_SOURCE_KINDS = Object.freeze({
  stripe: "Stripe",
  signups_endpoint: "Signups endpoint",
  manual_finance: "Owner input",
  product_events: "Product events",
  partners: "Partner records",
  prospects: "Prospect discovery",
  outreach: "Outreach engine",
  reactivation: "Reactivation engine",
  support: "Support desk",
  social: "Social workspace",
  press: "Press outreach",
  platform: "Platform telemetry"
});

function metric(id, definition, sourceKind, correctiveAction, options = {}) {
  return Object.freeze({
    id,
    definition,
    sourceKind,
    correctiveAction: correctiveAction ? Object.freeze({ ...correctiveAction }) : null,
    targetSource: options.targetSource || KPI_TARGET_SOURCES.none,
    // The settings key a target is read from, when one can be set at all.
    targetKey: options.targetKey || null,
    // Direction matters for variance: fewer overdue follow-ups is good, less revenue is not.
    // Without this, a variance sign is meaningless.
    betterWhen: options.betterWhen || "higher",
    // Named when the number is computed rather than measured, because the charter requires
    // derived metrics to say what they are derived from.
    derivedFrom: options.derivedFrom || null
  });
}

export const FOUNDER_KPI_REGISTRY = Object.freeze([
  // ---------------------------------------------------------------------------------------
  // Financial. The charter's hardest honesty rule lives here: no financial concept may stand
  // in for another, and Stripe gross payments are never "cash".
  // ---------------------------------------------------------------------------------------
  metric("cash_available",
    "Money actually in the bank on the as-of date you entered. Not Stripe payments, and not revenue.",
    KPI_SOURCE_KINDS.manual_finance,
    { label: "Update financials", target: "#revenue" },
    { targetSource: KPI_TARGET_SOURCES.manual_finance, betterWhen: "higher" }),

  metric("monthly_burn",
    "What the company spends in a month, as you entered it.",
    KPI_SOURCE_KINDS.manual_finance,
    { label: "Update financials", target: "#revenue" },
    { targetSource: KPI_TARGET_SOURCES.manual_finance, betterWhen: "lower" }),

  metric("runway",
    "Months of runway left. Derived from the cash and burn you entered, and from nothing else.",
    KPI_SOURCE_KINDS.manual_finance,
    { label: "Update financials", target: "#revenue" },
    { targetSource: KPI_TARGET_SOURCES.settings, targetKey: "runwayMonthsTarget", betterWhen: "higher",
      derivedFrom: "cash available ÷ monthly burn" }),

  metric("revenue_this_month",
    "Payments Stripe captured this month, before fees and before refunds. This is revenue collected, not cash and not profit.",
    KPI_SOURCE_KINDS.stripe,
    { label: "Review campaigns", target: "#campaigns" },
    { targetSource: KPI_TARGET_SOURCES.settings, targetKey: "monthlyRevenueTarget", betterWhen: "higher" }),

  metric("refunds",
    "Money returned to customers this month.",
    KPI_SOURCE_KINDS.stripe,
    { label: "Review support issues", target: "#support" },
    { betterWhen: "lower" }),

  metric("booked_expected_revenue",
    "Revenue expected from work already agreed but not yet collected.",
    KPI_SOURCE_KINDS.partners,
    { label: "Open the pipeline", target: "#partners" },
    { betterWhen: "higher" }),

  // ---------------------------------------------------------------------------------------
  // Acquisition.
  // ---------------------------------------------------------------------------------------
  metric("website_visits", "People who visited the site in this period.", KPI_SOURCE_KINDS.product_events,
    { label: "Plan the social week", target: "#campaigns" }, { betterWhen: "higher" }),
  metric("signups", "Accounts created in this period.", KPI_SOURCE_KINDS.signups_endpoint,
    { label: "Plan the social week", target: "#campaigns" },
    { targetSource: KPI_TARGET_SOURCES.settings, targetKey: "monthlySignupTarget", betterWhen: "higher" }),
  metric("paid_signups", "Accounts that paid, in this period.", KPI_SOURCE_KINDS.signups_endpoint,
    { label: "Plan the social week", target: "#campaigns" }, { betterWhen: "higher" }),
  metric("intake_starts", "People who began the intake process.", KPI_SOURCE_KINDS.product_events,
    { label: "Review the funnel", target: "#revenue" }, { betterWhen: "higher" }),
  metric("intake_completions", "People who finished intake.", KPI_SOURCE_KINDS.product_events,
    { label: "Review the funnel", target: "#revenue" }, { betterWhen: "higher" }),
  metric("purchases", "Completed purchases in this period.", KPI_SOURCE_KINDS.product_events,
    { label: "Review the funnel", target: "#revenue" }, { betterWhen: "higher" }),
  metric("conversion_rate", "Share of people who started intake and went on to pay.", KPI_SOURCE_KINDS.product_events,
    { label: "Review the funnel", target: "#revenue" },
    { betterWhen: "higher", derivedFrom: "purchases ÷ intake starts" }),

  // ---------------------------------------------------------------------------------------
  // Pipeline / relationships. Corrective actions point at Relationships, where the work is.
  // ---------------------------------------------------------------------------------------
  metric("active_partner_opportunities", "Partner opportunities currently in motion.", KPI_SOURCE_KINDS.partners,
    { label: "Open the pipeline", target: "#partners" }, { betterWhen: "higher" }),
  metric("followups_due", "Follow-ups due or overdue right now.", KPI_SOURCE_KINDS.partners,
    { label: "Clear follow-ups due", target: "#partners" }, { betterWhen: "lower" }),
  metric("meetings_booked", "Meetings on the calendar ahead of you.", KPI_SOURCE_KINDS.partners,
    { label: "Open the pipeline", target: "#partners" }, { betterWhen: "higher" }),
  metric("proposals_active", "Proposals out and awaiting a decision.", KPI_SOURCE_KINDS.partners,
    { label: "Open the pipeline", target: "#partners" }, { betterWhen: "higher" }),
  metric("stalled_relationships", "Relationships with no movement past their expected window.",
    KPI_SOURCE_KINDS.partners, { label: "Review stalled relationships", target: "#partners" },
    { betterWhen: "lower" }),
  metric("outreach_replies", "Replies received from partner outreach.", KPI_SOURCE_KINDS.outreach,
    { label: "Review replies", target: "#campaigns" }, { betterWhen: "higher" }),
  metric("active_outreach_campaigns", "Outreach campaigns currently running.", KPI_SOURCE_KINDS.outreach,
    { label: "Open Campaigns", target: "#campaigns" }, { betterWhen: "higher" }),

  // ---------------------------------------------------------------------------------------
  // Customer.
  // ---------------------------------------------------------------------------------------
  metric("new_support_issues", "Support issues raised in this period.", KPI_SOURCE_KINDS.support,
    { label: "Open the support queue", target: "#support" }, { betterWhen: "lower" }),
  metric("open_urgent_issues", "Urgent support issues still open.", KPI_SOURCE_KINDS.support,
    { label: "Triage urgent issues", target: "#today" }, { betterWhen: "lower" }),
  metric("waiting_on_legalease", "Support issues waiting on a reply from us.", KPI_SOURCE_KINDS.support,
    { label: "Reply to waiting issues", target: "#today" }, { betterWhen: "lower" }),
  metric("resolved_this_week", "Support issues resolved this week.", KPI_SOURCE_KINDS.support,
    { label: "Open the support queue", target: "#support" }, { betterWhen: "higher" }),

  // ---------------------------------------------------------------------------------------
  // Marketing. Press is honestly unavailable until the lane exists.
  // ---------------------------------------------------------------------------------------
  metric("social_drafts_ready", "Approved posts ready for you to publish by hand.", KPI_SOURCE_KINDS.social,
    { label: "Plan the social week", target: "#campaigns" }, { betterWhen: "higher" }),
  metric("posts_published", "Posts you recorded as published in this period.", KPI_SOURCE_KINDS.social,
    { label: "Record a published link", target: "#campaigns" },
    { targetSource: KPI_TARGET_SOURCES.settings, targetKey: "weeklyPostTarget", betterWhen: "higher" }),
  metric("content_needing_results", "Published posts with no results recorded yet.", KPI_SOURCE_KINDS.social,
    { label: "Record results", target: "#campaigns" }, { betterWhen: "lower" }),
  metric("press_pitches_replies", "Press pitches sent and replies received.", KPI_SOURCE_KINDS.press,
    { label: "Open Campaigns", target: "#campaigns" }, { betterWhen: "higher" }),

  // ---------------------------------------------------------------------------------------
  // Platform health. These are the service's own health-group cards, whose ids are built at
  // runtime rather than written as literals — which is why a source-text scan misses them and
  // why the coverage test reads the BUILT view instead.
  //
  // They carry no target and no variance on purpose: "is Stripe connected" is a state, not a
  // number to beat. They still need a definition and one place to act, because the charter's
  // contract applies to every metric a founder can see.
  // ---------------------------------------------------------------------------------------
  metric("application_health", "Whether the production application is answering.", KPI_SOURCE_KINDS.platform,
    { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" }),
  metric("supabase_health", "Whether the database is connected and answering.", KPI_SOURCE_KINDS.platform,
    { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" }),
  metric("email_provider_health", "Whether the email provider is connected and reporting delivery.",
    KPI_SOURCE_KINDS.platform, { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" }),
  metric("google_connection_health", "Whether the read-only Gmail and Calendar connection is working.",
    KPI_SOURCE_KINDS.platform, { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" }),
  metric("website_analytics_health", "Whether website analytics is connected.", KPI_SOURCE_KINDS.platform,
    { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" }),
  metric("stripe_health", "Whether Stripe is connected and answering.", KPI_SOURCE_KINDS.platform,
    { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" }),
  metric("background_jobs_health", "Whether the scheduled background work ran when it should have.",
    KPI_SOURCE_KINDS.platform, { label: "Open platform health", target: "#os-health" }, { betterWhen: "higher" })
]);

const REGISTRY_BY_ID = new Map(FOUNDER_KPI_REGISTRY.map((entry) => [entry.id, entry]));

export function kpiRegistryEntry(id = "") {
  return REGISTRY_BY_ID.get(String(id)) || null;
}

// Target reading. A target is a stored decision: an owner-entered number in `settings` or the
// finance singleton. When none is stored, this returns null and the variance is omitted — the
// charter's rule that nothing may be approximated by a neighbour applies to targets too.
export function kpiTarget(entry, state = {}) {
  if (!entry || entry.targetSource === KPI_TARGET_SOURCES.none) return null;
  const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
  const targets = settings.founderKpiTargets && typeof settings.founderKpiTargets === "object"
    ? settings.founderKpiTargets
    : {};
  const raw = entry.targetKey ? targets[entry.targetKey] : undefined;
  if (raw === "" || raw === null || raw === undefined || typeof raw === "boolean") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Variance. Reported as an absolute difference and a share, plus whether the difference is an
// improvement given the metric's direction. Never reported without both numbers present: a
// variance against a missing target or a missing previous value would be fabricated.
export function kpiVariance(entry, current, comparison) {
  if (!entry) return null;
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  if (typeof comparison !== "number" || !Number.isFinite(comparison)) return null;
  const difference = current - comparison;
  // A share of zero is undefined, not zero. Saying "0% change" against a zero baseline would
  // assert something the numbers cannot support.
  const share = comparison === 0 ? null : difference / Math.abs(comparison);
  const better = entry.betterWhen === "lower" ? difference < 0 : difference > 0;
  return Object.freeze({
    difference,
    share,
    direction: difference === 0 ? "flat" : difference > 0 ? "up" : "down",
    better: difference === 0 ? null : better
  });
}

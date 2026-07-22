#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  FOUNDER_FINANCE_INPUT_ENDPOINT,
  FOUNDER_SCOREBOARD_ENDPOINT,
  FounderScoreboardValidationError,
  SCOREBOARD_GROUPS,
  buildFounderScoreboard,
  updateFounderFinanceInputs
} from "./founder-scoreboard-service.mjs";

const NOW = "2026-07-21T12:00:00.000Z";
const OWNER = { authenticated:true, role:"owner", id:"founder-example" };

function cardById(view, id) {
  const found = view.cards.find((item) => item.id === id);
  assert.ok(found, `missing Scoreboard card: ${id}`);
  return found;
}

const state = {
  runwayInputs:{
    currentCashBalance:120000,
    monthlyBurn:20000,
    asOfDate:"2026-07-20",
    updatedAt:"2026-07-20T15:00:00.000Z",
    updatedBy:"founder-example"
  },
  stripeRevenue:{
    source:"stripe_live",
    available:true,
    configured:true,
    monthGross:15000,
    refundsThisMonth:250,
    previousMonthGross:12000,
    previousRefunds:100,
    currency:"usd",
    fetchedAt:"2026-07-21T10:00:00.000Z"
  },
  signups:{
    available:true,
    configured:true,
    registered:40,
    paid:8,
    previousRegistered:30,
    previousPaid:5,
    fetchedAt:"2026-07-21T10:05:00.000Z"
  },
  funnelSnapshots:[
    {
      id:"funnel-current",
      dateRange:"2026-07",
      sourceEventId:"event-current",
      landingPageVisits:100,
      expungementIntakeStarted:20,
      expungementIntakeCompleted:12,
      paymentCompleted:5,
      revenue:2000,
      updatedAt:"2026-07-21T09:00:00.000Z"
    },
    {
      id:"funnel-previous",
      dateRange:"2026-06",
      sourceEventId:"event-previous",
      landingPageVisits:80,
      expungementIntakeStarted:16,
      expungementIntakeCompleted:9,
      paymentCompleted:4,
      revenue:1500,
      updatedAt:"2026-06-30T18:00:00.000Z"
    }
  ],
  engagementGrowthSnapshots:[
    { id:"growth-current", generated_at:"2026-07-21T10:10:00.000Z", metrics:{ revenue:{ available:true, gross:15000 }, signups:{ available:true, paid:8, registered:40 }, content:{ posted_count:2 } } },
    { id:"growth-previous", generated_at:"2026-06-30T10:10:00.000Z", metrics:{ revenue:{ available:true, gross:12000 }, signups:{ available:true, paid:5, registered:30 }, content:{ posted_count:1 } } }
  ],
  operatingPulseSnapshots:[
    {
      id:"pulse-cash-current", loop:"cash-runway", generated_at:"2026-07-19T08:00:00.000Z",
      metrics:{ cash_on_hand:100000, burn_monthly:18000, runway_months:5.5, booked_30d:6000, pipeline_weighted:6500 }
    },
    {
      id:"pulse-cash-previous", loop:"cash-runway", generated_at:"2026-06-19T08:00:00.000Z",
      metrics:{ cash_on_hand:90000, burn_monthly:18000, runway_months:5, booked_30d:5000, pipeline_weighted:5000 }
    },
    {
      id:"pulse-partner-current", loop:"partner-health", generated_at:"2026-07-20T08:00:00.000Z",
      metrics:{ stalled_partners:1 }
    },
    {
      id:"pulse-partner-previous", loop:"partner-health", generated_at:"2026-06-20T08:00:00.000Z",
      metrics:{ stalled_partners:2 }
    }
  ],
  partners:[
    { id:"partner-proposal", name:"Proposal Example", stage:"proposal_sent", expectedValue:10000, probability:0.5, updatedAt:"2026-07-20T12:00:00.000Z" },
    { id:"partner-stalled", name:"Stalled Example", stage:"stalled", updatedAt:"2026-07-19T12:00:00.000Z" },
    { id:"partner-closed", name:"Closed Example", stage:"closed_lost", updatedAt:"2026-07-18T12:00:00.000Z" }
  ],
  prospectCandidates:[
    { id:"prospect-one", organization_name:"Prospect Example", review_state:"pending_review", updated_at:"2026-07-20T11:00:00.000Z" }
  ],
  campaigns:[
    { id:"campaign-revenue", status:"active", revenue:3000, updatedAt:"2026-07-20T08:00:00.000Z" }
  ],
  partnerPrograms:[],
  pilots:[
    { id:"pilot-one", status:"proposal_sent", price:2000, updatedAt:"2026-07-18T08:00:00.000Z" }
  ],
  tasks:[
    { id:"followup-due", title:"Follow up", status:"open", partnerId:"partner-proposal", dueDate:"2026-07-20", updatedAt:"2026-07-20T08:00:00.000Z" },
    { id:"followup-future", title:"Future follow up", status:"open", sourceType:"partner", dueDate:"2026-07-25", updatedAt:"2026-07-20T08:00:00.000Z" }
  ],
  meetingBriefs:[
    { id:"meeting-future", title:"Partner call", start_at:"2026-07-23T15:00:00.000Z", generated_at:"2026-07-21T07:00:00.000Z" },
    { id:"meeting-past", title:"Past call", start_at:"2026-07-19T15:00:00.000Z", generated_at:"2026-07-18T07:00:00.000Z" }
  ],
  outreachReplies:[
    { id:"reply-general", campaign_id:"campaign-general", replied_at:"2026-07-20T10:00:00.000Z" },
    { id:"reply-press", campaign_id:"campaign-press", contact_id:"press-contact", replied_at:"2026-07-20T11:00:00.000Z" }
  ],
  supportIssues:[
    { id:"support-new", status:"new", urgency:"urgent", createdAt:"2026-07-21T08:00:00.000Z" },
    { id:"support-waiting-us", status:"waiting_on_legalease", urgency:"normal", updatedAt:"2026-07-20T08:00:00.000Z" },
    { id:"support-resolved", status:"resolved", resolvedAt:"2026-07-19T08:00:00.000Z" }
  ],
  posts:[
    { id:"post-ready", status:"ready", updatedAt:"2026-07-20T09:00:00.000Z" },
    { id:"post-published-results", status:"published", publishedAt:"2026-07-19T09:00:00.000Z", performanceUpdatedAt:"2026-07-20T09:00:00.000Z" },
    { id:"post-published-needs-results", status:"posted", manuallyPostedAt:"2026-07-20T09:00:00.000Z" }
  ],
  outreachCampaigns:[
    { campaign_id:"campaign-general", name:"Partner introduction", status:"active", classification:"nonprofit", updated_at:"2026-07-20T08:00:00.000Z" },
    { campaign_id:"campaign-press", name:"Founder story press outreach", status:"active", classification:"media", updated_at:"2026-07-20T08:00:00.000Z" }
  ],
  outreachContacts:[
    { contact_id:"press-contact", campaign_id:"campaign-press", classification:"media", updated_at:"2026-07-20T08:00:00.000Z" }
  ],
  outreachAttempts:[
    { id:"press-attempt", campaign_id:"campaign-press", contact_id:"press-contact", status:"sent", sent_at:"2026-07-19T08:00:00.000Z" }
  ],
  osHealthSnapshots:[
    {
      id:"health-current",
      generated_at:"2026-07-21T09:30:00.000Z",
      overall_health:"healthy",
      connection_health:{
        supabase_db:{ ok:true, status:"connected", detail:"Database connected." },
        supabase_storage:{ ok:true, status:"connected", detail:"Storage connected." }
      },
      summary:{ next_operator_action:"No action needed." }
    }
  ],
  connectorStatus:[
    { connector:"email", configured:true, lastSyncStatus:"connected", lastSyncAt:"2026-07-21T09:15:00.000Z" },
    { connector:"website", configured:true, lastSyncStatus:"connected", lastSyncAt:"2026-07-21T09:10:00.000Z" }
  ],
  socialAccounts:[
    { platform:"google_workspace", status:"connected", connectedAt:"2026-07-01T12:00:00.000Z", updatedAt:"2026-07-21T09:00:00.000Z" }
  ],
  sendgridWebhookHealth:{ lastOkAt:"2026-07-21T09:15:00.000Z" },
  heartbeatRuns:[
    { id:"heartbeat-current", status:"success", ranAt:"2026-07-21T08:00:00.000Z" }
  ]
};

assert.equal(FOUNDER_SCOREBOARD_ENDPOINT, "/api/ui/scoreboard");
assert.equal(FOUNDER_FINANCE_INPUT_ENDPOINT, "/api/ui/scoreboard/finance");
const before = structuredClone(state);
const view = buildFounderScoreboard(state, OWNER, NOW);
assert.equal(view.available, true);
assert.deepEqual(view.groups.map((group) => group.key), SCOREBOARD_GROUPS.map((group) => group.key));
assert.equal(view.cards.length, 35, "all required financial, acquisition, relationship, customer, marketing, and health cards are present");
assert.equal(view.summary.live + view.summary.manual + view.summary.unavailable + view.summary.needsAttention, view.cards.length);
assert.ok(Object.isFrozen(view) && Object.isFrozen(view.cards[0]));
assert.deepEqual(state, before, "Scoreboard projection must not mutate state");

assert.equal(cardById(view, "cash_available").current.value, 120000);
assert.equal(cardById(view, "cash_available").status.label, "Manual");
assert.equal(cardById(view, "cash_available").previous.value, 100000);
assert.equal(cardById(view, "monthly_burn").current.value, 20000);
assert.equal(cardById(view, "runway").current.value, 6);
assert.equal(cardById(view, "revenue_this_month").current.value, 15000);
assert.equal(cardById(view, "revenue_this_month").status.label, "Live");
assert.equal(cardById(view, "revenue_this_month").previous.value, 12000);
assert.equal(cardById(view, "refunds").current.value, 250);
assert.ok(cardById(view, "booked_expected_revenue").current.value > 0);

assert.equal(cardById(view, "website_visits").current.value, 100);
assert.equal(cardById(view, "website_visits").previous.value, 80);
assert.equal(cardById(view, "website_visits").status.label, "Live");
assert.equal(cardById(view, "signups").current.value, 40);
assert.equal(cardById(view, "signups").previous.value, 30);
assert.equal(cardById(view, "paid_signups").current.value, 8);
assert.equal(cardById(view, "intake_starts").current.value, 20);
assert.equal(cardById(view, "intake_completions").current.value, 12);
assert.equal(cardById(view, "purchases").current.value, 5);
assert.equal(cardById(view, "conversion_rate").current.value, 25);
assert.equal(cardById(view, "conversion_rate").previous.value, 25);

assert.equal(cardById(view, "active_partner_opportunities").current.value, 3);
assert.equal(cardById(view, "followups_due").current.value, 1);
assert.equal(cardById(view, "meetings_booked").current.value, 1);
assert.equal(cardById(view, "proposals_active").current.value, 1);
assert.equal(cardById(view, "stalled_relationships").current.value, 1);
assert.equal(cardById(view, "stalled_relationships").previous.value, 2);
assert.equal(cardById(view, "outreach_replies").current.value, 2);

assert.equal(cardById(view, "new_support_issues").current.value, 1);
assert.equal(cardById(view, "open_urgent_issues").current.value, 1);
assert.equal(cardById(view, "waiting_on_legalease").current.value, 2);
assert.equal(cardById(view, "resolved_this_week").current.value, 1);
assert.equal(cardById(view, "social_drafts_ready").current.value, 1);
assert.equal(cardById(view, "posts_published").current.value, 2);
assert.equal(cardById(view, "content_needing_results").current.value, 1);
assert.equal(cardById(view, "active_outreach_campaigns").current.value, 2);
assert.equal(cardById(view, "press_pitches_replies").current.value, 2);

for (const id of ["application_health", "supabase_health", "email_provider_health", "google_connection_health", "website_analytics_health", "stripe_health", "background_jobs_health"]) {
  assert.equal(cardById(view, id).status.label, "Live", `${id} should be supported by explicit healthy evidence`);
  assert.equal(cardById(view, id).current.value, "Healthy");
}

// Missing sources stay null and Unavailable. A missing metric must never become a fake zero.
const missing = buildFounderScoreboard({}, OWNER, NOW);
for (const id of ["cash_available", "monthly_burn", "runway", "revenue_this_month", "refunds", "website_visits", "signups", "paid_signups", "intake_starts", "intake_completions", "purchases", "conversion_rate"]) {
  const item = cardById(missing, id);
  assert.equal(item.status.label, "Unavailable", `${id} should be unavailable without evidence`);
  assert.equal(item.current.available, false);
  assert.equal(item.current.value, null);
}
assert.equal(missing.safety.missingValuesRenderedAsZero, false);

// An authoritative but empty internal queue may truthfully report zero.
const emptyInternal = buildFounderScoreboard({ partners:[], prospectCandidates:[], tasks:[], meetingBriefs:[], outreachReplies:[], supportIssues:[], posts:[], outreachCampaigns:[], outreachContacts:[], outreachAttempts:[] }, OWNER, NOW);
assert.equal(cardById(emptyInternal, "active_partner_opportunities").current.value, 0);
assert.equal(cardById(emptyInternal, "new_support_issues").current.value, 0);
assert.equal(cardById(emptyInternal, "social_drafts_ready").current.value, 0);
assert.equal(cardById(emptyInternal, "website_visits").current.value, null, "an empty funnel is still unavailable, not a fake traffic zero");

const paymentAttention = buildFounderScoreboard({ stripeRevenue:{ available:false, configured:true, error:"Connection needs attention.", fetchedAt:NOW } }, OWNER, NOW);
assert.equal(cardById(paymentAttention, "revenue_this_month").status.label, "Needs attention");
assert.equal(cardById(paymentAttention, "revenue_this_month").current.value, null);
assert.equal(cardById(paymentAttention, "stripe_health").status.label, "Needs attention");

const staleManual = buildFounderScoreboard({ runwayInputs:{ currentCashBalance:50000, monthlyBurn:10000, asOfDate:"2026-04-01", updatedAt:"2026-04-01T12:00:00.000Z" } }, OWNER, NOW);
assert.equal(cardById(staleManual, "cash_available").status.label, "Needs attention");
assert.equal(cardById(staleManual, "cash_available").current.value, 50000, "stale manual data stays visible but clearly needs attention");

const unauthorized = buildFounderScoreboard({}, { authenticated:true, role:"viewer" }, NOW);
assert.equal(unauthorized.available, false);
assert.equal(unauthorized.cards.length, 0);

// Narrow manual finance write: only runwayInputs changes, with optimistic conflict handling.
const financeState = { runwayInputs:{ currentCashBalance:100, monthlyBurn:25, asOfDate:"2026-07-01", updatedAt:"2026-07-01T00:00:00.000Z" }, tasks:[{ id:"untouched" }] };
const financeBefore = structuredClone(financeState);
const updated = updateFounderFinanceInputs(financeState, OWNER, {
  currentCashBalance:"1234.567",
  monthlyBurn:300,
  asOfDate:"2026-07-20",
  expectedUpdatedAt:"2026-07-01T00:00:00.000Z"
}, NOW);
assert.deepEqual(financeState, financeBefore, "manual finance update must be pure");
assert.equal(updated.runwayInputs.currentCashBalance, 1234.57);
assert.equal(updated.runwayInputs.monthlyBurn, 300);
assert.equal(updated.runwayInputs.asOfDate, "2026-07-20");
assert.equal(updated.runwayInputs.updatedAt, NOW);
assert.deepEqual(updated.changedCollections, ["runwayInputs"]);
assert.deepEqual(updated.patch, { runwayInputs:updated.runwayInputs });
assert.deepEqual(updated.state.tasks, financeState.tasks);
assert.equal(updated.safety.externalActions, 0);
assert.equal(updated.safety.liveConfigurationChanged, false);

assert.throws(
  () => updateFounderFinanceInputs(financeState, { authenticated:true, role:"operator" }, { currentCashBalance:1 }, NOW),
  (error) => error instanceof FounderScoreboardValidationError && error.status === 403
);
assert.throws(() => updateFounderFinanceInputs(financeState, OWNER, { currentCashBalance:-1 }, NOW), /non-negative/);
assert.throws(() => updateFounderFinanceInputs(financeState, OWNER, { asOfDate:"2026-07-22" }, NOW), /future/);
assert.throws(
  () => updateFounderFinanceInputs(financeState, OWNER, { currentCashBalance:1, expectedUpdatedAt:"stale" }, NOW),
  (error) => error instanceof FounderScoreboardValidationError && error.status === 409 && error.code === "financial_inputs_changed"
);

console.log("PASS test-founder-scoreboard-service");
console.log(JSON.stringify({ cards:view.cards.length, groups:view.groups.length, statuses:view.summary, missingNumbersShownAsZero:false, manualFinanceCollections:updated.changedCollections, mutations:0, externalActions:0 }));

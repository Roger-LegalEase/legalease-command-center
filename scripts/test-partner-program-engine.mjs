import assert from "node:assert/strict";
import {
  buildPartnerDashboardBridgeStatus,
  buildPartnerProgramArtifact,
  buildPartnerProgramAutonomyActions,
  normalizePartnerProgram,
  partnerProgramOverview,
  partnerProgramStripeReadiness
} from "./partner-program-engine.mjs";

const now = "2026-05-26T12:00:00.000Z";
const program = normalizePartnerProgram({
  name: "We Must Vote RCAP",
  partnerType: "nonprofit",
  packageTier: "Implementation Program",
  paymentStatus: "paid",
  primaryContact: "Maya Johnson",
  programGoal: "Help Harris County residents understand record-clearing next steps.",
  targetAudience: "Residents facing employment, housing, and civic participation barriers.",
  jurisdiction: "Texas",
  launchDate: "2026-06-01",
  metrics: {
    pageViews: 1248,
    intakeStarts: 410,
    recordShieldStarts: 305,
    recordShieldCompletions: 220,
    expungementHandoffs: 88,
    paidConversions: 31,
    dropOffs: 105,
    revenueBooked: 25000
  }
}, { now });

assert.equal(program.slug, "we-must-vote-rcap");
assert.equal(program.status, "paid");
assert.equal(program.packageTier, "implementation");
assert.equal(program.proposalStatus, "not_started");
assert.equal(program.weeklyReportStatus, "not_started");
assert.match(program.nextAction, /onboarding/i);

const proposal = buildPartnerProgramArtifact(program, "proposal", { now });
assert.equal(proposal.artifactType, "proposal");
assert.match(proposal.html, /Record-Clearing Access Program/);
assert.match(proposal.html, /We Must Vote RCAP/);
assert.match(proposal.html, /does not guarantee eligibility, court approval, filing acceptance, or legal outcomes/i);
assert.doesNotMatch(proposal.html, /will guarantee/i);
assert.match(proposal.markdown, /Review before sending/i);

const landingPage = buildPartnerProgramArtifact(program, "landing_page", { now });
assert.match(landingPage.html, /Wilma Intake/);
assert.match(landingPage.html, /RecordShield Access/);
assert.match(landingPage.html, /utm_campaign=we-must-vote-rcap/);
assert.doesNotMatch(landingPage.html, /provides legal advice/i);
assert.match(landingPage.html, /not legal advice/i);

const weekly = buildPartnerProgramArtifact(program, "weekly_report", { now });
assert.equal(weekly.artifactType, "weekly_report");
assert.match(weekly.markdown, /RecordShield starts/);
assert.equal(weekly.json.metrics.recordShieldStarts, 305);

const finalReport = buildPartnerProgramArtifact(program, "final_report", { now });
assert.equal(finalReport.artifactType, "final_report");
assert.match(finalReport.html, /Final Impact Report/);
assert.match(finalReport.markdown, /Expansion recommendation/);

const overview = partnerProgramOverview({
  partnerPrograms: [
    program,
    normalizePartnerProgram({ name:"Fulton County RCAP", status:"proposal_draft", proposalStatus:"draft", paymentStatus:"unpaid", packageTier:"Starter Program" }, { now }),
    normalizePartnerProgram({ name:"TimeDone RCAP", status:"stalled", paymentStatus:"unpaid", packageTier:"Strategic Program" }, { now })
  ]
}, { now });
assert.equal(overview.paid.length, 1);
assert.equal(overview.proposalsNeedReview.length, 1);
assert.equal(overview.stalled.length, 1);
assert.equal(overview.revenueBooked, 25000);

const stripe = partnerProgramStripeReadiness({
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  STRIPE_PRICE_STARTER_ACCESS_PROGRAM: "price_starter",
  STRIPE_PRICE_IMPLEMENTATION_PROGRAM: "price_impl",
  STRIPE_PRICE_STRATEGIC_PROGRAM: "price_strategic"
});
assert.equal(stripe.configured, false);
assert.ok(stripe.missing.includes("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"));
assert.equal(stripe.livePaymentsEnabled, false);

const bridge = buildPartnerDashboardBridgeStatus({ repoExists:false });
assert.equal(bridge.dashboardRepoStatus, "repo_not_found");
assert.equal(bridge.requiredPartners.length, 3);
assert.equal(bridge.productionReadinessVerified, false);

const actions = buildPartnerProgramAutonomyActions(program, { now });
assert.ok(actions.find((action) => action.actionType === "generate_partner_program_proposal" && action.decisionClass === "automatic"));
assert.ok(actions.find((action) => action.actionType === "send_partner_program_proposal" && action.decisionClass === "approval_required"));
assert.ok(actions.find((action) => action.actionType === "change_partner_program_pricing" && action.decisionClass === "human_review"));
assert.ok(actions.find((action) => action.actionType === "promise_partner_program_outcome" && action.decisionClass === "forbidden"));

console.log("partner program engine tests passed");

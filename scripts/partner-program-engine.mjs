import crypto from "node:crypto";

export const partnerProgramStatuses = [
  "lead",
  "qualified",
  "proposal_draft",
  "proposal_sent",
  "checkout_started",
  "paid",
  "onboarding",
  "page_draft",
  "dashboard_draft",
  "ready_for_approval",
  "active",
  "reporting",
  "final_report",
  "renewal",
  "expansion",
  "stalled",
  "lost"
];

export const partnerProgramTiers = {
  starter: {
    label: "Starter Program",
    audience: "smaller nonprofits, clinics, and community organizations",
    pricingRange: "$7,500-$15,000",
    scope: "A focused 90-day Record-Clearing Access Program with a co-branded landing page, Wilma intake, RecordShield access, Expungement.ai routing, partner dashboard, weekly reporting, and final impact report."
  },
  implementation: {
    label: "Implementation Program",
    audience: "coalitions, cities, large nonprofits, and counties",
    pricingRange: "$20,000-$45,000",
    scope: "A 90-day implementation program with campaign planning, partner landing page, Wilma intake, RecordShield access, Expungement.ai routing, dashboard instrumentation, weekly partner reports, final impact report, and renewal/expansion recommendations."
  },
  strategic: {
    label: "Strategic Program",
    audience: "national organizations and funder-backed initiatives",
    pricingRange: "$50,000+",
    scope: "A strategic 90-day infrastructure program for multi-region or funder-backed access initiatives with executive reporting, dashboard provisioning, campaign kit support, weekly reporting, final impact report, and expansion planning."
  }
};

export const rcapComplianceNote = "LegalEase provides guided intake, information, workflow infrastructure, document preparation support where available, and partner reporting. LegalEase does not guarantee eligibility, court approval, filing acceptance, or legal outcomes.";

const requiredPartnerDashboardSlugs = ["demo-partner", "we-must-vote", "fulton-county"];

function clean(value = "") {
  return String(value ?? "").trim();
}

function slug(value = "") {
  return clean(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "partner-program";
}

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

function todayIso(options = {}) {
  return nowIso(options).slice(0, 10);
}

function normalizeTier(value = "") {
  const text = clean(value).toLowerCase();
  if (/strategic/.test(text)) return "strategic";
  if (/implementation|county|coalition|city|large/.test(text)) return "implementation";
  return "starter";
}

function normalizeStatus(value = "") {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return partnerProgramStatuses.includes(normalized) ? normalized : "lead";
}

function money(value = 0) {
  const amount = Number(value || 0);
  return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function num(value = 0) {
  return Number(value || 0).toLocaleString("en-US");
}

function pct(part = 0, whole = 0) {
  const denominator = Number(whole || 0);
  if (!denominator) return "0%";
  return Math.round((Number(part || 0) / denominator) * 100) + "%";
}

function esc(value = "") {
  return clean(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
}

function metrics(program = {}) {
  return {
    pageViews: Number(program.metrics?.pageViews || program.pageViews || 0),
    intakeStarts: Number(program.metrics?.intakeStarts || program.intakeStarts || 0),
    recordShieldStarts: Number(program.metrics?.recordShieldStarts || program.recordShieldStarts || 0),
    recordShieldCompletions: Number(program.metrics?.recordShieldCompletions || program.recordShieldCompletions || 0),
    expungementHandoffs: Number(program.metrics?.expungementHandoffs || program.expungementHandoffs || 0),
    paidConversions: Number(program.metrics?.paidConversions || program.paidConversions || 0),
    dropOffs: Number(program.metrics?.dropOffs || program.dropOffs || 0),
    revenueBooked: Number(program.metrics?.revenueBooked || program.revenueBooked || 0),
    sponsoredUserValue: Number(program.metrics?.sponsoredUserValue || program.sponsoredUserValue || 0)
  };
}

function defaultNextAction(program = {}) {
  if (program.paymentStatus === "paid" && !["active", "reporting", "final_report", "renewal", "expansion"].includes(program.status)) return "Start onboarding, approve the landing page, and activate dashboard provisioning.";
  if (program.status === "proposal_draft") return "Review proposal and mark sent after human approval.";
  if (program.status === "proposal_sent") return "Follow up for package decision and checkout timing.";
  if (program.status === "page_draft") return "Review co-branded landing page for compliance and partner approval.";
  if (program.status === "dashboard_draft") return "Verify partner dashboard readiness before activation.";
  if (program.status === "active") return "Generate weekly report and review blockers.";
  if (program.status === "reporting") return "Prepare case study, renewal, or expansion recommendation.";
  if (program.status === "stalled") return "Decide whether to revive, reframe, or close this program.";
  return "Qualify package tier, scope, owner, and next decision.";
}

export function normalizePartnerProgram(input = {}, options = {}) {
  const generatedAt = nowIso(options);
  const tier = normalizeTier(input.packageTier || input.tier);
  const status = normalizeStatus(input.status || (input.paymentStatus === "paid" ? "paid" : "lead"));
  const normalized = {
    id: clean(input.id) || `partner-program-${slug(input.name || input.partnerName || input.slug)}-${crypto.randomUUID().slice(0, 8)}`,
    name: clean(input.name || input.partnerName) || "Unnamed Partner Program",
    slug: slug(input.slug || input.name || input.partnerName),
    partnerType: clean(input.partnerType || input.type) || "nonprofit",
    status,
    packageTier: tier,
    packageTierLabel: partnerProgramTiers[tier].label,
    paymentStatus: clean(input.paymentStatus) || "unpaid",
    primaryContact: clean(input.primaryContact),
    brand: {
      name: clean(input.brand?.name || input.name || input.partnerName),
      logoUrl: clean(input.brand?.logoUrl || input.logoUrl),
      primaryColor: clean(input.brand?.primaryColor) || "#0F1F5C",
      accentColor: clean(input.brand?.accentColor) || "#E83A0A"
    },
    programGoal: clean(input.programGoal) || "Launch a 90-day Record-Clearing Access Program with measurable access, routing, and reporting.",
    targetAudience: clean(input.targetAudience) || partnerProgramTiers[tier].audience,
    jurisdiction: clean(input.jurisdiction || input.state) || "TBD",
    launchDate: clean(input.launchDate),
    partnerDashboardUrl: clean(input.partnerDashboardUrl),
    partnerLandingPageUrl: clean(input.partnerLandingPageUrl),
    proposalStatus: clean(input.proposalStatus) || "not_started",
    weeklyReportStatus: clean(input.weeklyReportStatus) || "not_started",
    finalReportStatus: clean(input.finalReportStatus) || "not_started",
    metrics: metrics(input),
    nextAction: clean(input.nextAction) || defaultNextAction({ ...input, status, paymentStatus: clean(input.paymentStatus) || "unpaid" }),
    owner: clean(input.owner) || "Roger",
    dashboardProvisioningStatus: clean(input.dashboardProvisioningStatus) || "not_started",
    dashboardRepoStatus: clean(input.dashboardRepoStatus) || "unknown",
    supabasePartnerRecordStatus: clean(input.supabasePartnerRecordStatus) || "unknown",
    adminWriteVerified: Boolean(input.adminWriteVerified),
    productionReadinessVerified: Boolean(input.productionReadinessVerified),
    lastDashboardSyncAt: clean(input.lastDashboardSyncAt),
    relatedPartnerId: clean(input.relatedPartnerId || input.partnerId),
    relatedCampaigns: Array.isArray(input.relatedCampaigns) ? input.relatedCampaigns : [],
    relatedPilots: Array.isArray(input.relatedPilots) ? input.relatedPilots : [],
    relatedReports: Array.isArray(input.relatedReports) ? input.relatedReports : [],
    history: Array.isArray(input.history) ? input.history : [{ action:"created", at: generatedAt, note:"Partner Program record created." }],
    createdAt: clean(input.createdAt) || generatedAt,
    updatedAt: clean(input.updatedAt) || generatedAt
  };
  return normalized;
}

function templateShell(title = "", body = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  :root{--navy:#0F1F5C;--orange:#E83A0A;--teal:#00A99D;--line:#DDE0E8;--bg:#F4F5F7;--text:#1A1A2E;--muted:#6B7280;--white:#fff}
  *{box-sizing:border-box} body{margin:0;background:#E8E9ED;color:var(--text);font-family:Sora,Inter,Arial,sans-serif;padding:32px}
  .doc{max-width:940px;margin:auto;background:var(--white);box-shadow:0 18px 50px rgba(15,31,92,.16);border-radius:18px;overflow:hidden}
  .hero{background:var(--navy);color:white;padding:44px 52px}.eyebrow{color:var(--teal);font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.hero h1{font-size:44px;line-height:1;margin:12px 0}.hero p{max-width:720px;color:rgba(255,255,255,.72);font-size:18px;line-height:1.5}
  .body{padding:38px 52px;display:grid;gap:22px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{border:1px solid var(--line);border-radius:14px;padding:18px;background:white}.card strong{display:block;color:var(--navy);font-size:22px}.section h2{color:var(--navy);margin:0 0 10px}.muted{color:var(--muted);line-height:1.55}.timeline{display:grid;gap:10px}.timeline div{border-left:4px solid var(--teal);padding:10px 14px;background:var(--bg);border-radius:10px}.notice{border-left:5px solid var(--orange);background:#fff7ed;padding:16px;border-radius:12px;color:#7c2d12}.footer{padding:18px 52px;background:var(--bg);color:var(--muted);font-size:13px}
  @media(max-width:760px){body{padding:12px}.hero,.body,.footer{padding:24px}.grid{grid-template-columns:1fr}.hero h1{font-size:32px}}
</style>
</head><body><article class="doc">${body}</article></body></html>`;
}

function metricCards(program = {}) {
  const m = metrics(program);
  return `<div class="grid">
    <div class="card"><span class="muted">Page views</span><strong>${num(m.pageViews)}</strong></div>
    <div class="card"><span class="muted">Wilma intake starts</span><strong>${num(m.intakeStarts)}</strong></div>
    <div class="card"><span class="muted">RecordShield starts</span><strong>${num(m.recordShieldStarts)}</strong></div>
    <div class="card"><span class="muted">RecordShield completions</span><strong>${num(m.recordShieldCompletions)}</strong></div>
    <div class="card"><span class="muted">Expungement.ai handoffs</span><strong>${num(m.expungementHandoffs)}</strong></div>
    <div class="card"><span class="muted">Booked revenue</span><strong>${money(m.revenueBooked)}</strong></div>
  </div>`;
}

function markdownForArtifact(program = {}, artifactType = "", options = {}) {
  const m = metrics(program);
  const title = {
    proposal: "Partner Program Proposal",
    landing_page: "Co-Branded Partner Page",
    weekly_report: "Weekly Partner Report",
    final_report: "Final Impact Report"
  }[artifactType] || "Partner Program Artifact";
  return `# ${program.name} ${title}

Generated: ${nowIso(options)}
Status: Draft for human review. Do not send automatically.
Review before sending, publishing, or sharing externally.

## Program
- Tier: ${program.packageTierLabel}
- Partner type: ${program.partnerType}
- Jurisdiction: ${program.jurisdiction}
- Goal: ${program.programGoal}
- Audience: ${program.targetAudience}

## Metrics
- Page views: ${num(m.pageViews)}
- Wilma intake starts: ${num(m.intakeStarts)}
- RecordShield starts: ${num(m.recordShieldStarts)}
- RecordShield completions: ${num(m.recordShieldCompletions)}
- Expungement.ai handoffs: ${num(m.expungementHandoffs)}
- Paid conversions: ${num(m.paidConversions)}
- Drop-offs: ${num(m.dropOffs)}
- Revenue booked: ${money(m.revenueBooked)}

## Next Step
${program.nextAction}

${artifactType === "final_report" ? "## Expansion recommendation\nReview renewal, case study, and expansion path after partner approval.\n" : ""}
## Compliance Note
${rcapComplianceNote}
`;
}

function artifactJson(program = {}, artifactType = "", options = {}) {
  return {
    artifactType,
    programId: program.id,
    programSlug: program.slug,
    programName: program.name,
    generatedAt: nowIso(options),
    status: "draft",
    complianceNote: rcapComplianceNote,
    metrics: metrics(program),
    reviewRequired: true,
    externalSendAllowed: false
  };
}

function proposalHtml(program = {}, options = {}) {
  const tier = partnerProgramTiers[program.packageTier] || partnerProgramTiers.starter;
  return templateShell(`${program.name} RCAP Proposal`, `
    <header class="hero"><div class="eyebrow">LegalEase Record-Clearing Access Program</div><h1>${esc(program.name)} Proposal</h1><p>A 90-day operating program that turns outreach into guided intake, RecordShield access, Expungement.ai routing, partner dashboard visibility, weekly reports, and a final impact report.</p></header>
    <div class="body">
      <section class="section"><h2>Program scope</h2><p class="muted">${esc(tier.scope)}</p></section>
      <section class="section">${metricCards(program)}</section>
      <section class="section"><h2>Implementation timeline</h2><div class="timeline"><div><strong>Weeks 1-2:</strong> Partner onboarding, scope confirmation, landing page draft, dashboard setup.</div><div><strong>Weeks 3-10:</strong> Live campaign operations, Wilma intake, RecordShield access, Expungement.ai routing, weekly reporting.</div><div><strong>Weeks 11-12:</strong> Final impact report, renewal recommendation, case study review if approved.</div></div></section>
      <section class="section"><h2>Package and investment</h2><p class="muted">${esc(tier.label)} for ${esc(tier.audience)}. Planning range: <strong>${esc(tier.pricingRange)}</strong>. Pricing changes require human review.</p></section>
      <section class="section"><h2>Program components</h2><div class="grid"><div class="card">Partner Landing Page</div><div class="card">Wilma Intake</div><div class="card">RecordShield Access</div><div class="card">Expungement.ai Routing</div><div class="card">Partner Dashboard</div><div class="card">Weekly + Final Reports</div></div></section>
      <section class="notice"><strong>Compliance Note:</strong> ${esc(rcapComplianceNote)} The program supports structured access, user education, and approved routing.</section>
      <section class="section"><h2>Next step</h2><p class="muted">${esc(program.nextAction || "Review proposal, confirm scope, and mark sent after approval.")}</p></section>
    </div><footer class="footer">Generated ${esc(nowIso(options))}. Draft only; no automatic sending.</footer>`);
}

function landingPageHtml(program = {}, options = {}) {
  const baseUrl = program.partnerLandingPageUrl || `https://legalease.com/partners/${program.slug}`;
  const ctaUrl = `${baseUrl}?utm_source=partner&utm_medium=landing_page&utm_campaign=${encodeURIComponent(program.slug)}`;
  return templateShell(`${program.name} RCAP Landing Page`, `
    <header class="hero"><div class="eyebrow">LegalEase × ${esc(program.brand?.name || program.name)}</div><h1>Record-Clearing Access Program</h1><p>${esc(program.programGoal)} This page is drafted for partner and compliance approval before publishing.</p></header>
    <div class="body">
      <section class="section"><h2>How the access pipeline works</h2><div class="grid"><div class="card"><strong>1</strong><span>Wilma Intake</span><p class="muted">Plain-English guided intake starts the workflow.</p></div><div class="card"><strong>2</strong><span>RecordShield Access</span><p class="muted">Participants can understand what may show up and what information is needed.</p></div><div class="card"><strong>3</strong><span>Expungement.ai Routing</span><p class="muted">Users are routed to available next steps, document preparation support where available, partner referrals, or future notifications.</p></div></div></section>
      <section class="section"><h2>Partner-specific access link</h2><p class="muted"><a href="${esc(ctaUrl)}">${esc(ctaUrl)}</a></p></section>
      <section class="section"><h2>FAQ</h2><div class="timeline"><div><strong>Is this legal advice?</strong> No. LegalEase provides information, workflow infrastructure, and support where available. It is not legal advice.</div><div><strong>Does this guarantee record clearing?</strong> No. Results depend on jurisdiction, facts, court processing, and other factors outside LegalEase’s control.</div><div><strong>What does the partner receive?</strong> Dashboard visibility, weekly reports, and a final impact report.</div></div></section>
      <section class="notice"><strong>Compliance Note:</strong> ${esc(rcapComplianceNote)}</section>
    </div><footer class="footer">Generated ${esc(nowIso(options))}. Publish requires partner approval and human review.</footer>`);
}

function weeklyReportHtml(program = {}, options = {}) {
  const m = metrics(program);
  return templateShell(`${program.name} Weekly Report`, `
    <header class="hero"><div class="eyebrow">Weekly Partner Report</div><h1>${esc(program.name)}</h1><p>Record-Clearing Access Program weekly report. Draft for review before sharing externally.</p></header>
    <div class="body">
      <section class="section">${metricCards(program)}</section>
      <section class="section"><h2>Funnel movement</h2><div class="timeline"><div>Landing page to intake: ${pct(m.intakeStarts, m.pageViews)}</div><div>Intake to RecordShield start: ${pct(m.recordShieldStarts, m.intakeStarts)}</div><div>RecordShield completion rate: ${pct(m.recordShieldCompletions, m.recordShieldStarts)}</div><div>Expungement.ai handoff rate: ${pct(m.expungementHandoffs, m.recordShieldCompletions)}</div></div></section>
      <section class="section"><h2>Blockers and next steps</h2><p class="muted">${esc(program.nextAction || "Review distribution, drop-offs, and partner follow-up.")}</p></section>
      <section class="notice"><strong>Compliance Note:</strong> ${esc(rcapComplianceNote)} Screening results are operational indicators only and are not legal determinations.</section>
    </div><footer class="footer">Generated ${esc(nowIso(options))}. Weekly report template derived from LegalEase RCAP weekly report materials.</footer>`);
}

function finalReportHtml(program = {}, options = {}) {
  const m = metrics(program);
  return templateShell(`${program.name} Final Impact Report`, `
    <header class="hero"><div class="eyebrow">90-Day Record-Clearing Access Program</div><h1>Final Impact Report</h1><p>${esc(program.name)} completed or is preparing a final program review across activity, funnel performance, partner outcomes, bottlenecks, and expansion opportunities.</p></header>
    <div class="body">
      <section class="section"><h2>Executive summary</h2><p class="muted">The program created a structured access pathway from partner outreach through Wilma intake, RecordShield access, Expungement.ai routing, dashboard reporting, and follow-up recommendations.</p></section>
      <section class="section">${metricCards(program)}</section>
      <section class="section"><h2>Lessons and bottlenecks</h2><div class="timeline"><div>Drop-offs recorded: ${num(m.dropOffs)}. Review landing page handoff, intake friction, and partner distribution cadence.</div><div>RecordShield to Expungement.ai handoffs: ${num(m.expungementHandoffs)}. Review conversion language and support flow.</div><div>Partner outcomes require partner-approved interpretation before public use.</div></div></section>
      <section class="section"><h2>Expansion recommendation</h2><p class="muted">If partner approvals and outcome data support it, evaluate renewal, broader jurisdiction coverage, case study permission, or funder-backed expansion.</p></section>
      <section class="notice"><strong>Compliance Note:</strong> ${esc(rcapComplianceNote)} Operational screening indicators are not legal determinations.</section>
    </div><footer class="footer">Generated ${esc(nowIso(options))}. Final impact report draft for review.</footer>`);
}

export function buildPartnerProgramArtifact(input = {}, artifactType = "proposal", options = {}) {
  const program = normalizePartnerProgram(input, options);
  const normalizedType = clean(artifactType).toLowerCase().replace(/-/g, "_");
  const html = normalizedType === "landing_page"
    ? landingPageHtml(program, options)
    : normalizedType === "weekly_report"
      ? weeklyReportHtml(program, options)
      : normalizedType === "final_report"
        ? finalReportHtml(program, options)
        : proposalHtml(program, options);
  const type = ["proposal", "landing_page", "weekly_report", "final_report"].includes(normalizedType) ? normalizedType : "proposal";
  return {
    id: `partner-artifact-${type}-${program.slug}-${crypto.randomUUID().slice(0, 8)}`,
    partnerProgramId: program.id,
    partnerProgramSlug: program.slug,
    artifactType: type,
    title: `${program.name} ${type.replaceAll("_", " ")}`,
    html,
    markdown: markdownForArtifact(program, type, options),
    json: artifactJson(program, type, options),
    complianceNote: rcapComplianceNote,
    sourceTemplate: {
      proposal: "LegalEase Pilot Proposal HTML",
      landing_page: "LegalEase Record-Clearing Access Program HTML",
      weekly_report: "LegalEase Weekly Report Template HTML",
      final_report: "LegalEase Final Impact Report Sample HTML"
    }[type],
    generatedAt: nowIso(options),
    status: "draft",
    reviewRequired: true,
    externalSendAllowed: false
  };
}

export function partnerProgramOverview(state = {}, options = {}) {
  const programs = (Array.isArray(state.partnerPrograms) ? state.partnerPrograms : []).map((item) => normalizePartnerProgram(item, options));
  const paid = programs.filter((program) => program.paymentStatus === "paid");
  const onboarding = programs.filter((program) => program.paymentStatus === "paid" && ["paid", "onboarding", "page_draft", "dashboard_draft", "ready_for_approval"].includes(program.status));
  const proposalsNeedReview = programs.filter((program) => ["draft", "ready_for_review", "generated"].includes(program.proposalStatus) || program.status === "proposal_draft");
  const pagesNeedApproval = programs.filter((program) => ["page_draft", "ready_for_approval"].includes(program.status) || ["draft", "ready_for_review"].includes(program.pageStatus));
  const dashboardsNeedActivation = programs.filter((program) => program.dashboardProvisioningStatus && !["active", "verified"].includes(program.dashboardProvisioningStatus));
  const weeklyReportsDue = programs.filter((program) => ["active", "reporting"].includes(program.status) && program.weeklyReportStatus !== "ready_for_review");
  const stalled = programs.filter((program) => program.status === "stalled");
  const renewalCandidates = programs.filter((program) => ["reporting", "final_report", "renewal", "case_study", "expansion"].includes(program.status));
  return {
    total: programs.length,
    paid,
    onboarding,
    proposalsNeedReview,
    pagesNeedApproval,
    dashboardsNeedActivation,
    weeklyReportsDue,
    stalled,
    renewalCandidates,
    revenueBooked: paid.reduce((sum, program) => sum + Number(program.metrics?.revenueBooked || 0), 0),
    generatedAt: nowIso(options)
  };
}

export function partnerProgramStripeReadiness(env = process.env) {
  const required = [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_STARTER_ACCESS_PROGRAM",
    "STRIPE_PRICE_IMPLEMENTATION_PROGRAM",
    "STRIPE_PRICE_STRATEGIC_PROGRAM"
  ];
  const missing = required.filter((key) => !clean(env[key]));
  return {
    configured: missing.length === 0,
    missing,
    prices: {
      starter: Boolean(env.STRIPE_PRICE_STARTER_ACCESS_PROGRAM),
      implementation: Boolean(env.STRIPE_PRICE_IMPLEMENTATION_PROGRAM),
      strategic: Boolean(env.STRIPE_PRICE_STRATEGIC_PROGRAM)
    },
    webhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
    livePaymentsEnabled: false,
    note: "Stripe readiness is diagnostic only. No checkout is started automatically."
  };
}

export function buildPartnerDashboardBridgeStatus(input = {}) {
  const repoExists = Boolean(input.repoExists);
  const partnerRecords = Array.isArray(input.partnerRecords) ? input.partnerRecords : [];
  const now = input.now || new Date().toISOString();
  const requiredPartners = requiredPartnerDashboardSlugs.map((slugValue) => {
    const record = partnerRecords.find((item) => item.slug === slugValue || item.id === slugValue);
    return {
      slug: slugValue,
      present: Boolean(record),
      adminWriteVerified: Boolean(record?.adminWriteVerified),
      productionReadinessVerified: Boolean(record?.productionReadinessVerified)
    };
  });
  return {
    dashboardProvisioningStatus: repoExists ? "ready_to_verify" : "blocked",
    dashboardRepoStatus: repoExists ? "repo_found" : "repo_not_found",
    supabasePartnerRecordStatus: requiredPartners.every((item) => item.present) ? "required_records_present" : "missing_required_records",
    adminWriteVerified: requiredPartners.every((item) => item.adminWriteVerified),
    productionReadinessVerified: repoExists && requiredPartners.every((item) => item.productionReadinessVerified),
    lastDashboardSyncAt: now,
    requiredPartners
  };
}

function autonomyAction(actionType, title, decisionClass, description, program = {}, options = {}) {
  return {
    id: `autonomy-partner-program-${slug(actionType)}-${slug(program.id || program.slug)}`,
    actionType,
    title,
    description,
    decisionClass,
    approvalPolicy: decisionClass === "forbidden" ? "never_execute" : decisionClass,
    requiredRole: decisionClass === "automatic" ? "system" : decisionClass === "human_review" ? "owner" : "reviewer",
    status: "pending",
    sourceType: "partner_program",
    sourceId: program.id,
    riskLevel: decisionClass === "forbidden" || decisionClass === "human_review" ? "high" : decisionClass === "approval_required" ? "medium" : "low",
    createdAt: nowIso(options)
  };
}

export function buildPartnerProgramAutonomyActions(program = {}, options = {}) {
  const normalized = normalizePartnerProgram(program, options);
  return [
    autonomyAction("generate_partner_program_proposal", `Generate proposal draft for ${normalized.name}`, "automatic", "Draft-only internal artifact generation.", normalized, options),
    autonomyAction("generate_partner_program_landing_page", `Generate landing page draft for ${normalized.name}`, "automatic", "Draft-only page generation for human review.", normalized, options),
    autonomyAction("generate_partner_program_weekly_report", `Generate weekly report draft for ${normalized.name}`, "automatic", "Draft-only partner report generation.", normalized, options),
    autonomyAction("generate_partner_program_final_report", `Generate final impact report draft for ${normalized.name}`, "automatic", "Draft-only final report generation.", normalized, options),
    autonomyAction("send_partner_program_proposal", `Send proposal for ${normalized.name}`, "approval_required", "External proposal sending requires human approval and no automatic email.", normalized, options),
    autonomyAction("publish_partner_program_landing_page", `Publish landing page for ${normalized.name}`, "approval_required", "Publishing requires partner and compliance approval.", normalized, options),
    autonomyAction("activate_partner_dashboard", `Activate partner dashboard for ${normalized.name}`, "approval_required", "Dashboard activation requires readiness verification.", normalized, options),
    autonomyAction("change_partner_program_pricing", `Change pricing for ${normalized.name}`, "human_review", "Pricing changes require owner review.", normalized, options),
    autonomyAction("modify_partner_program_compliance_language", `Modify compliance language for ${normalized.name}`, "human_review", "Compliance language changes require hard human review.", normalized, options),
    autonomyAction("promise_partner_program_outcome", `Promise outcomes for ${normalized.name}`, "forbidden", "LegalEase must not promise eligibility, court approval, filing acceptance, or legal outcomes.", normalized, options)
  ];
}

export function partnerProgramEvent(eventType = "partner_program_updated", program = {}, metadata = {}, options = {}) {
  return {
    id: `event-partner-program-${slug(eventType)}-${crypto.randomUUID().slice(0, 8)}`,
    eventType,
    title: `${program.name || "Partner program"}: ${eventType.replaceAll("_", " ")}`,
    timestamp: nowIso(options),
    createdAt: nowIso(options),
    actor: "local_operator",
    source: "partner_program_engine",
    objectType: "partner_program",
    objectId: program.id,
    partnerId: program.relatedPartnerId || "",
    campaignId: Array.isArray(program.relatedCampaigns) ? program.relatedCampaigns[0] || "" : "",
    riskLevel: metadata.riskLevel || "low",
    proofValue: metadata.proofValue || "partner_program",
    revenueImpact: Number(program.metrics?.revenueBooked || 0),
    nextAction: program.nextAction || "",
    metadata
  };
}

export function partnerProgramTask(title = "", program = {}, input = {}, options = {}) {
  return {
    id: `task-partner-program-${slug(title)}-${crypto.randomUUID().slice(0, 6)}`,
    title,
    description: input.description || `Partner Program task for ${program.name}.`,
    owner: input.owner || program.owner || "Roger",
    status: "open",
    priority: input.priority || "high",
    dueDate: input.dueDate || todayIso(options),
    sourceType: "partner_program",
    sourceId: program.id,
    partnerId: program.relatedPartnerId || "",
    campaignId: Array.isArray(program.relatedCampaigns) ? program.relatedCampaigns[0] || "" : "",
    riskLevel: input.riskLevel || "medium",
    nextAction: input.nextAction || title,
    escalationReason: input.escalationReason || "Partner Program workflow requires operator follow-through.",
    history: [{ action:"created", at: nowIso(options), note:"Created by Partner Program Engine." }],
    createdAt: nowIso(options),
    updatedAt: nowIso(options)
  };
}

export function defaultPartnerProgramSeeds(options = {}) {
  return [
    normalizePartnerProgram({
      id: "partner-program-we-must-vote",
      name: "We Must Vote Record-Clearing Access Program",
      slug: "we-must-vote",
      partnerType: "nonprofit",
      status: "proposal_draft",
      packageTier: "Implementation Program",
      paymentStatus: "unpaid",
      programGoal: "Launch a civic access record-clearing pathway campaign with weekly reporting.",
      targetAudience: "Residents who need plain-English next steps for record-clearing access.",
      jurisdiction: "Texas",
      nextAction: "Review proposal and confirm package decision.",
      owner: "Roger"
    }, options),
    normalizePartnerProgram({
      id: "partner-program-fulton-county",
      name: "Fulton County Backlog Triage RCAP",
      slug: "fulton-county",
      partnerType: "county",
      status: "qualified",
      packageTier: "Starter Program",
      paymentStatus: "unpaid",
      programGoal: "Scope a smaller 30- to 90-day access and backlog triage program.",
      jurisdiction: "Georgia",
      nextAction: "Generate proposal draft and follow-up task.",
      owner: "Roger"
    }, options),
    normalizePartnerProgram({
      id: "partner-program-demo-partner",
      name: "Demo Partner RCAP",
      slug: "demo-partner",
      partnerType: "workforce",
      status: "dashboard_draft",
      packageTier: "Starter Program",
      paymentStatus: "paid",
      programGoal: "Verify partner dashboard provisioning workflow.",
      jurisdiction: "Multi-state",
      metrics: { revenueBooked: 12500, pageViews: 320, intakeStarts: 84, recordShieldStarts: 62 },
      nextAction: "Verify Partner Dashboard Readiness.",
      owner: "Operations"
    }, options)
  ];
}

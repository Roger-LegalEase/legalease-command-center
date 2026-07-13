import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 2026-07-13 ground-truth reset: this script writes FICTIONAL demo partners, pilots,
// campaigns, and milestones. Prod state was purged of that fiction; re-running this by
// accident (and then syncing local JSON to Supabase) would resurrect it. Explicit opt-in
// only, and never against the Supabase backend.
if (process.env.ALLOW_DEMO_DATA !== "1") {
  console.error("create-demo-dataset.mjs is disabled: it loads fictional demo records that were purged from real state on 2026-07-13. Set ALLOW_DEMO_DATA=1 to run it against a local sandbox only.");
  process.exit(1);
}
if ((process.env.STORAGE_BACKEND || "").toLowerCase() === "supabase") {
  console.error("create-demo-dataset.mjs refuses to run with STORAGE_BACKEND=supabase.");
  process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "data", "social-command-center.json");
const backupDir = path.join(rootDir, "data", "backups", "demo-dataset");
const now = "2026-05-22T12:00:00.000Z";
const today = "2026-05-22";

function readState() {
  return JSON.parse(readFileSync(dataPath, "utf8"));
}

function writeState(state) {
  writeFileSync(dataPath, `${JSON.stringify(state, null, 2)}\n`);
}

function backupCurrentState() {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `social-command-center-before-demo-${stamp}.json`);
  copyFileSync(dataPath, backupPath);
  return backupPath;
}

function ensureDemoFinalPng() {
  const exportDir = path.join(rootDir, "data", "exports", "final-pngs");
  mkdirSync(exportDir, { recursive: true });
  const targetName = "legalease-recordshield-linkedin-square-2026-05-22-demo-post-ready.png";
  const targetPath = path.join(exportDir, targetName);
  if (!existsSync(targetPath)) {
    const existing = [
      "legalease-legalease-pov-linkedin-square-2026-05-20-cd392274-6a64-404a-bf30-55c6f60fe631.png"
    ].map((name) => path.join(exportDir, name)).find(existsSync);
    if (existing) copyFileSync(existing, targetPath);
  }
  const size = existsSync(targetPath) ? statSync(targetPath).size : 0;
  return {
    filename: targetName,
    relativePath: `data/exports/final-pngs/${targetName}`,
    size
  };
}

function ensurePostingKit(finalPng) {
  const kitDir = path.join(rootDir, "data", "exports", "posting-kits", "demo-post-ready-2026-05-22");
  mkdirSync(kitDir, { recursive: true });
  if (finalPng.size && existsSync(path.join(rootDir, finalPng.relativePath))) {
    copyFileSync(path.join(rootDir, finalPng.relativePath), path.join(kitDir, "final.png"));
  }
  const files = {
    "caption.txt": "RecordShield turns uncertainty into a clear next step.\n\nFor partners, that means fewer people guessing what might show up and more people starting from facts.\n\n#RecordShield #LegalTech #SecondChance",
    "hashtags.txt": "#RecordShield #LegalTech #SecondChance",
    "alt-text.txt": "LegalEase RecordShield social graphic about helping people understand record information before it blocks an opportunity.",
    "posting-notes.txt": "Investor demo item. Manual posting only. Confirm account/channel before live publishing.",
    "metadata.json": JSON.stringify({
      postId: "demo-post-ready",
      title: "RecordShield turns uncertainty into a clear next step",
      platform: "linkedin",
      contentBucket: "RecordShield",
      speaker: "LegalEase",
      finalPngFilename: finalPng.filename,
      finalPngSourcePath: finalPng.relativePath,
      generatedAt: now,
      manualPostingKitStatus: "ready",
      livePostingStatus: "disabled/manual-only"
    }, null, 2)
  };
  for (const [filename, body] of Object.entries(files)) {
    writeFileSync(path.join(kitDir, filename), `${body}\n`);
  }
  return {
    relativePath: "data/exports/posting-kits/demo-post-ready-2026-05-22",
    fileList: ["final.png", ...Object.keys(files)]
  };
}

function postBase(id, title, platform, status, patch = {}) {
  return {
    id,
    title,
    platform,
    status,
    contentType: patch.contentType || "growth_update",
    campaign: patch.campaign || "",
    scheduledFor: patch.scheduledFor || "",
    hook: patch.hook || title,
    body: patch.body || "",
    cta: patch.cta || "Make the next step easier to understand.",
    hashtags: patch.hashtags || ["#LegalEase", "#RecordShield"],
    complianceRisk: patch.complianceRisk || "low",
    complianceNotes: patch.complianceNotes || "Educational content only. No legal advice or guaranteed outcomes.",
    createdAt: patch.createdAt || now,
    updatedAt: now,
    speaker: patch.speaker || "legalease",
    audience: patch.audience || "funders",
    contentBucket: patch.contentBucket || "LegalEase Growth",
    targetChannels: patch.targetChannels || [platform],
    copyReviewed: Boolean(patch.copyReviewed),
    copyReviewedAt: patch.copyReviewed ? now : "",
    overlayConfirmed: Boolean(patch.overlayConfirmed),
    overlayConfirmedAt: patch.overlayConfirmed ? now : "",
    imageFinalized: Boolean(patch.imageFinalized),
    finalPreviewConfirmed: Boolean(patch.finalPreviewConfirmed),
    manualPostingKitReady: Boolean(patch.manualPostingKitReady),
    publishingStatus: patch.publishingStatus || "",
    publishErrorSummary: patch.publishErrorSummary || "",
    wilmaImageWorkflow: {
      state: patch.workflowState || "Draft",
      visualBucket: patch.contentBucket || "LegalEase Growth",
      wilmaExpression: patch.wilmaExpression || "",
      wilmaPoseReferenceId: patch.wilmaPoseReferenceId || "",
      wilmaPoseReferenceName: patch.wilmaPoseReferenceName || "",
      platformFormatSize: "1:1 square PNG, 1200 x 1200 preview target",
      overlayText: patch.overlayHeadline || title.split(" ").slice(0, 8).join(" "),
      imagePrompt: patch.imagePrompt || "",
      negativePrompt: "No legal guarantees, fake logos, government seals, court victory imagery, mugshots, jail bars, handcuffs, or readable fake text.",
      brandSafeRules: ["No legal guarantees", "No fake partner logos", "No mugshots", "No readable fake text"],
      overlayRules: ["Keep copy short", "No outcome promises", "Readable on mobile"]
    },
    ...patch
  };
}

const state = readState();
const backupPath = backupCurrentState();
const finalPng = ensureDemoFinalPng();
const postingKit = ensurePostingKit(finalPng);

const finalKit = {
  status: "ready",
  platformFormatId: "linkedin-square",
  platformFormatLabel: "LinkedIn Square",
  platform: "linkedin",
  width: 1200,
  height: 1200,
  dimensions: "1200x1200",
  contentBucket: "RecordShield",
  overlayText: "Uncertainty becomes a next step",
  caption: "RecordShield turns uncertainty into a clear next step.\n\nFor partners, that means fewer people guessing what might show up and more people starting from facts.",
  hashtags: "#RecordShield #LegalTech #SecondChance",
  altText: "LegalEase RecordShield social graphic about turning confusing record information into a clearer next step.",
  postingNotes: "Manual posting only. Confirm final channel before posting.",
  exportFilename: finalPng.filename,
  imageUrl: finalPng.relativePath,
  finalImageUrl: finalPng.relativePath,
  finalPngUrl: finalPng.relativePath,
  finalPngPath: finalPng.relativePath,
  finalPngFileSize: finalPng.size,
  finalPngGeneratedAt: now,
  downloadUrl: "/api/posts/demo-post-ready/final-png",
  finalPngReady: true,
  livePostingDisabled: true,
  operatorMustPostManually: true,
  manualPostingKitReady: true,
  postingPackage: {
    generated: true,
    path: postingKit.relativePath,
    relativePath: postingKit.relativePath,
    downloadUrl: `/data/exports/posting-kits/demo-post-ready-2026-05-22/metadata.json`,
    fileList: postingKit.fileList
  },
  updatedAt: now
};

state.posts = [
  postBase("demo-post-ready", "RecordShield turns uncertainty into a clear next step", "linkedin", "approved", {
    campaign: "RecordShield Beta Launch",
    hook: "RecordShield turns uncertainty into a clear next step.",
    body: "The first job is not to promise an outcome. It is to help people and partners understand what is in front of them, what might matter, and what action is worth taking next.",
    cta: "Use clarity as the first conversion event.",
    contentBucket: "RecordShield",
    speaker: "legalease",
    audience: "partners",
    copyReviewed: true,
    overlayConfirmed: true,
    imageFinalized: true,
    finalPreviewConfirmed: true,
    manualPostingKitReady: true,
    postingPackageGenerated: true,
    postingPackagePath: postingKit.relativePath,
    postingPackageDownloadUrl: `/data/exports/posting-kits/demo-post-ready-2026-05-22/metadata.json`,
    postingPackageGeneratedAt: now,
    postingPackageFileList: postingKit.fileList,
    postingPackage: finalKit.postingPackage,
    finalExportKit: finalKit,
    workflowState: "Manual Posting Kit Ready",
    imagePrompt: "Art-directed RecordShield image using archival paperwork as a designed metaphor for clarity. Text-free.",
    overlayHeadline: "Uncertainty becomes a next step"
  }),
  postBase("demo-post-image", "A county pilot needs a story people can repeat", "linkedin", "approved", {
    campaign: "County Intake Pilot",
    hook: "A county pilot needs a story people can repeat.",
    body: "The strongest pilot is not just a workflow. It is a simple promise staff can explain, residents can trust, and leadership can measure.",
    cta: "Turn the pilot into proof before it becomes a brochure.",
    contentBucket: "Pilot Proof",
    speaker: "legalease",
    audience: "partners",
    copyReviewed: true,
    overlayConfirmed: true,
    workflowState: "Needs Image",
    imagePrompt: "Create a text-free civic infrastructure scene for a county resident-services pilot."
  }),
  postBase("demo-post-review", "Wilma should explain the process without sounding like a lawyer", "facebook", "needs_review", {
    campaign: "Consumer Education",
    hook: "Wilma should explain the process without sounding like a lawyer.",
    body: "People do not need a lecture. They need a plain-English guide that says what to check, what not to assume, and when a human review matters.",
    cta: "Keep the explanation useful, careful, and human.",
    hashtags: ["#AskWilma", "#LegalEase"],
    contentBucket: "Wilma Explainer",
    speaker: "wilma",
    audience: "consumers",
    complianceRisk: "medium",
    workflowState: "Needs Copy Review"
  }),
  postBase("demo-post-blocked", "Do not launch a campaign without tracking", "linkedin", "blocked_channel_not_connected", {
    campaign: "Partner Referral Campaign",
    hook: "Do not launch a campaign without tracking.",
    body: "A partner campaign only becomes proof when referrals, RecordShield starts, and handoff behavior are visible.",
    cta: "Fix attribution before calling anything live.",
    contentBucket: "Growth Discipline",
    speaker: "legalease",
    audience: "internal",
    copyReviewed: true,
    publishErrorSummary: "LinkedIn account is not connected.",
    publishingStatus: "blocked"
  }),
  postBase("demo-post-posted", "Fresh Start Campaign produced the first proof loop", "linkedin", "manually_posted", {
    campaign: "Fresh Start Campaign",
    hook: "Fresh Start Campaign produced the first proof loop.",
    body: "A partner distributed the message, users started RecordShield, and the cleanup handoff produced measurable Expungement.ai intent.",
    cta: "This is the loop to repeat.",
    contentBucket: "Traction Update",
    speaker: "legalease",
    copyReviewed: true,
    overlayConfirmed: true,
    imageFinalized: true,
    finalPreviewConfirmed: true,
    manuallyPostedAt: "2026-05-21T15:30:00.000Z",
    performance: { impressions: 4200, likes: 118, comments: 14, shares: 22, saves: 31, reposts: 9, clicks: 86, leads: 17 },
    engagementRate: 4.6
  })
];

state.postImages = [
  {
    id: "demo-image-ready-v1",
    postId: "demo-post-ready",
    imageUrl: finalPng.relativePath,
    finalImageUrl: finalPng.relativePath,
    finalPngUrl: finalPng.relativePath,
    finalPngPath: finalPng.relativePath,
    finalPngFileSize: finalPng.size,
    finalPngGeneratedAt: now,
    generationStatus: "generated",
    imageStatus: "final_composited",
    generationMode: "openai_image_generation",
    finalImageReady: true,
    textRenderingMode: "baked_overlay",
    finalImageWidth: 1200,
    finalImageHeight: 1200,
    aspectRatio: "1:1",
    versionNumber: 1,
    promptVersion: "legalese-image-prompt-v3-art-directed",
    visualLane: "recordshield",
    visualLaneLabel: "RecordShield",
    artisticTreatment: "archival_futurism",
    artisticTreatmentLabel: "Archival Futurism",
    overlayZone: "upper-left",
    visualMetaphor: "A confusing record becomes a designed object of clarity and control.",
    wilmaTreatment: "none",
    createdAt: now,
    assetBundleUsed: {
      finalImage: {
        ready: true,
        localPath: finalPng.relativePath,
        fileSize: finalPng.size,
        createdAt: now
      }
    }
  }
];

state.milestones = [
  { id: "demo-ms-pilots", title: "Sign 3 institutional pilots", target: 3, current: 2, unit: "pilots", status: "on_track", owner: "Roger", nextAction: "Close the county intake pilot scope and send signature packet.", dueDate: "2026-06-07", relatedProofPoints: ["signed_pilots"], notes: "The fastest path to investor confidence is named institutions with scope, dates, and proof metrics.", createdAt: today, updatedAt: now },
  { id: "demo-ms-campaigns", title: "Launch 10 partner campaigns", target: 10, current: 3, unit: "campaigns", status: "needs_attention", owner: "Growth", nextAction: "Move Goodwill MS and We Must Vote from ready to live distribution.", dueDate: "2026-06-21", relatedProofPoints: ["active_partner_campaigns"], notes: "Campaigns prove repeatable distribution across partner types.", createdAt: today, updatedAt: now },
  { id: "demo-ms-users", title: "Reach 1,000 RecordShield users", target: 1000, current: 412, unit: "users", status: "on_track", owner: "Growth", nextAction: "Scale the two campaigns already producing RecordShield starts.", dueDate: "2026-08-15", relatedProofPoints: ["recordshield_users"], notes: "Usage must be attributed by partner, campaign, and source.", createdAt: today, updatedAt: now },
  { id: "demo-ms-conversion", title: "Prove RecordShield to Expungement.ai conversion", target: 20, current: 21, unit: "%", status: "complete", owner: "Product", nextAction: "Package the first conversion snapshot for investor update.", dueDate: "2026-05-29", relatedProofPoints: ["recordshield_to_expungement_conversion"], notes: "This is the acquisition-funnel proof: RecordShield creates qualified demand.", createdAt: today, updatedAt: now },
  { id: "demo-ms-public-proof", title: "Secure one public institutional proof point", target: 1, current: 1, unit: "artifact", status: "complete", owner: "Roger", nextAction: "Turn the approved partner quote into a case-study draft.", dueDate: "2026-06-03", relatedProofPoints: ["public_institutional_proof"], notes: "One public proof point changes how investors perceive the company.", createdAt: today, updatedAt: now },
  { id: "demo-ms-dataroom", title: "Build investor/acquirer-ready data room", target: 100, current: 72, unit: "%", status: "needs_attention", owner: "Operations", nextAction: "Finish compliance memo, revenue model, and technical architecture packet.", dueDate: "2026-06-14", relatedProofPoints: ["acquisition_readiness", "compliance_safety"], notes: "The data room should make LegalEase feel safe, structured, and acquirable.", createdAt: today, updatedAt: now },
  { id: "demo-ms-dashboard", title: "Launch infrastructure dashboard experience", target: 100, current: 80, unit: "%", status: "on_track", owner: "Product", nextAction: "Add partner-facing snapshot from campaign and funnel data.", dueDate: "2026-06-10", relatedProofPoints: ["infrastructure_dashboard"], notes: "The dashboard is the proof LegalEase is infrastructure, not just an app.", createdAt: today, updatedAt: now }
];

state.partners = [
  { id: "demo-partner-clean-slate", organizationName: "Clean Slate Initiative", partnerType: "clean_slate_org", regionState: "National", primaryContactName: "Policy Programs Lead", email: "", phone: "", website: "https://www.cleanslateinitiative.org", status: "meeting_booked", lastTouchDate: "2026-05-21", nextFollowUpDate: "2026-05-24", owner: "Roger", priority: "High", nextAction: "Run second meeting and propose a notification-gap pilot.", decisionMaker: "Programs leadership", budgetOwner: "Policy/programs team", useCase: "Clean Slate notification gap pilot", proposedPilotType: "clean_slate_notification_gap", relatedPilot: "demo-pilot-clean-slate", budgetSource: "program innovation", expectedValue: 25000, probability: 65, blocker: "Needs narrow scope", relatedProofPoints: ["signed_pilots", "public_institutional_proof"], proofScore: 2, notes: "High proof value if they publicly validate the infrastructure gap.", referralCount: 0, recordShieldStarts: 0, expungementStarts: 0, revenue: 0, createdAt: today, updatedAt: now },
  { id: "demo-partner-harris", organizationName: "Harris County / Commissioner Ellis", partnerType: "government_county", regionState: "Texas", primaryContactName: "Resident Services Office", status: "proposal_sent", lastTouchDate: "2026-05-20", nextFollowUpDate: "2026-05-23", owner: "Roger", priority: "High", nextAction: "Send resident-services pilot memo with 30-day scope.", decisionMaker: "Commissioner office", budgetOwner: "resident services budget", useCase: "Resident services record-clearing access pilot", proposedPilotType: "government_resident_services", relatedPilot: "demo-pilot-harris", budgetSource: "county resident services", expectedValue: 35000, probability: 55, blocker: "Needs decision date", relatedProofPoints: ["signed_pilots", "public_institutional_proof"], proofScore: 2, notes: "County proof can anchor the infrastructure narrative.", referralCount: 0, recordShieldStarts: 0, expungementStarts: 0, revenue: 0, createdAt: today, updatedAt: now },
  { id: "demo-partner-goodwill", organizationName: "Goodwill of Mississippi", partnerType: "workforce_org", regionState: "Mississippi", primaryContactName: "Workforce Programs Director", status: "campaign_live", lastTouchDate: "2026-05-22", nextFollowUpDate: "2026-05-27", owner: "Growth", priority: "High", nextAction: "Review first-week RecordShield starts and ask for newsletter distribution.", decisionMaker: "Workforce programs director", budgetOwner: "program operations", useCase: "Fresh Start Campaign for workforce participants", proposedCampaignType: "workforce_reentry", relatedCampaign: "demo-campaign-fresh-start", budgetSource: "workforce program", expectedValue: 18000, probability: 75, relatedProofPoints: ["active_partner_campaigns", "recordshield_users"], proofScore: 4, notes: "Best current active-campaign proof loop.", referralCount: 126, screenings: 88, recordShieldStarts: 82, expungementStarts: 17, revenue: 2388, createdAt: today, updatedAt: now },
  { id: "demo-partner-we-must-vote", organizationName: "We Must Vote", partnerType: "church/community", regionState: "Georgia", primaryContactName: "Campaign Director", status: "verbal_yes", lastTouchDate: "2026-05-22", nextFollowUpDate: "2026-05-25", owner: "Growth", priority: "High", nextAction: "Approve civic-access landing page and launch calendar.", decisionMaker: "Campaign director", budgetOwner: "campaign budget", useCase: "Civic access and record-awareness campaign", proposedCampaignType: "civic_access", relatedCampaign: "demo-campaign-civic-access", budgetSource: "campaign sponsorship", expectedValue: 12000, probability: 70, relatedProofPoints: ["active_partner_campaigns", "recordshield_users"], proofScore: 2, notes: "Strong distribution if the compliance-safe copy lands.", referralCount: 40, recordShieldStarts: 24, expungementStarts: 5, revenue: 597, createdAt: today, updatedAt: now },
  { id: "demo-partner-timedone", organizationName: "TimeDone", partnerType: "national_nonprofit", regionState: "National", primaryContactName: "Partnerships", status: "outreach_sent", lastTouchDate: "2026-05-18", nextFollowUpDate: "2026-05-24", owner: "Roger", priority: "Medium", nextAction: "Reframe as a lower-cost 60-day campaign pilot.", decisionMaker: "Partnerships lead", budgetOwner: "programs", useCase: "Member record-clearing campaign", proposedCampaignType: "partner_referral", budgetSource: "member services", expectedValue: 15000, probability: 35, relatedProofPoints: ["signed_pilots", "active_partner_campaigns"], proofScore: 1, notes: "Useful reactivation target; keep it lower-friction.", referralCount: 0, recordShieldStarts: 0, expungementStarts: 0, revenue: 0, createdAt: today, updatedAt: now },
  { id: "demo-partner-fulton", organizationName: "Fulton County Solicitor-General", partnerType: "government_county", regionState: "Georgia", primaryContactName: "Innovation contact", status: "signed_pilot", lastTouchDate: "2026-05-22", nextFollowUpDate: "2026-05-29", owner: "Roger", priority: "High", nextAction: "Finalize kickoff agenda and weekly reporting template.", decisionMaker: "Solicitor-General office", budgetOwner: "office leadership", useCase: "30-day backlog triage pilot", proposedPilotType: "county_backlog_triage", relatedPilot: "demo-pilot-fulton", budgetSource: "innovation pilot", expectedValue: 30000, probability: 90, relatedProofPoints: ["signed_pilots"], proofScore: 3, notes: "Named signed pilot for the demo story.", referralCount: 0, recordShieldStarts: 0, expungementStarts: 0, revenue: 5000, createdAt: today, updatedAt: now }
];

state.campaigns = [
  { id: "demo-campaign-fresh-start", campaignName: "Fresh Start Campaign", partnerId: "demo-partner-goodwill", campaignType: "workforce_reentry", stateRegion: "Mississippi", status: "live", landingPageUrl: "https://legalease.example/fresh-start-ms", trackingSlug: "fresh-start-ms", sourceChannel: "partner newsletter", startDate: "2026-05-15", endDate: "2026-06-15", targetAudience: "workforce and reentry program participants", owner: "Growth", targetReferrals: 250, actualReferrals: 126, landingPageVisits: 780, recordShieldStarts: 82, recordShieldCompletions: 57, expungementStarts: 17, paidConversions: 6, packetCompletions: 3, petitionFilings: 1, revenue: 2388, sponsoredUserValue: 4100, complianceStatus: "approved", partnerApprovalStatus: "approved", nextReportDate: "2026-05-29", lastActivityAt: "2026-05-22", nextAction: "Ask partner to add the referral link to staff follow-up emails.", distributionActions: [{ channel: "newsletter_sent", date: "2026-05-16", audienceSize: 4200, proofArtifact: "demo-dr-campaign-report", notes: "Partner newsletter sent." }], relatedProofPoints: ["active_partner_campaigns", "recordshield_users"], proofScore: 4, reportStatus: "draft", notes: "Current best campaign proof loop.", createdAt: today, updatedAt: now },
  { id: "demo-campaign-civic-access", campaignName: "Civic Access RecordShield Week", partnerId: "demo-partner-we-must-vote", campaignType: "civic_access", stateRegion: "Georgia", status: "ready", landingPageUrl: "https://legalease.example/civic-access-ga", trackingSlug: "civic-access-ga", startDate: "2026-05-28", endDate: "2026-06-11", targetAudience: "civic access and community members", owner: "Growth", targetReferrals: 180, actualReferrals: 40, landingPageVisits: 220, recordShieldStarts: 24, recordShieldCompletions: 16, expungementStarts: 5, paidConversions: 2, revenue: 597, complianceStatus: "approved_with_notes", partnerApprovalStatus: "approved", nextReportDate: "2026-06-04", lastActivityAt: "2026-05-22", nextAction: "Confirm launch date and partner social distribution.", distributionActions: [{ channel: "landing_page_live", date: "2026-05-22", audienceSize: 0, proofArtifact: "demo-dr-public-proof", notes: "Landing page approved." }], relatedProofPoints: ["active_partner_campaigns", "recordshield_users"], proofScore: 3, notes: "Ready to become live once partner posts the launch copy.", createdAt: today, updatedAt: now },
  { id: "demo-campaign-recordshield-launch", campaignName: "RecordShield Beta Launch", partnerId: "", campaignType: "recordshield_launch", stateRegion: "Multi-state", status: "live", landingPageUrl: "https://legalease.example/recordshield", trackingSlug: "recordshield-beta", startDate: "2026-05-10", endDate: "2026-06-30", targetAudience: "people checking what may appear before an opportunity", owner: "Product", targetReferrals: 500, actualReferrals: 312, landingPageVisits: 2140, recordShieldStarts: 306, recordShieldCompletions: 203, expungementStarts: 49, paidConversions: 14, packetCompletions: 8, petitionFilings: 2, revenue: 5572, sponsoredUserValue: 0, complianceStatus: "approved", partnerApprovalStatus: "not_required", nextReportDate: "2026-05-31", lastActivityAt: "2026-05-22", nextAction: "Turn the conversion snapshot into an investor update chart.", distributionActions: [{ channel: "social_post_published", date: "2026-05-21", audienceSize: 12800, proofArtifact: "demo-dr-funnel", notes: "Founder LinkedIn and partner reshares." }], relatedProofPoints: ["recordshield_users", "recordshield_to_expungement_conversion"], proofScore: 4, notes: "Core product-funnel proof.", createdAt: today, updatedAt: now },
  { id: "demo-campaign-clean-slate-checkup", campaignName: "Clean Slate Checkup", partnerId: "demo-partner-clean-slate", campaignType: "clean_slate_checkup", stateRegion: "National", status: "draft", landingPageUrl: "", trackingSlug: "clean-slate-checkup", startDate: "", endDate: "", targetAudience: "people trying to understand record-cleanup options", owner: "Roger", targetReferrals: 150, actualReferrals: 0, recordShieldStarts: 0, expungementStarts: 0, paidConversions: 0, complianceStatus: "needs_review", partnerApprovalStatus: "not_required", nextReportDate: "", nextAction: "Use the second meeting to narrow scope and compliance language.", distributionActions: [], relatedProofPoints: ["active_partner_campaigns", "public_institutional_proof"], proofScore: 1, notes: "High proof value, not yet active.", createdAt: today, updatedAt: now },
  { id: "demo-campaign-county-intake", campaignName: "County Intake Pilot Launch", partnerId: "demo-partner-fulton", campaignType: "government", stateRegion: "Georgia", status: "assets_needed", landingPageUrl: "https://legalease.example/fulton-intake", trackingSlug: "fulton-intake", startDate: "2026-06-03", endDate: "2026-07-03", targetAudience: "eligible resident-services referrals", owner: "Operations", targetReferrals: 100, actualReferrals: 0, recordShieldStarts: 0, expungementStarts: 0, paidConversions: 0, complianceStatus: "approved", partnerApprovalStatus: "approved", nextReportDate: "2026-06-10", nextAction: "Generate staff talking points and launch FAQ.", distributionActions: [], relatedProofPoints: ["signed_pilots", "active_partner_campaigns"], proofScore: 3, notes: "Signed pilot needs launch kit.", createdAt: today, updatedAt: now }
];

state.pilots = [
  { id: "demo-pilot-fulton", pilotName: "Fulton County Backlog Triage Pilot", partnerId: "demo-partner-fulton", pilotType: "county_backlog_triage", objective: "Test whether LegalEase can route resident inquiries into clearer next steps and reduce staff triage burden.", price: 5000, status: "active", startDate: "2026-06-03", endDate: "2026-07-03", targetUsers: 100, actualUsers: 0, successMetrics: "100 residents screened, weekly referral report, staff triage time reduced.", internalOwner: "Roger", partnerOwner: "Solicitor-General office", decisionMaker: "Solicitor-General office", budgetOwner: "office leadership", decisionDate: "2026-06-01", publicProofStatus: "requested", caseStudyPermission: "requested", publicProofPermission: "requested", legalComplianceRisk: "medium", owner: "Roger", nextAction: "Hold kickoff and confirm first referral batch.", blocker: "", reportingCadence: "weekly", weeklyReportingStatus: "ready", checklist: { proposalSent: true, scopeApproved: true, agreementSigned: true, landingPageLive: true, trackingActive: true, staffTrained: false }, signedAgreement: true, expansionPath: "If 100 residents are routed cleanly, expand to a 90-day resident services pilot.", relatedProofPoints: ["signed_pilots", "public_institutional_proof"], proofScore: 4, relatedCampaigns: ["demo-campaign-county-intake"], notes: "Primary signed-pilot proof for the demo.", createdAt: today, updatedAt: now },
  { id: "demo-pilot-harris", pilotName: "Harris County Resident Services Pilot", partnerId: "demo-partner-harris", pilotType: "government_resident_services", objective: "Validate resident-services referral workflow for record questions and cleanup handoff.", price: 35000, status: "proposal_sent", startDate: "2026-06-17", endDate: "2026-07-17", targetUsers: 150, actualUsers: 0, successMetrics: "150 residents reached, conversion to RecordShield measured, partner report delivered.", internalOwner: "Roger", partnerOwner: "Resident Services Office", decisionMaker: "Commissioner office", budgetOwner: "resident services budget", decisionDate: "2026-05-31", publicProofStatus: "not_requested", legalComplianceRisk: "medium", owner: "Roger", nextAction: "Ask for decision date and approval to publish pilot scope if accepted.", reportingCadence: "weekly", expansionPath: "Expand into county resident services dashboard if the first month proves demand.", relatedProofPoints: ["signed_pilots", "public_institutional_proof"], proofScore: 2, notes: "High-upside government proof, still needs close discipline.", createdAt: today, updatedAt: now },
  { id: "demo-pilot-clean-slate", pilotName: "Clean Slate Notification Gap Pilot", partnerId: "demo-partner-clean-slate", pilotType: "clean_slate_notification_gap", objective: "Identify where policy change does not translate into resident understanding or action.", price: 25000, status: "scoped", startDate: "2026-06-10", endDate: "2026-07-10", targetUsers: 200, actualUsers: 0, successMetrics: "Partner-approved notification workflow, 200 RecordShield starts, public learning memo.", internalOwner: "Roger", partnerOwner: "Policy Programs Lead", decisionMaker: "Programs leadership", budgetOwner: "program innovation", decisionDate: "2026-06-05", publicProofStatus: "not_requested", legalComplianceRisk: "medium", owner: "Roger", nextAction: "Present narrow pilot scope in second meeting.", reportingCadence: "weekly", expansionPath: "If notification-gap framing resonates, package into a national partner dashboard.", relatedProofPoints: ["signed_pilots", "infrastructure_dashboard"], proofScore: 2, notes: "Best strategic fit for infrastructure positioning.", createdAt: today, updatedAt: now }
];

state.funnelSnapshots = [
  { id: "demo-funnel-recordshield", dateRange: "2026-05", campaignId: "demo-campaign-recordshield-launch", partnerId: "", source: "direct/social", product: "recordshield", state: "multi", landingPageVisits: 2140, actualReferrals: 312, recordShieldStarts: 306, recordShieldCompletions: 203, resultsViewed: 190, cleanupCtaClicks: 66, expungementIntakeStarted: 49, paymentStarted: 21, paymentCompleted: 14, packetGenerated: 8, packetCompleted: 8, petitionFiled: 2, outcomeKnown: 0, revenue: 5572, usersNeedingFollowUp: 37, notes: "Core RecordShield beta launch funnel.", createdAt: today, updatedAt: now },
  { id: "demo-funnel-goodwill", dateRange: "2026-05", campaignId: "demo-campaign-fresh-start", partnerId: "demo-partner-goodwill", source: "partner newsletter", product: "recordshield", state: "MS", landingPageVisits: 780, actualReferrals: 126, recordShieldStarts: 82, recordShieldCompletions: 57, resultsViewed: 51, cleanupCtaClicks: 20, expungementIntakeStarted: 17, paymentStarted: 8, paymentCompleted: 6, packetGenerated: 3, packetCompleted: 3, petitionFiled: 1, outcomeKnown: 0, revenue: 2388, usersNeedingFollowUp: 12, notes: "Best partner-attributed campaign so far.", createdAt: today, updatedAt: now },
  { id: "demo-funnel-civic", dateRange: "2026-05", campaignId: "demo-campaign-civic-access", partnerId: "demo-partner-we-must-vote", source: "landing page", product: "recordshield", state: "GA", landingPageVisits: 220, actualReferrals: 40, recordShieldStarts: 24, recordShieldCompletions: 16, resultsViewed: 15, cleanupCtaClicks: 6, expungementIntakeStarted: 5, paymentStarted: 3, paymentCompleted: 2, packetGenerated: 1, packetCompleted: 1, petitionFiled: 0, outcomeKnown: 0, revenue: 597, usersNeedingFollowUp: 5, notes: "Small but promising civic-access test.", createdAt: today, updatedAt: now }
];

state.tasks = [
  { id: "demo-task-harris-follow-up", title: "Follow up on Harris County pilot memo", relatedObjectType: "partner", relatedObjectId: "demo-partner-harris", dueDate: "2026-05-23", owner: "Roger", priority: "High", status: "open", suggestedAction: "Ask for decision date and whether resident-services scope is right.", draftMessage: "Wanted to check whether the 30-day resident services pilot scope is useful for your team." },
  { id: "demo-task-goodwill-report", title: "Send Goodwill first-week campaign report", relatedObjectType: "campaign", relatedObjectId: "demo-campaign-fresh-start", dueDate: "2026-05-29", owner: "Growth", priority: "High", status: "open", suggestedAction: "Package referrals, starts, and conversion notes into partner report." },
  { id: "demo-task-fulton-kickoff", title: "Confirm Fulton kickoff agenda", relatedObjectType: "pilot", relatedObjectId: "demo-pilot-fulton", dueDate: "2026-05-29", owner: "Roger", priority: "High", status: "open", suggestedAction: "Confirm referral source, staff training, and reporting cadence." },
  { id: "demo-task-dataroom", title: "Finish compliance memo for data room", relatedObjectType: "data_room_item", relatedObjectId: "demo-dr-compliance", dueDate: "2026-06-01", owner: "Operations", priority: "High", status: "open", suggestedAction: "Turn reviewed disclaimers and guardrails into an investor-ready memo." },
  { id: "demo-task-case-study", title: "Draft public proof case study", relatedObjectType: "data_room_item", relatedObjectId: "demo-dr-public-proof", dueDate: "2026-06-03", owner: "Roger", priority: "Medium", status: "open", suggestedAction: "Convert approved partner quote into a lightweight case-study draft." }
];

state.complianceItems = [
  { id: "demo-compliance-recordshield", itemTitle: "RecordShield consumer claims and disclaimers", itemType: "landing page", category: "eligibility_claim", riskLevel: "high", status: "approved", relatedCampaign: "demo-campaign-recordshield-launch", issueSummary: "Avoid eligibility, outcome, and court-result promises.", requiredDisclaimer: "General information only. Rules vary by state and case. A court makes the final decision.", reviewer: "Attorney reviewer", reviewDate: "2026-05-21", approvalNotes: "Approved with plain-English disclaimer and no outcome language.", notes: "Investor demo should show compliance as a launch gate.", relatedProofPoints: ["compliance_safety"], createdAt: today, updatedAt: now },
  { id: "demo-compliance-civic", itemTitle: "Civic access campaign FAQ", itemType: "FAQ", category: "campaign_faq", riskLevel: "medium", status: "approved_with_notes", relatedCampaign: "demo-campaign-civic-access", issueSummary: "Must distinguish voting/civic access copy from legal advice.", requiredDisclaimer: "Legal information only, not legal advice. Eligibility and court outcomes are not guaranteed.", reviewer: "Compliance lead", reviewDate: "2026-05-22", approvalNotes: "Use partner-safe language and no guarantee claims.", notes: "Ready for launch with approved wording.", relatedProofPoints: ["compliance_safety"], createdAt: today, updatedAt: now }
];

state.dataRoomItems = [
  { id: "demo-dr-company", title: "Company one-pager", section: "Company overview", status: "investor-ready", owner: "Roger", lastUpdated: "2026-05-22", source: "internal", relatedProofPoints: ["acquisition_readiness"], proofScore: 2, diligenceValue: "high", filePath: "Data Room/Company one-pager.pdf", notes: "Crisp LegalEase narrative and six-month sprint frame.", nextAction: "Refresh after next pilot signature.", createdAt: today, updatedAt: now },
  { id: "demo-dr-product", title: "Product suite overview", section: "Product suite", status: "usable", owner: "Product", lastUpdated: "2026-05-22", relatedProofPoints: ["infrastructure_dashboard"], proofScore: 3, diligenceValue: "high", filePath: "Data Room/Product suite overview.pdf", notes: "RecordShield, Expungement.ai, Wilma, social engine, and Growth Command Center.", nextAction: "Add partner dashboard screenshots.", createdAt: today, updatedAt: now },
  { id: "demo-dr-traction", title: "Traction dashboard snapshot", section: "Traction", status: "usable", owner: "Growth", lastUpdated: "2026-05-22", relatedProofPoints: ["recordshield_users", "active_partner_campaigns"], proofScore: 4, diligenceValue: "critical", filePath: "Data Room/Traction snapshot.md", notes: "412 RecordShield starts and first campaign conversion loop.", nextAction: "Update weekly after partner reports.", createdAt: today, updatedAt: now },
  { id: "demo-dr-pipeline", title: "Partner pipeline report", section: "Partner pipeline", status: "usable", owner: "Roger", lastUpdated: "2026-05-22", relatedProofPoints: ["signed_pilots"], proofScore: 3, diligenceValue: "critical", filePath: "Data Room/Partner pipeline report.md", notes: "Shows signed, proposal, warm, and active campaign partners.", nextAction: "Add probability-weighted pipeline value.", createdAt: today, updatedAt: now },
  { id: "demo-dr-campaign-report", title: "Fresh Start campaign report", section: "Campaigns", status: "draft", owner: "Growth", lastUpdated: "2026-05-22", relatedProofPoints: ["active_partner_campaigns"], proofScore: 4, diligenceValue: "high", filePath: "Data Room/Fresh Start campaign report.md", notes: "First partner-attributed referrals and starts.", nextAction: "Send to Goodwill for partner quote.", createdAt: today, updatedAt: now },
  { id: "demo-dr-funnel", title: "RecordShield funnel snapshot", section: "RecordShield funnel", status: "usable", owner: "Product", lastUpdated: "2026-05-22", relatedProofPoints: ["recordshield_to_expungement_conversion"], proofScore: 4, diligenceValue: "critical", filePath: "Data Room/RecordShield funnel snapshot.md", notes: "Shows RecordShield to Expungement.ai intake and paid conversion.", nextAction: "Add state and partner breakdown.", createdAt: today, updatedAt: now },
  { id: "demo-dr-compliance", title: "Compliance and non-UPL memo", section: "Compliance", status: "draft", owner: "Operations", lastUpdated: "2026-05-22", relatedProofPoints: ["compliance_safety"], proofScore: 2, diligenceValue: "critical", filePath: "Data Room/Compliance memo.md", notes: "Launch gate posture, disclaimers, and Wilma guardrails.", nextAction: "Move attorney review notes into final memo.", createdAt: today, updatedAt: now },
  { id: "demo-dr-security", title: "Security posture overview", section: "Security", status: "usable", owner: "Product", lastUpdated: "2026-05-22", relatedProofPoints: ["acquisition_readiness"], proofScore: 3, diligenceValue: "high", filePath: "Data Room/Security overview.md", notes: "RLS, secret handling, local backup, and fail-closed gates.", nextAction: "Add deployment checklist before external demo.", createdAt: today, updatedAt: now },
  { id: "demo-dr-public-proof", title: "Approved partner proof quote", section: "Press/public proof", status: "usable", owner: "Roger", lastUpdated: "2026-05-22", relatedProofPoints: ["public_institutional_proof"], proofScore: 5, diligenceValue: "critical", filePath: "Data Room/Public proof quote.md", notes: "Usable quote for institutional proof, pending full case study.", nextAction: "Draft case study from quote and campaign report.", createdAt: today, updatedAt: now },
  { id: "demo-dr-revenue", title: "Revenue and pipeline model", section: "Revenue", status: "draft", owner: "Operations", lastUpdated: "2026-05-22", relatedProofPoints: ["acquisition_readiness"], proofScore: 2, diligenceValue: "critical", filePath: "Data Room/Revenue model.xlsx", notes: "Pilot revenue, sponsored user value, paid conversion assumptions.", nextAction: "Add weighted pipeline sensitivity table.", createdAt: today, updatedAt: now },
  { id: "demo-dr-tech", title: "Technical architecture overview", section: "Technical architecture", status: "draft", owner: "Product", lastUpdated: "2026-05-22", relatedProofPoints: ["infrastructure_dashboard"], proofScore: 2, diligenceValue: "high", filePath: "Data Room/Technical architecture.md", notes: "Local app, Supabase path, automation inbox, product event webhooks.", nextAction: "Add deployment topology.", createdAt: today, updatedAt: now },
  { id: "demo-dr-thesis", title: "Acquisition thesis memo", section: "Acquisition thesis", status: "draft", owner: "Roger", lastUpdated: "2026-05-22", relatedProofPoints: ["acquisition_readiness"], proofScore: 2, diligenceValue: "high", filePath: "Data Room/Acquisition thesis.md", notes: "Why RecordShield plus Expungement.ai plus partner infrastructure matters to strategic buyers.", nextAction: "Add strategic buyer map.", createdAt: today, updatedAt: now }
];

state.reports = [
  { id: "demo-report-weekly", reportTitle: "Weekly Operating Report", reportType: "weekly_operating", markdownPath: "data/exports/reports/demo-weekly-operating-report.md", textPath: "data/exports/reports/demo-weekly-operating-report.txt", generatedAt: now, status: "exported", notes: "Demo report showing milestones, blockers, partner pipeline, funnel, and next actions." },
  { id: "demo-report-investor", reportTitle: "Investor Update", reportType: "investor_update", markdownPath: "data/exports/reports/demo-investor-update.md", textPath: "data/exports/reports/demo-investor-update.txt", generatedAt: now, status: "exported", notes: "Short investor narrative around pilots, users, conversion, and data room readiness." }
];

state.campaignKits = [
  { id: "demo-kit-fresh-start", campaignId: "demo-campaign-fresh-start", campaignName: "Fresh Start Campaign", path: "data/exports/campaign-kits/demo-fresh-start-campaign", generatedAt: now, status: "exported" }
];

state.activityEvents = [
  { id: "demo-activity-1", eventType: "Demo dataset loaded", title: "Investor demo state cleaned", relatedObjectType: "settings", relatedObjectId: "demo-dataset", createdAt: now },
  { id: "demo-activity-2", eventType: "Campaign live", title: "Fresh Start Campaign", relatedObjectType: "campaigns", relatedObjectId: "demo-campaign-fresh-start", createdAt: "2026-05-22T10:00:00.000Z" },
  { id: "demo-activity-3", eventType: "Funnel updated", title: "RecordShield beta conversion snapshot", relatedObjectType: "funnel", relatedObjectId: "demo-funnel-recordshield", createdAt: "2026-05-22T09:30:00.000Z" },
  { id: "demo-activity-4", eventType: "Public proof added", title: "Approved partner proof quote", relatedObjectType: "dataRoomItems", relatedObjectId: "demo-dr-public-proof", createdAt: "2026-05-21T16:00:00.000Z" },
  { id: "demo-activity-5", eventType: "Post ready", title: "RecordShield turns uncertainty into a clear next step", relatedObjectType: "posts", relatedObjectId: "demo-post-ready", createdAt: "2026-05-21T15:00:00.000Z" }
];

state.automationEvents = [
  { id: "demo-auto-event-goodwill", source: "gmail", sourceEventId: "demo-gmail-goodwill-report", receivedAt: "2026-05-22T09:00:00.000Z", eventType: "partner_email_reply", title: "Goodwill asked for first-week numbers", summary: "Partner wants the first campaign report and next distribution suggestion.", rawPayload: { redacted: true, subject: "First week numbers" }, relatedEntityType: "campaign", relatedEntityId: "demo-campaign-fresh-start", status: "suggested", confidence: "high", createdAt: now, updatedAt: now },
  { id: "demo-auto-event-funnel", source: "recordshield", sourceEventId: "demo-product-recordshield-start", receivedAt: "2026-05-22T08:30:00.000Z", eventType: "recordshield_completed", title: "RecordShield completions increased", summary: "RecordShield completions moved enough to update the funnel snapshot.", rawPayload: { redacted: true, product: "recordshield", campaignSlug: "recordshield-beta" }, relatedEntityType: "funnel", relatedEntityId: "demo-funnel-recordshield", status: "suggested", confidence: "high", createdAt: now, updatedAt: now }
];

state.automationSuggestions = [
  { id: "demo-auto-suggestion-report", eventId: "demo-auto-event-goodwill", suggestionType: "create_task", title: "Create partner report task", explanation: "Goodwill is asking for proof; sending a clean first-week report can unlock more distribution.", relatedEntityType: "campaign", relatedEntityId: "demo-campaign-fresh-start", proposedChanges: { title: "Send Goodwill first-week campaign report", dueDate: "2026-05-29", owner: "Growth", priority: "High" }, status: "pending", confidence: "high", createdAt: now, appliedAt: "" },
  { id: "demo-auto-suggestion-funnel", eventId: "demo-auto-event-funnel", suggestionType: "update_funnel_snapshot", title: "Update RecordShield funnel snapshot", explanation: "Product events can reduce manual funnel entry after approval.", relatedEntityType: "funnel", relatedEntityId: "demo-funnel-recordshield", proposedChanges: { recordShieldCompletions: 203, resultsViewed: 190, cleanupCtaClicks: 66 }, status: "pending", confidence: "high", createdAt: now, appliedAt: "" }
];

state.connectorStatus = [
  { connector: "gmail", enabled: true, configured: false, lastSyncAt: "", lastSyncStatus: "demo only", lastError: "", recordsImported: 1, recordsSuggested: 1 },
  { connector: "calendar", enabled: true, configured: false, lastSyncAt: "", lastSyncStatus: "not connected", lastError: "", recordsImported: 0, recordsSuggested: 0 },
  { connector: "recordshield", enabled: true, configured: true, lastSyncAt: now, lastSyncStatus: "demo events available", lastError: "", recordsImported: 1, recordsSuggested: 1 },
  { connector: "website", enabled: true, configured: true, lastSyncAt: now, lastSyncStatus: "available", lastError: "", recordsImported: 0, recordsSuggested: 0 },
  { connector: "manual_import", enabled: true, configured: true, lastSyncAt: now, lastSyncStatus: "available", lastError: "", recordsImported: 0, recordsSuggested: 0 }
];

state.syncRuns = [
  { id: "demo-sync-run", connector: "demo", startedAt: now, finishedAt: now, status: "completed", importedCount: 2, suggestedCount: 2, errorCount: 0, notes: "Clean investor demo dataset loaded." }
];

state.publishEvents = [];

state.settings = {
  ...(state.settings || {}),
  dailyTarget: 3,
  firstQueueReviewPostIds: ["demo-post-ready", "demo-post-image", "demo-post-review"],
  latestDemoDatasetLoadedAt: now,
  demoDatasetBackupPath: path.relative(rootDir, backupPath),
  sourceItems: [
    { id: "demo-source-partner-report", title: "Goodwill asked for first-week campaign numbers", sourceType: "Partner Signal", sourceUrl: "", note: "Turn campaign traction into a partner report and follow-up post.", audience: "partners", status: "New", createdAt: now, queuedPostId: "", ignoredAt: "", reviewedAt: "", updatedAt: now, routing: { speaker: "legalease", audience: "partners", contentBucket: "Partner Proof", platform: "linkedin", riskLevel: "Low", complianceRisk: "low", wilmaComplianceRequired: false, riskFlags: [] } },
    { id: "demo-source-recordshield-conversion", title: "RecordShield conversion crossed the first useful threshold", sourceType: "Product Event", sourceUrl: "", note: "RecordShield starts and Expungement.ai intake now support an investor proof point.", audience: "funders", status: "Queued", createdAt: now, queuedPostId: "demo-post-ready", ignoredAt: "", reviewedAt: now, updatedAt: now, routing: { speaker: "legalease", audience: "funders", contentBucket: "RecordShield", platform: "linkedin", riskLevel: "Low", complianceRisk: "low", wilmaComplianceRequired: false, riskFlags: [] } },
    { id: "demo-source-wilma-explainer", title: "Consumer question: what happens after I see my results?", sourceType: "Wilma Education", sourceUrl: "", note: "Use Wilma voice. Explain next steps without promising eligibility or outcomes.", audience: "consumers", status: "Queued", createdAt: now, queuedPostId: "demo-post-review", ignoredAt: "", reviewedAt: now, updatedAt: now, routing: { speaker: "wilma", audience: "consumers", contentBucket: "Wilma Explainer", platform: "facebook", riskLevel: "Medium", complianceRisk: "medium", wilmaComplianceRequired: true, riskFlags: ["Wilma review"] } },
    { id: "demo-source-county-pilot", title: "County pilot kickoff needs staff-facing language", sourceType: "Pilot Note", sourceUrl: "", note: "Create simple social and staff copy around the county intake pilot.", audience: "partners", status: "New", createdAt: now, queuedPostId: "", ignoredAt: "", reviewedAt: "", updatedAt: now, routing: { speaker: "legalease", audience: "partners", contentBucket: "Pilot Proof", platform: "linkedin", riskLevel: "Low", complianceRisk: "low", wilmaComplianceRequired: false, riskFlags: [] } }
  ]
};

writeState(state);

console.log(JSON.stringify({
  ok: true,
  backupPath: path.relative(rootDir, backupPath),
  posts: state.posts.length,
  partners: state.partners.length,
  campaigns: state.campaigns.length,
  milestones: state.milestones.length,
  pilots: state.pilots.length,
  dataRoomItems: state.dataRoomItems.length,
  funnelSnapshots: state.funnelSnapshots.length,
  finalPng: finalPng.size ? finalPng.relativePath : "not available"
}, null, 2));

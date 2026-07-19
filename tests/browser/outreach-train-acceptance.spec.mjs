import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { buildCampaignGoalStep, validateCampaignGoalFields } from "../../scripts/campaign-goal-step.mjs";
import { buildCampaignAudienceStep } from "../../scripts/campaign-audience-step.mjs";
import { buildCampaignMessageStep } from "../../scripts/campaign-message-step.mjs";
import { buildCampaignScheduleStep } from "../../scripts/campaign-schedule-step.mjs";
import { buildCampaignReviewStep, summarizeCampaignLaunchOutcome } from "../../scripts/campaign-review-step.mjs";
import { buildCampaignDetailView } from "../../scripts/campaign-detail-service.mjs";
import { buildCampaignRepliesOutcomes } from "../../scripts/campaign-replies-outcomes.mjs";
import { buildCampaignAdvancedDelivery } from "../../scripts/campaign-advanced-delivery.mjs";
import { renderCampaignWizardShell, renderCampaignWizardState } from "../../scripts/ui/pages/campaign-wizard.mjs";
import { renderCampaignGoalStep } from "../../scripts/ui/pages/campaign-goal-step.mjs";
import { renderCampaignAudienceStep } from "../../scripts/ui/pages/campaign-audience-step.mjs";
import { renderCampaignMessageStep } from "../../scripts/ui/pages/campaign-message-step.mjs";
import { renderCampaignScheduleStep } from "../../scripts/ui/pages/campaign-schedule-step.mjs";
import { campaignReviewBrowserSource, renderCampaignReviewStep } from "../../scripts/ui/pages/campaign-review-step.mjs";
import { renderCampaignDetail } from "../../scripts/ui/pages/campaign-detail.mjs";
import { renderCampaignRepliesOutcomes } from "../../scripts/ui/pages/campaign-replies-outcomes.mjs";
import { renderCampaignAdvancedDelivery } from "../../scripts/ui/pages/campaign-advanced-delivery.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-411");
const wizardCss = (await readFile(new URL("../../assets/ui/campaign-wizard.css", import.meta.url), "utf8")).replaceAll("</style", "<\\/style");
const detailCss = (await readFile(new URL("../../assets/ui/campaign-detail.css", import.meta.url), "utf8")).replaceAll("</style", "<\\/style");
const actor = { authenticated:true, role:"owner", id:"founder-1" };
const campaignId = "campaign-outreach-acceptance";
const identity = `campaign:${campaignId}`;
const draft = {
  goal:{ campaignName:"Justice Partner introductions", campaignType:"partner_outreach", desiredOutcome:"Book introductory meetings with eligible Partners.", owner:"founder-1" },
  audience:{ segmentId:"segment-partners", selectionConfirmed:true },
  message:{ mode:"one_time_message", senderIdentityId:"sender-founder", subject:"A practical Partner introduction", previewText:"A concise introduction", body:"Hello {{first_name}}, we would value a conversation.", messageComplete:true, steps:[] },
  schedule:{ mode:"scheduled", scheduledAt:"2026-07-21T10:00:00", timezone:"America/New_York", weekdayWindow:{ enabled:true, startHourET:9, endHourET:17 }, batchPlan:{ enabled:false }, scheduleSelected:true },
  review:{}, lastStep:"review", savedAt:"2026-07-19T18:00:00.000Z", schemaVersion:1
};
const state = {
  campaigns:[{ id:campaignId, campaignName:"Justice Partner introductions", name:"Justice Partner introductions", campaignType:"partner_outreach", goal:"Book introductory meetings", status:"active", approvalRequired:true, owner:"Founder", campaignWizardDraft:draft, campaignWizardDraftVersion:5, sendingDomainId:"domain-1", senderIdentityId:"sender-founder", deliveryTrackingStatus:"Healthy", bounceLimit:3, complaintLimit:1, batchCount:2, batchSize:25 }],
  partners:[{ id:"partner-eligible", organizationName:"Northstar Justice Network", email:"eligible@example.com" },{ id:"partner-suppressed", organizationName:"Harbor Legal Aid", email:"suppressed@example.com" }],
  audienceSegments:[{ id:"segment-partners", name:"Active Partner prospects", memberRefs:[{ sourceKind:"partner", sourceId:"partner-eligible" },{ sourceKind:"partner", sourceId:"partner-suppressed" }] }],
  outreachSuppressions:[{ contact_id:"partner-suppressed" }], outreachUnsubscribes:[], outreachBounces:[], outreachComplaints:[],
  senderIdentities:[{ id:"sender-founder", label:"LegalEase Founder", verified:true }], sendingConnections:[{ id:"connection-1", senderIdentityId:"sender-founder", connected:true }],
  campaignComplianceChecks:[{ campaignId, passed:true, checkedAt:"2026-07-19T18:00:00.000Z" }], campaignActionPolicies:[{ stableIdentity:identity, pause:true }],
  campaignReplies:[{ id:"reply-1", campaignId, partnerId:"partner-eligible", status:"needs_response", summary:"Interested in a short introduction next week.", suggestedClassification:"positive", classificationEvidence:["Asked to find a time"], receivedAt:"2026-07-19T17:00:00.000Z" }],
  sendingDomains:[{ id:"domain-1", verified:true, verificationStatus:"Verified" }],
  sendgridEvents:[{ id:"event-safe-1", campaignId, status:"Processed", eventType:"processed", occurredAt:"2026-07-19T16:00:00.000Z" }],
  outreachEvents:[], outreachCampaigns:[], reactivationCampaign:null, outreachContacts:[], outreachSequenceSteps:[], outreachAttempts:[], outreachReplies:[], reactivationContacts:[], reactivationAttempts:[], reactivationEvents:[], reactivationReplies:[], approvalQueue:[], queueItems:[], approvals:[], activityEvents:[], auditHistory:[], roleAssignments:[{ id:"founder-1", name:"Founder" }], partnerPrograms:[], products:[]
};
const goal = buildCampaignGoalStep(state, actor, identity);
const audience = buildCampaignAudienceStep(state, actor, identity, { limit:50 });
const message = buildCampaignMessageStep(state, actor, identity);
const schedule = buildCampaignScheduleStep(state, actor, identity);
const review = buildCampaignReviewStep(state, actor, identity);
const detail = buildCampaignDetailView(state, actor, identity);
const replies = buildCampaignRepliesOutcomes(state, actor, identity);
const advanced = buildCampaignAdvancedDelivery(state, actor, identity);

function pageDocument(content, css, script = "") {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>:root{--le-navy-950:#071e33;--le-navy-700:#29465e;--le-teal-600:#0b979d;--le-orange-600:#f05a24;--le-border:#d8e1e8;--le-surface-muted:#eef4f6}*{box-sizing:border-box}body{background:#f5f8fa;font-family:Inter,ui-sans-serif,system-ui,sans-serif;margin:0}button,input,select,textarea{font:inherit}${css}</style></head><body><main>${content}</main>${script ? `<script>${script.replaceAll("</script", "<\\/script")}</script>` : ""}</body></html>`;
}
function wizardPage(step, content, script = "") {
  const shell = renderCampaignWizardShell({ stableIdentity:identity, activeStep:step })
    .replace("Loading saved draft…", "Saved draft restored.")
    .replace("<div data-wizard-fields></div>", `<div data-wizard-fields>${content}</div>`);
  return pageDocument(shell, wizardCss, script);
}

async function setViewport(page, width) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
}
async function expectNoOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({ scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth }));
  expect(dimensions.clientWidth).toBe(width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(width);
}
async function expectAccessible(page, selector) {
  const result = await new AxeBuilder({ page }).include(selector).analyze();
  expect(result.violations.filter((violation) => ["critical", "serious"].includes(violation.impact))).toEqual([]);
}

test("CCX-411 Outreach workflow is deterministic, accessible, and non-mutating in the browser", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const mutations = []; const errors = [];
  page.on("request", (request) => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`); });
  page.on("pageerror", (error) => errors.push(error.message));
  await setViewport(page, 1440);

  const screens = [
    ["goal", renderCampaignGoalStep(goal), "wizard-goal-1440.png"],
    ["audience", renderCampaignAudienceStep(audience), "wizard-audience-1440.png"],
    ["message", renderCampaignMessageStep(message), "wizard-message-1440.png"],
    ["schedule", renderCampaignScheduleStep(schedule), "wizard-schedule-1440.png"],
    ["review", renderCampaignReviewStep(review), "wizard-review-1440.png"]
  ];
  for (const [step, content, filename] of screens) {
    await page.setContent(wizardPage(step, content, step === "review" ? campaignReviewBrowserSource() : ""), { waitUntil:"domcontentloaded" });
    await expect(page.getByRole("heading", { name:new RegExp(step, "i"), level:2 })).toBeVisible();
    await page.screenshot({ path:path.join(screenshotDirectory, filename), fullPage:true, animations:"disabled" });
  }
  await expect(page.getByText("1 included · 1 excluded", { exact:true }).first()).toBeVisible();
  await page.getByRole("button", { name:"Request approval" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name:"Go back" })).toBeFocused();
  await page.screenshot({ path:path.join(screenshotDirectory, "wizard-launch-confirmation-1440.png"), fullPage:true, animations:"disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name:"Send test" }).focus();
  expect(await page.locator(":focus").evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await expectAccessible(page, "[data-campaign-wizard]");

  const validation = validateCampaignGoalFields({ campaignType:"unsupported" });
  await page.setContent(wizardPage("goal", renderCampaignGoalStep({ ...goal, fields:{} }, validation.errors)));
  await expect(page.locator("[aria-invalid=true]")).toHaveCount(4);
  await page.screenshot({ path:path.join(screenshotDirectory, "wizard-validation-blocked-1440.png"), fullPage:true, animations:"disabled" });

  const safeFailure = summarizeCampaignLaunchOutcome({ ok:false, attempted:1, sent:0 });
  await page.setContent(pageDocument(`<section class="campaign-wizard"><div class="campaign-wizard-panel" role="alert"><p class="campaign-wizard-eyebrow">Campaign action stopped safely</p><h1>${safeFailure.message}</h1><p>Review the current Campaign before trying again. No automatic retry ran.</p></div></section>`, wizardCss));
  await expect(page.getByRole("alert")).toContainText("No messages were sent");
  await page.screenshot({ path:path.join(screenshotDirectory, "wizard-launch-safe-failure-1440.png"), fullPage:true, animations:"disabled" });

  for (const kind of ["loading", "empty", "error", "unauthorized", "session_expired"]) {
    await page.setContent(pageDocument(renderCampaignWizardState(kind), wizardCss));
    await expect(page.locator(`[data-wizard-state="${kind}"]`)).toBeVisible();
  }

  await page.setContent(pageDocument(renderCampaignDetail(detail), detailCss));
  await expect(page.getByRole("tab", { name:"Overview" })).toHaveAttribute("href", `#outreach/campaign/${encodeURIComponent(campaignId)}?tab=overview`);
  await page.screenshot({ path:path.join(screenshotDirectory, "campaign-detail-1440.png"), fullPage:true, animations:"disabled" });
  await expectAccessible(page, "[data-campaign-detail]");

  await page.setContent(pageDocument(renderCampaignRepliesOutcomes(replies), detailCss));
  await page.screenshot({ path:path.join(screenshotDirectory, "campaign-replies-outcomes-1440.png"), fullPage:true, animations:"disabled" });
  await page.setContent(pageDocument(renderCampaignAdvancedDelivery(advanced), detailCss));
  await page.screenshot({ path:path.join(screenshotDirectory, "campaign-advanced-closed-1440.png"), fullPage:true, animations:"disabled" });
  await page.getByText("Show technical delivery details").click();
  await page.screenshot({ path:path.join(screenshotDirectory, "campaign-advanced-open-1440.png"), fullPage:true, animations:"disabled" });
  await expectAccessible(page, "[data-campaign-advanced]");

  for (const width of [1440, 1280, 1024, 768, 390]) {
    await setViewport(page, width);
    await page.setContent(wizardPage("review", renderCampaignReviewStep(review), campaignReviewBrowserSource()));
    await expectNoOverflow(page, width);
    await page.setContent(pageDocument(renderCampaignDetail(detail), detailCss));
    await expectNoOverflow(page, width);
  }
  await page.setContent(wizardPage("review", renderCampaignReviewStep(review), campaignReviewBrowserSource()));
  await page.screenshot({ path:path.join(screenshotDirectory, "wizard-mobile-390.png"), fullPage:true, animations:"disabled" });
  await page.setContent(pageDocument(renderCampaignDetail(detail), detailCss));
  await page.screenshot({ path:path.join(screenshotDirectory, "campaign-detail-mobile-390.png"), fullPage:true, animations:"disabled" });

  await page.setContent(wizardPage("goal", renderCampaignGoalStep(goal)));
  await page.evaluate(() => history.pushState({ wizardStep:"audience" }, "", "#outreach/campaign/campaign-outreach-acceptance?step=audience"));
  await page.evaluate(() => history.pushState({ wizardStep:"message" }, "", "#outreach/campaign/campaign-outreach-acceptance?step=message"));
  await page.goBack();
  expect(await page.evaluate(() => history.state?.wizardStep)).toBe("audience");
  await page.goForward();
  expect(await page.evaluate(() => history.state?.wizardStep)).toBe("message");

  expect(await page.locator("body").innerText()).not.toMatch(/api[_-]?key|bearer |provider payload|credential/i);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

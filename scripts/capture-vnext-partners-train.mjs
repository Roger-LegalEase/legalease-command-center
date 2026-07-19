#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import { visualDialog, visualDocument, visualFixture, partnersHomePageHtml, partnerRecordPageHtml } from "./partners-visual-harness.mjs";
import { buildPartnerRecordView } from "./ui/view-models/partner-record.mjs";
import { PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW } from "./fixtures/vnext-partners-train.mjs";

const output = path.resolve("docs/ux-vnext/screenshots/ccx-501-506");
await mkdir(output, { recursive:true });
const fixture = visualFixture();
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1440, height:900 }, locale:"en-US", timezoneId:"America/New_York" });

async function capture(name, content, { width = 1440, overlay = "", announcement = "" } = {}) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.setContent(visualDocument(content, { overlay, announcement }), { waitUntil:"domcontentloaded" });
  await page.screenshot({ path:path.join(output, name), fullPage:true, animations:"disabled" });
}

await capture("partners-list-1440.png", partnersHomePageHtml(fixture.home("list")));
await capture("partners-pipeline-1440.png", partnersHomePageHtml(fixture.home("pipeline")));
await capture("partners-needs-follow-up-1440.png", partnersHomePageHtml(fixture.home("needs_follow_up")));
await capture("partners-active-programs-1440.png", partnersHomePageHtml(fixture.home("active_programs")));
await capture("partners-empty-1440.png", partnersHomePageHtml(fixture.empty));
await capture("partners-filtered-empty-1440.png", partnersHomePageHtml(fixture.filteredEmpty));
await capture("partners-home-390.png", partnersHomePageHtml(fixture.home("list")), { width:390 });
await capture("partner-record-overview-1440.png", partnerRecordPageHtml(fixture.record("overview")));
await capture("partner-record-activity-1440.png", partnerRecordPageHtml(fixture.record("activity")));
await capture("partner-record-outreach-1440.png", partnerRecordPageHtml(fixture.record("outreach")));
await capture("partner-record-files-1440.png", partnerRecordPageHtml(fixture.record("files")));
await capture("partner-create-outreach-1440.png", partnerRecordPageHtml(fixture.record("outreach")), { overlay:visualDialog("Create outreach", "Start a reviewed Campaign draft for this Partner.", "Opening this workflow does not send, schedule, approve, or enroll anyone.") });
const generatedRecord = buildPartnerRecordView(fixture.scenario.state, PARTNERS_FIXTURE_ACTOR, fixture.scenario.newPartnerId, PARTNERS_FIXTURE_NOW, { tab:"files" });
await capture("partner-proposal-success-1440.png", partnerRecordPageHtml(generatedRecord), { announcement:"Proposal Draft created. Review required." });
await capture("partner-proposal-safe-failure-1440.png", partnerRecordPageHtml(fixture.record("files")), { overlay:visualDialog("Proposal was not created", "The generator could not complete this request.", "No File, Activity item, public access, or external action was created.") });
const updatedRecord = buildPartnerRecordView(fixture.scenario.state, PARTNERS_FIXTURE_ACTOR, fixture.scenario.newPartnerId, PARTNERS_FIXTURE_NOW, { tab:"outreach" });
await capture("partner-reviewed-stage-update-1440.png", partnerRecordPageHtml(updatedRecord), { announcement:"Reviewed stage update applied: In conversation" });
await capture("partner-record-390.png", partnerRecordPageHtml(fixture.record("overview")), { width:390 });

await browser.close();
console.log("PASS capture-vnext-partners-train");
console.log(JSON.stringify({ output, screenshots:16, productionData:0 }));

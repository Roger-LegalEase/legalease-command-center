#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  OUTREACH_HOME_ENDPOINT,
  OUTREACH_HOME_LIMITS,
  OUTREACH_HOME_VIEWS,
  OutreachHomeValidationError,
  buildAuthorizedOutreachHome
} from "./outreach-home-service.mjs";
import { GLOBAL_CREATE_ENDPOINTS } from "./global-create-service.mjs";
import { requiredCapabilitiesForEndpoint } from "./roles.mjs";

const NOW = "2026-07-19T15:00:00.000Z";
const OWNER = Object.freeze({ id:"outreach-test-owner", role:"owner", authenticated:true });
const VIEWER = Object.freeze({ id:"outreach-test-viewer", role:"viewer", authenticated:true });

const campaign = (id, status, extra = {}) => ({
  id,
  name:`Campaign ${id}`,
  campaignType:"partner_outreach",
  deliveryMode:"one_time_message",
  status,
  ...extra
});

const state = {
  campaigns:[
    campaign("active", "active", { audienceSummary:"Synthetic community partners", recipientCount:12, excludedRecipientCount:1, nextAction:"Review replies", replyCount:0, meetingCount:0, owner:"Founder" }),
    campaign("scheduled", "scheduled", { scheduledAt:"2026-07-22T14:00:00.000Z", timezone:"America/New_York", audienceSummary:"Synthetic invited partners", recipientCount:8, replyCount:2, meetingCount:1, owner:"Founder" }),
    campaign("draft-unavailable", "draft", { audienceSelected:false }),
    campaign("paused", "paused", { nextAction:"Await founder review", owner:"Founder" }),
    campaign("completed", "completed", { replyCount:4, outcomeSummary:"Two synthetic introductions completed.", owner:"Founder" }),
    campaign("hidden", "active", { allowedRoles:["admin"], audienceSummary:"Must not be disclosed", recipientCount:99 })
  ],
  outreachCampaigns:[], outreachContacts:[], outreachSequenceSteps:[], outreachAttempts:[], outreachReplies:[],
  outreachSuppressions:[], outreachUnsubscribes:[], outreachBounces:[], reactivationCampaign:null,
  reactivationContacts:[], reactivationAttempts:[], reactivationEvents:[], reactivationSendClaims:[],
  approvalQueue:[], queueItems:[], approvals:[], activityEvents:[], auditHistory:[]
};

const before = structuredClone(state);
const all = buildAuthorizedOutreachHome(state, OWNER, NOW, { view:"all", limit:40 });
assert.equal(OUTREACH_HOME_ENDPOINT, "/api/ui/outreach");
assert.deepEqual(OUTREACH_HOME_VIEWS.map((view) => view.label), ["All", "Draft", "Scheduled", "Active", "Completed", "Automation control"]);
assert.equal(all.ok, true);
assert.equal(all.authorized, true);
assert.equal(all.generatedAt, NOW);
assert.equal(all.items.length, 5);
assert.equal(all.items.some((item) => item.id.includes("hidden")), false);
assert.deepEqual(all.views.map((view) => [view.key, view.count]), [["all",5],["draft",1],["scheduled",1],["active",1],["completed",1],["automation",null]]);
assert.equal(all.views.some((view) => view.key === "paused"), false, "Paused must remain a truthful status without becoming a view.");
assert.equal(all.items.find((item) => item.id === "campaign:paused").status.label, "Paused");
assert.equal(all.items.find((item) => item.id === "campaign:active").replies, 0, "An explicit zero must remain zero.");
assert.equal(all.items.find((item) => item.id === "campaign:active").outcome.meetings, 0);
const unavailable = all.items.find((item) => item.id === "campaign:draft-unavailable");
assert.equal(unavailable.audience.available, false);
assert.equal(unavailable.audience.includedCount, null);
assert.equal(unavailable.replies, null);
assert.equal(unavailable.outcome.meetings, null);
assert.equal(unavailable.owner, null);
assert.equal(unavailable.nextSend, null);
assert.equal(all.items.find((item) => item.id === "campaign:scheduled").nextSend.scheduledAt, "2026-07-22T14:00:00.000Z");
assert.ok(all.items.every((item) => item.href === `#outreach/campaign/${item.id.slice("campaign:".length)}`));
assert.equal(all.capabilities.createsCampaign, true);
assert.deepEqual({ mutatesSource:all.capabilities.mutatesSource, launches:all.capabilities.launches, schedules:all.capabilities.schedules, approves:all.capabilities.approves }, { mutatesSource:false, launches:false, schedules:false, approves:false });
assert.deepEqual(state, before, "Outreach projection must not mutate stored collections.");
assert.ok(Object.isFrozen(all) && Object.isFrozen(all.items) && all.items.every(Object.isFrozen));
assert.doesNotMatch(JSON.stringify(all), /provider|webhook|telemetry|wave|approvalStatus|sendingEnabled/i);

for (const view of ["draft", "scheduled", "active", "completed"]) {
  const filtered = buildAuthorizedOutreachHome(state, OWNER, NOW, { view, limit:40 });
  assert.ok(filtered.items.every((item) => item.status.key === view));
}
const pageOne = buildAuthorizedOutreachHome(state, OWNER, NOW, { view:"all", limit:2 });
const pageTwo = buildAuthorizedOutreachHome(state, OWNER, NOW, { view:"all", limit:2, cursor:pageOne.nextCursor });
assert.equal(pageOne.items.length, 2);
assert.equal(pageOne.nextCursor, "outreach-all-2");
assert.equal(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.id)).size, 4);
assert.throws(() => buildAuthorizedOutreachHome(state, OWNER, NOW, { view:"draft", cursor:"outreach-all-2" }), OutreachHomeValidationError);
assert.throws(() => buildAuthorizedOutreachHome(state, OWNER, NOW, { view:"paused" }), OutreachHomeValidationError);
assert.throws(() => buildAuthorizedOutreachHome(state, OWNER, NOW, { limit:OUTREACH_HOME_LIMITS.maximum + 1 }), OutreachHomeValidationError);
const unauthorized = buildAuthorizedOutreachHome(state, { role:"owner", authenticated:false }, NOW);
assert.equal(unauthorized.authorized, false);
assert.deepEqual(unauthorized.items, []);
assert.ok(unauthorized.views.every((view) => view.count === null));
assert.equal(buildAuthorizedOutreachHome(state, VIEWER, NOW).capabilities.createsCampaign, false);
assert.deepEqual(requiredCapabilitiesForEndpoint("GET", OUTREACH_HOME_ENDPOINT), ["read_internal"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.campaign), ["manage_growth"]);

const [pageSource, stylesSource, integrationManifest] = await Promise.all([
  readFile(new URL("./ui/pages/outreach-home.mjs", import.meta.url), "utf8"),
  readFile(new URL("../assets/ui/outreach-home.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/ux-vnext/outreach-integration-manifest.md", import.meta.url), "utf8")
]);
assert.match(pageSource, /openWorkflow\("outreach-campaign"/);
assert.match(pageSource, /fetch\(contract\.endpoint/);
assert.doesNotMatch(pageSource, /fetch\(["'`]\/api\/(?:state|campaign\/command)|launchCampaign|pauseCampaign|resumeCampaign|approveCampaign|provider\./i);
assert.match(stylesSource, /focus-visible/);
assert.match(stylesSource, /max-width:760px/);
assert.match(stylesSource, /var\(--le-orange-600,#F04800\)/);
assert.match(integrationManifest, /`GET \/api\/ui\/outreach`/);
assert.match(integrationManifest, /scripts\/preview-server\.mjs/);
assert.match(integrationManifest, /scripts\/ui\/app-shell\.mjs/);
assert.match(integrationManifest, /assets\/ui\/outreach-home\.css/);

console.log("PASS test-vnext-outreach-home");
console.log(JSON.stringify({ views:all.views, items:all.items.length, paused:true, hidden:false, explicitZero:true, unavailable:true, mutations:0 }));

#!/usr/bin/env node
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { buildAuthorizedPartnersHome, PartnersHomeValidationError } from "./partners-home-service.mjs";
import { partnersHomePageHtml } from "./ui/pages/partners-home.mjs";

const NOW = "2026-07-19T12:00:00.000Z";
const OWNER = { authenticated:true, role:"owner", id:"owner-example" };
const state = {
  partners:[
    { id:"partner/overdue", organizationName:"Community Justice Example", stage:"proposal_sent", owner:"Roger", nextAction:"Confirm reviewed scope", nextActionDueDate:"2026-07-18", relationshipHealth:"healthy", relatedPrograms:["program-active"], history:[] },
    { id:"partner-new", organizationName:"Second Start Example", stage:"new", owner:"Operations", nextAction:"Identify decision owner", nextActionDueDate:"2026-07-25", history:[] },
    { id:"partner-stalled", organizationName:"Workforce Example", stage:"stalled", commercialStage:"qualified", owner:"Roger", relationshipHealth:"at_risk", history:[] },
    { id:"partner-hidden", organizationName:"Hidden Example", stage:"active", allowedRoles:["admin"], history:[] }
  ],
  partnerPrograms:[{ id:"program-active", relatedPartnerId:"partner/overdue", name:"Access pilot", status:"active", owner:"Roger" }],
  pilots:[], campaigns:[], outreachCampaigns:[], outreachAttempts:[], reports:[], partnerProgramArtifacts:[], evidencePackNotes:[], dataRoomItems:[], tasks:[], automationEvents:[], companyEvents:[], auditHistory:[],
  activityEvents:[{ id:"contact-1", partnerId:"partner/overdue", eventType:"meeting_completed", createdAt:"2026-07-18T15:00:00.000Z" }], outreachReplies:[]
};

const before = structuredClone(state);
const started = performance.now();
const view = buildAuthorizedPartnersHome(state, OWNER, NOW, { view:"list", limit:2 });
const projectionMs = performance.now() - started;
assert.equal(view.available, true);
assert.equal(view.summary.authorizedPartners, 3, "hidden Partners must not affect counts");
assert.equal(view.items.length, 2);
assert.ok(view.pagination.nextCursor && !view.pagination.nextCursor.includes("2"), "cursor must be opaque");
const next = buildAuthorizedPartnersHome(state, OWNER, NOW, { view:"list", limit:2, cursor:view.pagination.nextCursor });
assert.equal(next.items.length, 1);
assert.equal(view.items.find((item) => item.id === "partner/overdue").partner.href, "#partners/partner/partner%2Foverdue");
assert.equal(view.items.find((item) => item.id === "partner/overdue").stage.label, "Proposal");
assert.equal(view.items.find((item) => item.id === "partner/overdue").lastContact.label, "Meeting");
assert.equal(view.items.find((item) => item.id === "partner/overdue").dueState.overdue, true);
assert.equal(view.safety.fullStateReturned, false);
assert.equal(view.safety.mutations, 0);
assert.deepEqual(state, before);

const pipeline = buildAuthorizedPartnersHome(state, OWNER, NOW, { view:"pipeline" });
assert.deepEqual(pipeline.pipeline.map((group) => group.key), ["new", "qualified", "proposal"]);
assert.equal(pipeline.items.find((item) => item.id === "partner-stalled").stage.key, "qualified");
assert.equal(pipeline.items.find((item) => item.id === "partner-stalled").health.key, "needs_attention");
const followUp = buildAuthorizedPartnersHome(state, OWNER, NOW, { view:"needs_follow_up" });
assert.deepEqual(followUp.items.map((item) => item.id).sort(), ["partner-stalled", "partner/overdue"].sort());
const active = buildAuthorizedPartnersHome(state, OWNER, NOW, { view:"active_programs" });
assert.deepEqual(active.items.map((item) => item.id), ["partner/overdue"]);
const filtered = buildAuthorizedPartnersHome(state, OWNER, NOW, { view:"list", search:"no match" });
assert.equal(filtered.availability.state, "filtered_empty");
assert.match(partnersHomePageHtml(filtered), /No Partners match these filters/);
assert.match(partnersHomePageHtml(view), /data-partners-add/);
assert.match(partnersHomePageHtml(view), /\/api\/ui\/create\/partner/);
assert.doesNotMatch(JSON.stringify(view), /Hidden Example|partner-hidden|internalStage|primaryContact|email/i);
assert.throws(() => buildAuthorizedPartnersHome(state, { authenticated:true, role:"viewer" }, NOW), (error) => error instanceof PartnersHomeValidationError && error.status === 403);
assert.throws(() => buildAuthorizedPartnersHome(state, OWNER, NOW, { cursor:"not-a-cursor" }), /cursor is invalid/);
assert.ok(Buffer.byteLength(JSON.stringify(view)) < 50_000);
assert.ok(projectionMs < 200, `projection exceeded budget: ${projectionMs.toFixed(3)}ms`);

console.log("PASS test-vnext-partners-home");
console.log(JSON.stringify({ authorizedPartners:view.summary.authorizedPartners, pageBytes:Buffer.byteLength(JSON.stringify(view)), projectionMs:Number(projectionMs.toFixed(3)), fullStateReads:0, mutations:0, externalActions:0 }));

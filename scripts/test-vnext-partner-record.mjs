#!/usr/bin/env node
import assert from "node:assert/strict";

import { completePartnerNextAction, logPartnerActivity, setPartnerNextAction } from "./partner-record-actions.mjs";
import { partnerRecordPageHtml } from "./ui/pages/partner-record.mjs";
import { buildPartnerRecordView } from "./ui/view-models/partner-record.mjs";

const NOW = "2026-07-19T12:00:00.000Z";
const OWNER = { authenticated:true, role:"owner", id:"owner-example" };
const OPERATOR = { authenticated:true, role:"operator", id:"operator-example" };
const state = {
  partners:[{ id:"partner/record", organizationName:"Community Partner Example", stage:"proposal_sent", relationshipHealth:"healthy", owner:"Roger", nextAction:"Review pilot scope", nextActionDueDate:"2026-07-20", partnerType:"nonprofit", geography:"Georgia", opportunity:"90-day access pilot", primaryContactName:"Taylor Example", email:"taylor@example.com", notes:["Synthetic relationship note."], relatedPrograms:["program-1"], history:[] }],
  partnerPrograms:[{ id:"program-1", relatedPartnerId:"partner/record", name:"Access pilot", status:"active" }], pilots:[], campaigns:[], outreachCampaigns:[], activityEvents:[], auditHistory:[], automationEvents:[], companyEvents:[], tasks:[], reports:[], partnerProgramArtifacts:[], evidencePackNotes:[], dataRoomItems:[], outreachAttempts:[], outreachReplies:[]
};

const before = structuredClone(state);
const view = buildPartnerRecordView(state, OWNER, "partner/record", NOW, { tab:"overview" });
assert.equal(view.available, true);
assert.equal(view.href, "#partners/partner/partner%2Frecord");
assert.equal(view.header.stage.label, "Proposal");
assert.equal(view.header.nextAction.summary, "Review pilot scope");
assert.equal(view.header.nextAction.available, true);
assert.equal(view.actions.primary.key, "complete_next_action");
assert.equal(view.actions.secondary.find((action) => action.key === "create_outreach").sends, false);
assert.equal(view.actions.secondary.find((action) => action.key === "add_file").uploads, false);
assert.equal(view.overview.contacts.items[0].email, "taylor@example.com");
assert.equal(view.overview.programs[0].name, "Access pilot");
assert.equal(view.safety.internalStageChanged, false);
assert.deepEqual(state, before);
const operator = buildPartnerRecordView(state, OPERATOR, "partner/record", NOW);
assert.equal(operator.overview.contacts.available, false);
assert.equal(operator.overview.notes.available, false);
assert.doesNotMatch(JSON.stringify(operator), /taylor@example\.com|Synthetic relationship note/);

const logged = logPartnerActivity(state, "partner/record", { requestId:"record-log-example-0001", type:"meeting_completed", summary:"Reviewed pilot scope" }, { actor:OWNER, now:NOW });
assert.equal(logged.mutations, 1);
assert.equal(logged.externalActions, 0);
assert.equal(logged.state.partners[0].stage, state.partners[0].stage);
assert.equal(logged.state.activityEvents[0].eventType, "meeting_completed");
assert.deepEqual(logPartnerActivity(logged.state, "partner/record", { requestId:"record-log-example-0001", type:"meeting_completed", summary:"Reviewed pilot scope" }, { actor:OWNER, now:NOW }).state, logged.state);

const set = setPartnerNextAction(state, "partner/record", { requestId:"record-next-example-0001", summary:"Confirm decision date", dueAt:"2026-07-22" }, { actor:OWNER, now:NOW });
assert.equal(set.state.partners[0].nextAction, "Confirm decision date");
assert.equal(set.state.partners[0].stage, "proposal_sent");
const completed = completePartnerNextAction(set.state, "partner/record", { requestId:"record-done-example-0001" }, { actor:OWNER, now:"2026-07-20T12:00:00.000Z" });
assert.equal(completed.state.partners[0].nextAction, "");
assert.equal(completed.state.partners[0].stage, "proposal_sent");
assert.equal(completed.externalActions, 0);

const html = partnerRecordPageHtml(view);
assert.match(html, /Review pilot scope/);
assert.match(html, /data-partner-action="create_outreach"/);
assert.match(html, /Overview[\s\S]*Activity[\s\S]*Outreach[\s\S]*Files/);
assert.doesNotMatch(html, /proposal_sent|lifecycle|storage|provider|audit/i);
assert.equal(buildPartnerRecordView(state, OWNER, "missing", NOW).available, false);

console.log("PASS test-vnext-partner-record");
console.log(JSON.stringify({ partnerId:view.partnerId, tabs:view.tabs.length, scopedWrites:3, externalActions:0, internalStageChanges:0 }));

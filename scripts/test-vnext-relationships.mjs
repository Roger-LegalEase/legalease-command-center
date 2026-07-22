#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  RelationshipActionError,
  buildRelationshipDetail,
  buildRelationshipsView,
  executeRelationshipAction
} from "./relationship-service.mjs";
import { handleRelationshipApiRequest } from "./relationship-api-integration.mjs";

const NOW = "2026-07-21T12:00:00.000Z";
const OWNER = { authenticated:true, role:"owner", id:"founder-example" };
const OPERATOR = { authenticated:true, role:"operator", id:"operator-example" };

const state = {
  partners:[
    {
      id:"partner/community",
      organizationName:"Community Justice Example",
      stage:"proposal_sent",
      owner:"Roger",
      primaryContactName:"Avery Partner",
      primaryContactEmail:"avery-community@example.com",
      nextAction:"Confirm the reviewed scope",
      nextActionDueDate:"2026-07-20",
      notes:[{ text:"Prefers a concise monthly check-in.", at:"2026-07-18T09:00:00.000Z" }],
      history:[{ id:"history-one", action:"proposal shared", at:"2026-07-17T14:00:00.000Z" }]
    },
    {
      id:"partner-hidden",
      organizationName:"Hidden Relationship Example",
      allowedRoles:["admin"]
    }
  ],
  companyOrganizations:[
    { org_id:"org-investor", name:"Seed Fund Example", types:["investor"], stage:"active", owner:"Roger" },
    { org_id:"org-press", name:"Daily News Example", domain:"daily.news.example.com", types:["media"], stage:"in_conversation" }
  ],
  companyContacts:[
    { contact_id:"contact-investor", name:"Indigo Investor", email:"indigo-investor@example.com", types:["investor"], organizations:["org-investor"] },
    { contact_id:"contact-press", name:"Parker Press", email:"parker-press@example.com", types:["media"], organizations:["org-press"] },
    { contact_id:"contact-vendor", name:"Val Vendor", email:"val-vendor@example.com", types:["vendor"] },
    { contact_id:"contact-internal", name:"Taylor Teammate", email:"taylor-team@example.com", types:["internal"] }
  ],
  outreachOrganizations:[
    { account_id:"prospect-account", organization_name:"Future Partner Example", domain:"future.partner.example.com", classification:"nonprofit" }
  ],
  outreachContacts:[
    {
      contact_id:"prospect-contact",
      contact_name:"Dana Prospect",
      email:"dana-partner@example.com",
      organization_name:"Future Partner Example",
      linked_account_id:"prospect-account",
      campaign_id:"outreach-campaign",
      sequence_status:"Enrolled",
      classification:"nonprofit"
    }
  ],
  prospectCandidates:[
    { id:"candidate-one", organization_name:"Future Partner Example", domain:"future.partner.example.com", classification:"nonprofit", review_state:"approved" }
  ],
  reactivationContacts:[
    { contact_id:"customer-contact", full_name:"Casey Customer", email:"casey-customer@example.com", sequence_status:"Not Enrolled" }
  ],
  expungementLifecycleContacts:[],
  rcapRevenueContacts:[],
  rcapRevenueAccounts:[],
  outreachCampaigns:[
    { campaign_id:"outreach-campaign", name:"Partner introductions", status:"active", owner:"Roger" }
  ],
  outreachAttempts:[
    {
      id:"attempt-one",
      campaign_id:"outreach-campaign",
      contact_id:"prospect-contact",
      status:"sent",
      sent_at:"2026-07-19T12:00:00.000Z",
      providerPayload:"must never be projected"
    }
  ],
  outreachReplies:[
    {
      id:"reply-one",
      campaign_id:"outreach-campaign",
      contact_id:"prospect-contact",
      status:"needs_response",
      classification:"positive",
      summary:"Dana would like to schedule a conversation.",
      body:"Private message body must never be projected.",
      replied_at:"2026-07-20T13:00:00.000Z"
    }
  ],
  reactivationAttempts:[],
  reactivationReplies:[],
  outreachSuppressions:[
    { id:"suppression-vendor", contact_id:"contact-vendor", email:"val-vendor@example.com", reason:"manual" }
  ],
  outreachUnsubscribes:[],
  tasks:[
    {
      id:"task-partner",
      title:"Confirm the Partner scope",
      status:"waiting",
      priority:"high",
      owner:"Roger",
      partnerId:"partner/community",
      waiting_on:"Avery's reviewed edits",
      dueDate:"2026-07-20",
      nextAction:"Review Avery's edits"
    },
    {
      id:"task-prospect",
      title:"Reply to Dana",
      status:"open",
      priority:"high",
      owner:"Roger",
      contactId:"prospect-contact",
      dueDate:"2026-07-21",
      nextAction:"Draft a concise reply"
    },
    { id:"task-unrelated", title:"Unrelated task", status:"open", owner:"Roger" }
  ],
  inboxSignals:[
    {
      id:"signal-one",
      kind:"needs_reply",
      status:"suggested",
      counterpartName:"Dana Prospect",
      counterpartEmail:"dana-partner@example.com",
      summary:"Dana needs a reply.",
      occurredAt:"2026-07-20T13:00:00.000Z",
      ownerOnly:true
    }
  ],
  activityEvents:[
    {
      id:"partner-meeting-activity",
      partnerId:"partner/community",
      eventType:"meeting_completed",
      title:"Scope meeting completed",
      createdAt:"2026-07-16T15:00:00.000Z"
    }
  ],
  auditHistory:[],
  automationEvents:[],
  companyEvents:[],
  meetingBriefs:[
    {
      id:"brief-community",
      event_id:"calendar-community",
      title:"Community Justice scope review",
      start_at:"2026-07-23T15:00:00.000Z",
      end_at:"2026-07-23T15:30:00.000Z",
      attendees:[{ email:"avery-community@example.com", name:"Avery Partner" }],
      status:"prepared"
    }
  ],
  calendarSignals:[],
  googleCalendarSignals:[],
  dataRoomItems:[
    { id:"file-community", title:"Community scope", partnerId:"partner/community", updatedAt:"2026-07-19T09:00:00.000Z" }
  ],
  partnerProgramArtifacts:[],
  evidencePackNotes:[
    { id:"note-community", title:"Meeting note", partnerId:"partner/community", notes:"Avery asked for a shorter implementation window.", updatedAt:"2026-07-18T12:00:00.000Z" }
  ],
  reports:[]
};

const before = structuredClone(state);
const view = buildRelationshipsView(state, OWNER, NOW);
assert.equal(view.available, true);
assert.equal(view.availability.state, "available");
assert.equal(view.summary.totalRelationships, 7, "partner, prospect, investor, press, vendor, customer, and internal records should deduplicate into seven relationships");
assert.equal(view.items.length, 7);
assert.ok(Object.isFrozen(view) && Object.isFrozen(view.items[0]));
assert.deepEqual(state, before, "the projection must be pure");

const partner = view.items.find((item) => item.id === "partner:partner/community");
assert.ok(partner, "canonical Partner uses a stable relationship id");
assert.equal(partner.href, "#partners/partner/partner%2Fcommunity");
assert.equal(partner.category.label, "Partner");
assert.equal(partner.stage.label, "Proposal");
assert.equal(partner.primaryContact, "Avery Partner");
assert.equal(partner.email, "avery-community@example.com");
assert.equal(partner.openTaskCount, 1);
assert.equal(partner.waitingState.key, "on_them");
assert.equal(partner.followUpDue, true);
assert.equal(partner.organizationName, partner.organization);
assert.equal(partner.nextFollowUpDate, partner.nextFollowUpAt);

const prospect = view.items.find((item) => item.organization === "Future Partner Example");
assert.ok(prospect, "the prospect organization and outreach contact should collapse into one relationship");
assert.equal(prospect.category.label, "Partner prospect");
assert.equal(prospect.primaryContact, "Dana Prospect");
assert.equal(prospect.automatedOutreach, true);
assert.equal(prospect.campaign.name, "Partner introductions");
assert.equal(prospect.result.label, "Reply received");
assert.equal(prospect.replyState.label, "Positive");
assert.equal(prospect.lastInboundAt, "2026-07-20T13:00:00.000Z");
assert.equal(prospect.lastOutboundAt, "2026-07-19T12:00:00.000Z");
assert.equal(prospect.waitingState.key, "on_roger");

assert.equal(view.items.find((item) => item.name === "Indigo Investor")?.category.key, undefined, "organization relationships should be named for their organization, not duplicated by contact");
assert.equal(view.items.find((item) => item.organization === "Seed Fund Example")?.category.key, "investor");
assert.equal(view.items.find((item) => item.organization === "Daily News Example")?.category.key, "press");
assert.equal(view.items.find((item) => item.name === "Taylor Teammate")?.category.key, "internal_team");
assert.equal(view.items.find((item) => item.name === "Casey Customer")?.category.key, "customer");
assert.equal(view.items.find((item) => item.name === "Val Vendor")?.eligibility.key, "suppressed");
assert.ok(!JSON.stringify(view).includes("Hidden Relationship Example"), "unauthorized sources must not leak through company-memory projection");
assert.ok(!JSON.stringify(view).includes("providerPayload"));
assert.ok(!JSON.stringify(view).includes("Private message body"));

const pressOnly = buildRelationshipsView(state, OWNER, NOW, { category:"press" });
assert.deepEqual(pressOnly.items.map((item) => item.organization), ["Daily News Example"]);
const waitingOnThem = buildRelationshipsView(state, OWNER, NOW, { waiting:"on_them" });
assert.deepEqual(waitingOnThem.items.map((item) => item.id), ["partner:partner/community"]);
const automated = buildRelationshipsView(state, OWNER, NOW, { automation:"automated" });
assert.deepEqual(automated.items.map((item) => item.organization), ["Future Partner Example"]);
const search = buildRelationshipsView(state, OWNER, NOW, { search:"dana-partner@example.com" });
assert.deepEqual(search.items.map((item) => item.organization), ["Future Partner Example"]);
const empty = buildRelationshipsView(state, OWNER, NOW, { search:"no matching relationship" });
assert.equal(empty.availability.state, "filtered_empty");
assert.equal(empty.items.length, 0);

const detail = buildRelationshipDetail(state, OWNER, "partner:partner/community", NOW);
assert.equal(detail.available, true);
assert.equal(detail.relationship.name, "Community Justice Example");
assert.equal(detail.contacts[0].email, "avery-community@example.com");
assert.equal(detail.tasks.length, 1);
assert.ok(detail.timeline.some((item) => item.label === "Scope meeting completed"));
assert.deepEqual(detail.meetings.map((item) => item.title), ["Community Justice scope review"]);
assert.ok(detail.notes.some((item) => item.summary.includes("monthly check-in")));
assert.ok(detail.notes.some((item) => item.summary.includes("shorter implementation window")));
assert.ok(detail.files.some((item) => item.title === "Community scope"));
assert.equal(detail.links.partner, "#partners/partner/partner%2Fcommunity");
assert.equal(detail.relationship.fullRecordHref, detail.relationship.href);

const signalOnlyState = { ...structuredClone(state), tasks:state.tasks.filter((task) => task.id !== "task-prospect") };
const signalOnlyDetail = buildRelationshipDetail(signalOnlyState, OWNER, prospect.id, NOW);
assert.equal(signalOnlyDetail.relationship.nextAction, "Draft reply", "Inbox suggestions may still describe a useful next move");
assert.equal(signalOnlyDetail.capabilities.completeNextAction, false, "signal-only suggestions are not falsely exposed as completable stored work");

const operatorView = buildRelationshipsView(state, OPERATOR, NOW);
assert.equal(operatorView.available, true);
assert.ok(operatorView.items.every((item) => item.email === null), "roles without sensitive access do not receive email addresses");
assert.equal(operatorView.safety.sensitiveContentAuthorized, false);
const operatorDetail = buildRelationshipDetail(state, OPERATOR, "partner:partner/community", NOW);
assert.ok(operatorDetail.contacts.every((contact) => contact.email === null));
assert.deepEqual(operatorDetail.notes, []);

const unauthorized = buildRelationshipsView(state, { authenticated:true, role:"viewer" }, NOW);
assert.equal(unauthorized.available, false);
assert.equal(unauthorized.availability.state, "not_authorized");
assert.deepEqual(unauthorized.items, []);
const missing = buildRelationshipDetail(state, OWNER, "contact:not-present", NOW);
assert.equal(missing.available, false);
assert.equal(missing.availability.state, "not_found_or_unauthorized");

const partnerRelationshipId = "partner:partner/community";
let actionState = structuredClone(state);
let actionDetail = buildRelationshipDetail(actionState, OWNER, partnerRelationshipId, NOW);
assert.equal(actionDetail.relationship.version, "legacy");
assert.deepEqual(actionDetail.capabilities, {
  draftFollowUp:true,
  setNextAction:true,
  completeNextAction:true,
  addTask:true,
  logActivity:true,
  addNote:true,
  addContact:true,
  editContact:true,
  updateStage:true
});

const setPartnerAction = executeRelationshipAction(actionState, OWNER, partnerRelationshipId, "2026-07-21T12:01:00.000Z", {
  requestId:"relationship-action-set-0001",
  expectedVersion:actionDetail.relationship.version,
  action:"set_next_action",
  nextAction:"Send the revised Partner scope",
  dueDate:"2026-07-24"
});
assert.equal(setPartnerAction.ok, true);
assert.equal(setPartnerAction.externalActions, 0);
assert.deepEqual(Object.keys(setPartnerAction.collections).sort(), ["activityEvents", "auditHistory", "partners"]);
assert.equal(setPartnerAction.detail.relationship.nextAction, "Send the revised Partner scope");
assert.equal(setPartnerAction.detail.relationship.version, "2026-07-21T12:01:00.000Z");
assert.equal(setPartnerAction.state.partners[0].nextAction, "Send the revised Partner scope", "Partner actions reuse the canonical Partner record");

const replay = executeRelationshipAction(setPartnerAction.state, OWNER, partnerRelationshipId, "2026-07-21T12:01:30.000Z", {
  requestId:"relationship-action-set-0001",
  expectedVersion:"legacy",
  action:"set_next_action",
  nextAction:"Send the revised Partner scope",
  dueDate:"2026-07-24"
});
assert.equal(replay.alreadyApplied, true, "request replay is checked before the version conflict");
assert.deepEqual(replay.collections, {});
assert.strictEqual(replay.state, setPartnerAction.state);
const sameMillisecondUpdate = executeRelationshipAction(setPartnerAction.state, OWNER, partnerRelationshipId, "2026-07-21T12:01:00.000Z", {
  requestId:"relationship-action-sametime-0025",
  expectedVersion:setPartnerAction.detail.relationship.version,
  action:"add_note",
  note:"A second internal change in the same server millisecond."
});
assert.equal(sameMillisecondUpdate.detail.relationship.version, "2026-07-21T12:01:00.001Z", "optimistic versions advance even when two serialized actions share a server millisecond");
assert.throws(() => executeRelationshipAction(setPartnerAction.state, OWNER, partnerRelationshipId, "2026-07-21T12:02:00.000Z", {
  requestId:"relationship-action-stale-0002",
  expectedVersion:"legacy",
  action:"add_note",
  note:"This stale note must not be saved."
}), (error) => error instanceof RelationshipActionError && error.status === 409);

const completePartnerAction = executeRelationshipAction(setPartnerAction.state, OWNER, partnerRelationshipId, "2026-07-21T12:02:00.000Z", {
  requestId:"relationship-action-done-0003",
  expectedVersion:setPartnerAction.detail.relationship.version,
  action:"complete_next_action",
  note:"Revised scope sent manually outside the platform."
});
actionState = completePartnerAction.state;
actionDetail = completePartnerAction.detail;
assert.equal(completePartnerAction.result.completedSummary, "Send the revised Partner scope");
assert.equal(actionState.partners[0].nextAction, "");
assert.ok(actionDetail.notes.some((note) => note.summary.includes("sent manually")), "completion notes remain in the relationship timeline");

const partnerStageState = structuredClone(state);
const partnerStageDetail = buildRelationshipDetail(partnerStageState, OWNER, partnerRelationshipId, NOW);
const partnerStageUpdate = executeRelationshipAction(partnerStageState, OWNER, partnerRelationshipId, "2026-07-21T12:02:30.000Z", {
  requestId:"relationship-action-partnerstage-0021",
  expectedVersion:partnerStageDetail.relationship.version,
  action:"update_stage",
  stage:"stalled"
});
assert.equal(partnerStageUpdate.detail.relationship.stage.key, "stalled");
assert.equal(partnerStageUpdate.state.partners[0].relationshipStage, "stalled");
assert.equal(partnerStageUpdate.state.partners[0].stage, "proposal_sent", "the founder-facing overlay does not destroy precise canonical Partner stage evidence");
assert.equal(partnerStageUpdate.state.partners[0].commercialStage, undefined);

const partnerEmailState = structuredClone(state);
const partnerEmailDetail = buildRelationshipDetail(partnerEmailState, OWNER, partnerRelationshipId, NOW);
assert.equal(partnerEmailDetail.relationship.automatedOutreach, false);
const partnerEmailUpdate = executeRelationshipAction(partnerEmailState, OWNER, partnerRelationshipId, "2026-07-21T12:02:45.000Z", {
  requestId:"relationship-action-partneremail-0022",
  expectedVersion:partnerEmailDetail.relationship.version,
  action:"edit_contact",
  contactId:partnerEmailDetail.contacts[0].id,
  email:"avery-corrected@example.com"
});
assert.equal(partnerEmailUpdate.detail.contacts[0].email, "avery-corrected@example.com", "a benign existing-Partner exclusion does not block correcting contact identity");
assert.equal(partnerEmailUpdate.state.partners[0].primaryContactEmail, "avery-corrected@example.com");

const partnerPrimaryState = structuredClone(state);
const partnerPrimaryDetail = buildRelationshipDetail(partnerPrimaryState, OWNER, partnerRelationshipId, NOW);
const partnerPrimaryUpdate = executeRelationshipAction(partnerPrimaryState, OWNER, partnerRelationshipId, "2026-07-21T12:02:50.000Z", {
  requestId:"relationship-action-partnerprimary-0026",
  expectedVersion:partnerPrimaryDetail.relationship.version,
  action:"add_contact",
  name:"Morgan Partner",
  email:"morgan-partner@example.com",
  title:"Program lead",
  primary:true
});
assert.equal(partnerPrimaryUpdate.state.partners[0].primaryContactEmail, "morgan-partner@example.com");
assert.ok(partnerPrimaryUpdate.detail.contacts.some((contact) => contact.email === "avery-community@example.com" && contact.primary === false), "changing the primary contact preserves the former contact on the relationship");
assert.ok(partnerPrimaryUpdate.detail.contacts.some((contact) => contact.email === "morgan-partner@example.com" && contact.primary === true));

const investorRelationshipId = "organization:org-investor";
let investorState = structuredClone(state);
let investorDetail = buildRelationshipDetail(investorState, OWNER, investorRelationshipId, NOW);
assert.equal(investorDetail.relationship.version, "legacy");
const addTask = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:03:00.000Z", {
  requestId:"relationship-action-task-0004",
  expectedVersion:investorDetail.relationship.version,
  action:"add_task",
  title:"Prepare the investor update",
  description:"Summarize the latest customer proof.",
  dueDate:"2026-07-21",
  priority:"high",
  owner:"Roger",
  nextAction:"Draft the investor update"
});
investorState = addTask.state;
investorDetail = addTask.detail;
assert.match(addTask.result.taskId, /^task-[a-f0-9]{16}$/);
assert.ok(investorDetail.tasks.some((task) => task.id === addTask.result.taskId));
assert.equal(addTask.collections.outreachAttempts, undefined, "only scoped internal collections are returned");

const setInvestorNext = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:04:00.000Z", {
  requestId:"relationship-action-next-0005",
  expectedVersion:investorDetail.relationship.version,
  action:"set_next_action",
  nextAction:"Confirm the next investor conversation",
  dueDate:"2026-07-22"
});
investorState = setInvestorNext.state;
investorDetail = setInvestorNext.detail;
assert.equal(investorDetail.relationship.nextAction, "Confirm the next investor conversation");
assert.ok(setInvestorNext.result.taskId, "a non-Partner next action is backed by the existing task system");
assert.equal(investorDetail.tasks[0].id, addTask.result.taskId, "another task may be due sooner without replacing the explicitly set next action");

investorState = {
  ...investorState,
  tasks:investorState.tasks.map((task) => task.id === setInvestorNext.result.taskId ? { ...task, _version:37 } : task)
};
investorDetail = buildRelationshipDetail(investorState, OWNER, investorRelationshipId, "2026-07-21T12:04:15.000Z");
const reviseInvestorNext = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:04:30.000Z", {
  requestId:"relationship-action-nextrevise-0006",
  expectedVersion:investorDetail.relationship.version,
  action:"set_next_action",
  nextAction:"Confirm the investor conversation time",
  dueDate:"2026-07-23"
});
investorState = reviseInvestorNext.state;
investorDetail = reviseInvestorNext.detail;
assert.equal(investorState.tasks.find((task) => task.id === setInvestorNext.result.taskId)?._version, 37, "updating a hosted task preserves its storage compare-and-swap version");

const completeInvestorNext = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:05:00.000Z", {
  requestId:"relationship-action-nextdone-0016",
  expectedVersion:investorDetail.relationship.version,
  action:"complete_next_action",
  note:"Conversation confirmed."
});
investorState = completeInvestorNext.state;
investorDetail = completeInvestorNext.detail;
assert.equal(investorState.tasks.find((task) => task.id === setInvestorNext.result.taskId)?.status, "done");
assert.equal(investorState.tasks.find((task) => task.id === setInvestorNext.result.taskId)?._version, 37, "completing a hosted task preserves its storage compare-and-swap version");
assert.equal(completeInvestorNext.externalActions, 0);

const addNote = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:06:00.000Z", {
  requestId:"relationship-action-note-0007",
  expectedVersion:investorDetail.relationship.version,
  action:"add_note",
  note:"Prefers a short quarterly metrics update."
});
investorState = addNote.state;
investorDetail = addNote.detail;
assert.ok(investorDetail.notes.some((note) => note.summary.includes("quarterly metrics")));

const logActivity = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:07:00.000Z", {
  requestId:"relationship-action-log-0008",
  expectedVersion:investorDetail.relationship.version,
  action:"log_activity",
  activityType:"meeting_completed",
  summary:"Quarterly review meeting completed."
});
investorState = logActivity.state;
investorDetail = logActivity.detail;
assert.ok(investorDetail.timeline.some((item) => item.label === "Quarterly review meeting completed."));

const addContact = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:08:00.000Z", {
  requestId:"relationship-action-contact-0009",
  expectedVersion:investorDetail.relationship.version,
  action:"add_contact",
  name:"Morgan Investor",
  email:"morgan-investor@example.com",
  title:"Principal",
  primary:true
});
investorState = addContact.state;
investorDetail = addContact.detail;
assert.ok(addContact.result.contactId);
assert.equal(investorDetail.contacts[0].name, "Morgan Investor");
assert.equal(investorDetail.contacts[0].primary, true);

const editContact = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:09:00.000Z", {
  requestId:"relationship-action-contactedit-0010",
  expectedVersion:investorDetail.relationship.version,
  action:"edit_contact",
  contactId:addContact.result.contactId,
  name:"Morgan Example",
  title:"Managing Principal"
});
investorState = editContact.state;
investorDetail = editContact.detail;
assert.ok(investorDetail.contacts.some((contact) => contact.name === "Morgan Example" && contact.title === "Managing Principal"));

const collisionState = structuredClone(investorState);
collisionState.companyContacts.push({
  contact_id:"contact-email-owner",
  name:"Existing Email Owner",
  email:"owned-contact@example.com",
  types:["vendor"]
});
const beforeCollision = structuredClone(collisionState);
assert.throws(() => executeRelationshipAction(collisionState, OWNER, investorRelationshipId, "2026-07-21T12:09:30.000Z", {
  requestId:"relationship-action-collision-0010",
  expectedVersion:investorDetail.relationship.version,
  action:"edit_contact",
  contactId:addContact.result.contactId,
  email:"owned-contact@example.com"
}), (error) => error instanceof RelationshipActionError && error.status === 409 && /another contact/i.test(error.message));
assert.deepEqual(collisionState, beforeCollision, "an email identity collision fails closed without changing either contact");

const updateStage = executeRelationshipAction(investorState, OWNER, investorRelationshipId, "2026-07-21T12:10:00.000Z", {
  requestId:"relationship-action-stage-0011",
  expectedVersion:investorDetail.relationship.version,
  action:"update_stage",
  stage:"proposal"
});
investorState = updateStage.state;
investorDetail = updateStage.detail;
assert.equal(investorDetail.relationship.stage.key, "proposal");
assert.equal(updateStage.state.companyOrganizations.find((organization) => organization.org_id === "org-investor")?.relationshipStage, "proposal");

const linkedStageState = structuredClone(state);
linkedStageState.companyOrganizations = linkedStageState.companyOrganizations.map((organization) => organization.org_id === "org-investor"
  ? { ...organization, links:[{ collection:"outreachOrganizations", itemId:"linked-stage-account" }] }
  : organization);
linkedStageState.outreachOrganizations.push({
  account_id:"linked-stage-account",
  organization_name:"Linked Stage Source Example",
  stage:"active"
});
const linkedStageDetail = buildRelationshipDetail(linkedStageState, OWNER, investorRelationshipId, "2026-07-21T12:10:15.000Z");
assert.equal(linkedStageDetail.relationship.stage.key, "active", "the linked source supplies the initial stage");
const linkedStageUpdate = executeRelationshipAction(linkedStageState, OWNER, investorRelationshipId, "2026-07-21T12:10:30.000Z", {
  requestId:"relationship-action-linkedstage-0017",
  expectedVersion:linkedStageDetail.relationship.version,
  action:"update_stage",
  stage:"qualified"
});
assert.equal(linkedStageUpdate.detail.relationship.stage.key, "qualified", "an explicit founder stage overlay wins over an older linked-source stage");

const sourceBackedStageState = structuredClone(state);
const sourceBackedDetail = buildRelationshipDetail(sourceBackedStageState, OWNER, prospect.id, "2026-07-21T12:10:40.000Z");
const sourceBackedStage = executeRelationshipAction(sourceBackedStageState, OWNER, prospect.id, "2026-07-21T12:10:45.000Z", {
  requestId:"relationship-action-sourcestage-0018",
  expectedVersion:sourceBackedDetail.relationship.version,
  action:"update_stage",
  stage:"closed"
});
assert.equal(sourceBackedStage.detail.relationship.stage.key, "closed", "source-backed organizations project the saved founder stage");

assert.throws(() => executeRelationshipAction(investorState, OPERATOR, investorRelationshipId, "2026-07-21T12:11:00.000Z", {
  requestId:"relationship-action-denied-0012",
  expectedVersion:investorDetail.relationship.version,
  action:"update_stage",
  stage:"active"
}), (error) => error instanceof RelationshipActionError && error.status === 403);
const operatorActionDetail = buildRelationshipDetail(investorState, OPERATOR, investorRelationshipId, "2026-07-21T12:11:00.000Z");
assert.equal(operatorActionDetail.capabilities.addTask, true);
assert.equal(operatorActionDetail.capabilities.addNote, true);
assert.equal(operatorActionDetail.capabilities.editContact, false);
assert.equal(operatorActionDetail.capabilities.updateStage, false);

const automatedContactState = structuredClone(state);
const automatedContactDetail = buildRelationshipDetail(automatedContactState, OWNER, prospect.id, "2026-07-21T12:11:10.000Z");
const automatedContact = automatedContactDetail.contacts.find((contact) => contact.email === "dana-partner@example.com");
assert.ok(automatedContact && automatedContactDetail.relationship.automatedOutreach, "the regression contact is enrolled in automated outreach");
const beforeAutomatedEmailChange = structuredClone(automatedContactState);
assert.throws(() => executeRelationshipAction(automatedContactState, OWNER, prospect.id, "2026-07-21T12:11:20.000Z", {
  requestId:"relationship-action-retarget-0019",
  expectedVersion:automatedContactDetail.relationship.version,
  action:"edit_contact",
  contactId:automatedContact.id,
  email:"retargeted-partner@example.com"
}), (error) => error instanceof RelationshipActionError && error.status === 409 && /automated outreach/i.test(error.message));
assert.deepEqual(automatedContactState, beforeAutomatedEmailChange, "editing a contact cannot silently retarget an active outreach sequence");

const customerRelationship = view.items.find((item) => item.name === "Casey Customer");
const reactivationIdentityState = structuredClone(state);
const reactivationIdentityDetail = buildRelationshipDetail(reactivationIdentityState, OWNER, customerRelationship.id, "2026-07-21T12:11:22.000Z");
const beforeReactivationIdentityChange = structuredClone(reactivationIdentityState);
assert.throws(() => executeRelationshipAction(reactivationIdentityState, OWNER, customerRelationship.id, "2026-07-21T12:11:23.000Z", {
  requestId:"relationship-action-reactivationemail-0023",
  expectedVersion:reactivationIdentityDetail.relationship.version,
  action:"edit_contact",
  contactId:reactivationIdentityDetail.contacts[0].id,
  email:"casey-corrected@example.com"
}), (error) => error instanceof RelationshipActionError && error.status === 409 && /customer history/i.test(error.message));
assert.deepEqual(reactivationIdentityState, beforeReactivationIdentityChange, "reactivation identity cannot be partially rekeyed away from its history");

const lifecycleIdentityState = structuredClone(state);
lifecycleIdentityState.expungementLifecycleContacts.push({
  lifecycle_contact_id:"lifecycle-contact-example",
  email:"lifecycle-customer@example.com",
  first_name:"Lifecycle Customer",
  lifecycle_stage:"screening",
  payment_status:"unpaid"
});
const lifecycleView = buildRelationshipsView(lifecycleIdentityState, OWNER, "2026-07-21T12:11:24.000Z");
const lifecycleRelationship = lifecycleView.items.find((item) => item.name === "Lifecycle Customer");
assert.ok(lifecycleRelationship);
const lifecycleIdentityDetail = buildRelationshipDetail(lifecycleIdentityState, OWNER, lifecycleRelationship.id, "2026-07-21T12:11:24.000Z");
const beforeLifecycleIdentityChange = structuredClone(lifecycleIdentityState);
assert.throws(() => executeRelationshipAction(lifecycleIdentityState, OWNER, lifecycleRelationship.id, "2026-07-21T12:11:25.000Z", {
  requestId:"relationship-action-lifecycleemail-0024",
  expectedVersion:lifecycleIdentityDetail.relationship.version,
  action:"edit_contact",
  contactId:lifecycleIdentityDetail.contacts[0].id,
  email:"lifecycle-corrected@example.com"
}), (error) => error instanceof RelationshipActionError && error.status === 409 && /customer history/i.test(error.message));
assert.deepEqual(lifecycleIdentityState, beforeLifecycleIdentityChange, "lifecycle identity cannot be partially rekeyed away from its history");

const vendorDetail = buildRelationshipDetail(state, OWNER, "contact:contact-vendor", NOW);
assert.equal(vendorDetail.capabilities.addContact, false);
const suppressedEmailState = structuredClone(state);
const beforeSuppressedEmailChange = structuredClone(suppressedEmailState);
assert.throws(() => executeRelationshipAction(suppressedEmailState, OWNER, "contact:contact-vendor", "2026-07-21T12:11:25.000Z", {
  requestId:"relationship-action-suppressed-0020",
  expectedVersion:vendorDetail.relationship.version,
  action:"edit_contact",
  contactId:"contact-vendor",
  email:"replacement-vendor@example.com"
}), (error) => error instanceof RelationshipActionError && error.status === 409 && /restrictions/i.test(error.message));
assert.deepEqual(suppressedEmailState, beforeSuppressedEmailChange, "a contact edit cannot bypass an email-only suppression record");
const vendorStage = executeRelationshipAction(structuredClone(state), OWNER, "contact:contact-vendor", "2026-07-21T12:11:30.000Z", {
  requestId:"relationship-action-vendorstage-0013",
  expectedVersion:vendorDetail.relationship.version,
  action:"update_stage",
  stage:"stalled"
});
assert.equal(vendorStage.detail.relationship.stage.key, "stalled", "stage updates project from a direct contact-backed relationship");
assert.throws(() => executeRelationshipAction(state, OWNER, "contact:contact-vendor", "2026-07-21T12:12:00.000Z", {
  requestId:"relationship-action-contact-0014",
  expectedVersion:vendorDetail.relationship.version,
  action:"add_contact",
  name:"Second Vendor Contact",
  email:"second-vendor@example.com"
}), (error) => error instanceof RelationshipActionError && error.status === 409);

let apiState = structuredClone(state);
const apiWrites = [];
const apiStore = {
  async readCollections(collectionNames) {
    return Object.fromEntries(collectionNames.map((collection) => [collection, structuredClone(apiState[collection] ?? [])]));
  },
  async writeCollections(patch) {
    apiWrites.push(Object.keys(patch).sort());
    apiState = { ...apiState, ...structuredClone(patch) };
  }
};
const encodedPartnerId = encodeURIComponent(partnerRelationshipId);
const apiGet = await handleRelationshipApiRequest({
  enabled:true,
  method:"GET",
  pathname:`/api/ui/relationships/${encodedPartnerId}`,
  store:apiStore,
  actor:OWNER,
  now:NOW
});
assert.equal(apiGet.status, 200);
assert.equal(apiGet.body.relationship.version, "legacy");
const apiPostInput = {
  requestId:"relationship-api-action-0015",
  expectedVersion:apiGet.body.relationship.version,
  action:"add_note",
  note:"API note saved inside the relationship."
};
const apiPost = await handleRelationshipApiRequest({
  enabled:true,
  method:"POST",
  pathname:`/api/ui/relationships/${encodedPartnerId}/action`,
  input:apiPostInput,
  store:apiStore,
  actor:OWNER,
  now:"2026-07-21T12:13:00.000Z"
});
assert.equal(apiPost.status, 200);
assert.equal(apiPost.body.outcome, "saved");
assert.equal(apiPost.body.externalActions, 0);
assert.ok(apiPost.body.detail.notes.some((note) => note.summary.includes("API note")));
assert.ok(apiWrites[0].every((collection) => ["partners", "activityEvents", "auditHistory"].includes(collection)));
const writesAfterSave = apiWrites.length;
const apiReplay = await handleRelationshipApiRequest({
  enabled:true,
  method:"POST",
  pathname:`/api/ui/relationships/${encodedPartnerId}/action`,
  input:apiPostInput,
  store:apiStore,
  actor:OWNER,
  now:"2026-07-21T12:14:00.000Z"
});
assert.equal(apiReplay.body.outcome, "already_applied");
assert.equal(apiWrites.length, writesAfterSave, "idempotent API replay performs no persistence write");
const apiMethod = await handleRelationshipApiRequest({ enabled:true, method:"PATCH", pathname:`/api/ui/relationships/${encodedPartnerId}/action`, store:apiStore, actor:OWNER });
assert.equal(apiMethod.status, 405);
const apiQuery = await handleRelationshipApiRequest({ enabled:true, method:"GET", pathname:`/api/ui/relationships/${encodedPartnerId}`, searchParams:new URLSearchParams("extra=true"), store:apiStore, actor:OWNER });
assert.equal(apiQuery.status, 400);

console.log("PASS test-vnext-relationships");
console.log(JSON.stringify({ relationships:view.summary.totalRelationships, followUpsDue:view.summary.followUpsDue, details:{ contacts:detail.contacts.length, timeline:detail.timeline.length, meetings:detail.meetings.length, files:detail.files.length }, actions:8, apiWrites:apiWrites.length, externalActions:0 }));

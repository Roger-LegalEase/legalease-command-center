#!/usr/bin/env node
import assert from "node:assert/strict";

import { buildRelationshipDetail, buildRelationshipsView } from "./relationship-service.mjs";

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
      primaryContactEmail:"avery@community.example.com",
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
    { contact_id:"contact-investor", name:"Indigo Investor", email:"indigo@seed.fund.example.com", types:["investor"], organizations:["org-investor"] },
    { contact_id:"contact-press", name:"Parker Press", email:"parker@daily.news.example.com", types:["media"], organizations:["org-press"] },
    { contact_id:"contact-vendor", name:"Val Vendor", email:"val@vendor.services.example.com", types:["vendor"] },
    { contact_id:"contact-internal", name:"Taylor Teammate", email:"taylor@team.legalease.example.com", types:["internal"] }
  ],
  outreachOrganizations:[
    { account_id:"prospect-account", organization_name:"Future Partner Example", domain:"future.partner.example.com", classification:"nonprofit" }
  ],
  outreachContacts:[
    {
      contact_id:"prospect-contact",
      contact_name:"Dana Prospect",
      email:"dana@future.partner.example.com",
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
    { contact_id:"customer-contact", full_name:"Casey Customer", email:"casey@customer.household.example.com", sequence_status:"Not Enrolled" }
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
    { id:"suppression-vendor", contact_id:"contact-vendor", email:"val@vendor.services.example.com", reason:"manual" }
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
      counterpartEmail:"dana@future.partner.example.com",
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
      attendees:[{ email:"avery@community.example.com", name:"Avery Partner" }],
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
assert.equal(partner.email, "avery@community.example.com");
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
const search = buildRelationshipsView(state, OWNER, NOW, { search:"dana@future.partner.example.com" });
assert.deepEqual(search.items.map((item) => item.organization), ["Future Partner Example"]);
const empty = buildRelationshipsView(state, OWNER, NOW, { search:"no matching relationship" });
assert.equal(empty.availability.state, "filtered_empty");
assert.equal(empty.items.length, 0);

const detail = buildRelationshipDetail(state, OWNER, "partner:partner/community", NOW);
assert.equal(detail.available, true);
assert.equal(detail.relationship.name, "Community Justice Example");
assert.equal(detail.contacts[0].email, "avery@community.example.com");
assert.equal(detail.tasks.length, 1);
assert.ok(detail.timeline.some((item) => item.label === "Scope meeting completed"));
assert.deepEqual(detail.meetings.map((item) => item.title), ["Community Justice scope review"]);
assert.ok(detail.notes.some((item) => item.summary.includes("monthly check-in")));
assert.ok(detail.notes.some((item) => item.summary.includes("shorter implementation window")));
assert.ok(detail.files.some((item) => item.title === "Community scope"));
assert.equal(detail.links.partner, "#partners/partner/partner%2Fcommunity");
assert.equal(detail.relationship.fullRecordHref, detail.relationship.href);

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

console.log("PASS test-vnext-relationships");
console.log(JSON.stringify({ relationships:view.summary.totalRelationships, followUpsDue:view.summary.followUpsDue, details:{ contacts:detail.contacts.length, timeline:detail.timeline.length, meetings:detail.meetings.length, files:detail.files.length }, mutations:0, externalActions:0 }));

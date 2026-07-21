#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCommunicationContext,
  buildGmailComposeUrl,
  CommunicationComposerError,
  communicationComposerSafeError,
  markCommunicationDraftSentManually,
  saveCommunicationDraft
} from "./communication-composer-service.mjs";

const NOW = "2026-07-21T15:30:00.000Z";
const SENT_AT = "2026-07-21T16:00:00.000Z";
const actor = { authenticated:true, id:"owner-session", role:"owner", label:"Roger" };

function state() {
  return {
    emailDrafts:[],
    partners:[{
      id:"partner-one",
      organizationName:"Second Chance Network",
      primaryContactName:"Avery Stone",
      primaryContactEmail:"avery@example.com",
      status:"proposal_sent",
      nextAction:"Confirm the pilot decision date.",
      nextFollowUpDate:"2026-07-22",
      ownerOnly:true,
      updatedAt:"2026-07-20T12:00:00.000Z"
    }],
    companyContacts:[{
      id:"company-contact-one",
      full_name:"Avery Stone",
      email:"avery@example.com",
      partnerId:"partner-one",
      ownerOnly:true
    }],
    companyOrganizations:[],
    outreachOrganizations:[{ account_id:"org-one", organization_name:"Second Chance Network" }],
    outreachContacts:[{
      contact_id:"outreach-contact-one",
      contact_name:"Avery Stone",
      email:"avery@example.com",
      linked_account_id:"org-one",
      campaign_id:"campaign-one",
      sequence_status:"Enrolled",
      classification:"nonprofit",
      partnerId:"partner-one",
      ownerOnly:true
    }],
    reactivationContacts:[{
      contact_id:"reactivation-one",
      full_name:"Avery Stone",
      email:"avery@example.com",
      sequence_status:"Enrolled",
      campaign_hold:false,
      ownerOnly:true
    }],
    prospectCandidates:[],
    rcapRevenueContacts:[],
    outreachSuppressions:[],
    tasks:[{
      id:"task-follow-up-one",
      title:"Follow up with Avery",
      description:"Close the loop on the proposal.",
      status:"open",
      priority:"high",
      dueDate:"2026-07-21",
      nextAction:"Ask for a decision date.",
      partnerId:"partner-one",
      sourceType:"partner",
      sourceId:"partner-one",
      ownerOnly:true,
      createdAt:"2026-07-20T10:00:00.000Z",
      updatedAt:"2026-07-20T10:00:00.000Z",
      history:[]
    }],
    inboxSignals:[{
      id:"inbox-signal-one",
      kind:"needs_reply",
      counterpartName:"Avery Stone",
      counterpartEmail:"avery@example.com",
      subject:"Pilot timing & next steps",
      summary:"Avery asked whether the pilot can begin next month.",
      evidence:["RAW INBOX BODY MUST NEVER APPEAR"],
      rawPayload:{ body:"RAW INBOX BODY MUST NEVER APPEAR" },
      partnerId:"partner-one",
      status:"suggested",
      ownerOnly:true
    }],
    supportIssues:[{
      id:"support-one",
      title:"Cannot open a saved packet",
      summary:"Synthetic customer cannot open the saved packet.",
      contact_email:"customer@example.com",
      urgency:"normal",
      upl_sensitive:false,
      status:"open",
      ownerOnly:true
    }],
    outreachReplies:[{
      id:"reply-one",
      contact_id:"outreach-contact-one",
      campaign_id:"campaign-one",
      status:"received",
      classification:"meeting_requested",
      subject:"Partnership conversation",
      body:"RAW OUTREACH REPLY BODY MUST NEVER APPEAR",
      rawPayload:{ body:"RAW OUTREACH REPLY BODY MUST NEVER APPEAR" },
      ownerOnly:true
    }],
    approvalQueue:[{
      id:"approval-one",
      type:"outreach_message",
      status:"approved",
      contact_id:"outreach-contact-one",
      to:"avery@example.com"
    }],
    activityEvents:[{
      id:"activity-prior",
      partnerId:"partner-one",
      eventType:"Meeting completed",
      title:"Pilot scoping conversation",
      summary:"Private meeting notes should not be copied into a draft context.",
      createdAt:"2026-07-20T14:00:00.000Z"
    }],
    auditHistory:[],
    outreachAttempts:[],
    reactivationAttempts:[],
    externalActionOutbox:[]
  };
}

// Contexts reuse safe source-specific skeletons and never expose imported message bodies.
{
  const current = state();
  const task = buildCommunicationContext(current, actor, "task", "task-follow-up-one", { now:NOW });
  assert.equal(task.ok, true);
  assert.equal(task.context.recipient.email, "avery@example.com");
  assert.equal(task.composer.recipient, "avery@example.com");
  assert.equal(task.composer.relatedTask.id, "task-follow-up-one");
  assert.match(task.composer.subject, /Follow-up/i);
  assert.equal(task.safety.externalSendAvailable, false);

  const partner = buildCommunicationContext(current, actor, "partner", "partner-one", { now:NOW });
  assert.match(partner.composer.body, /Draft only - not sent automatically/);
  assert.equal(partner.composer.relationship.id, "partner-one");

  const relationship = buildCommunicationContext(current, actor, "relationship", "contact:company-contact-one", { now:NOW });
  assert.equal(relationship.composer.recipientOrganization, "Second Chance Network");
  assert.equal(relationship.composer.recipient, "avery@example.com");

  const inbox = buildCommunicationContext(current, actor, "inbox_signal", "inbox-signal-one", { now:NOW });
  assert.match(inbox.composer.subject, /^Re:/);
  assert.doesNotMatch(JSON.stringify(inbox), /RAW INBOX BODY MUST NEVER APPEAR/);

  const support = buildCommunicationContext(current, actor, "support_issue", "support-one", { now:NOW });
  assert.equal(support.composer.recipient, "customer@example.com");
  assert.match(support.composer.body, /Add the specific answer here/);

  const reply = buildCommunicationContext(current, actor, "outreach_reply", "reply-one", { now:NOW });
  assert.equal(reply.composer.recipient, "avery@example.com", "reply recipient resolves from the existing outreach contact");
  assert.match(reply.composer.recentInteractionSummary, /meeting requested/);
  assert.doesNotMatch(JSON.stringify(reply), /RAW OUTREACH REPLY BODY MUST NEVER APPEAR/);
}

// Gmail compose URLs are encoded deep links only; no provider operation occurs.
{
  const url = new URL(buildGmailComposeUrl({
    recipient:"avery+pilot@example.com",
    subject:"Pilot & timing",
    body:"First line\nSecond line?"
  }));
  assert.equal(url.origin, "https://mail.google.com");
  assert.equal(url.searchParams.get("view"), "cm");
  assert.equal(url.searchParams.get("to"), "avery+pilot@example.com");
  assert.equal(url.searchParams.get("su"), "Pilot & timing");
  assert.equal(url.searchParams.get("body"), "First line\nSecond line?");
}

// Save is scoped to the draft and source projection; update uses optimistic concurrency.
let saved;
{
  const before = state();
  saved = saveCommunicationDraft(before, actor, {
    requestId:"draft_request_00000001",
    sourceKind:"inbox_signal",
    sourceId:"inbox-signal-one",
    recipient:"avery@example.com",
    recipientOrganization:"Second Chance Network",
    subject:"Re: Pilot timing & next steps",
    body:"Hi Avery,\n\nTuesday works. Would 2 PM ET be useful?\n\nBest,\nRoger"
  }, { now:NOW });
  assert.equal(saved.externalActions, 0);
  assert.equal(saved.ok, true);
  assert.deepEqual(Object.keys(saved.collections).sort(), ["emailDrafts", "inboxSignals"]);
  assert.equal(saved.state.inboxSignals[0].draftId, saved.draft.id);
  assert.equal(saved.draft.status, "Needs review");
  assert.match(saved.draft.gmailComposeUrl, /^https:\/\/mail\.google\.com/);
  assert.deepEqual(saved.state.outreachAttempts, before.outreachAttempts);
  assert.deepEqual(saved.state.reactivationAttempts, before.reactivationAttempts);
  assert.deepEqual(saved.state.externalActionOutbox, before.externalActionOutbox);

  const repeated = saveCommunicationDraft(before, actor, {
    requestId:"draft_request_00000001",
    sourceKind:"inbox_signal",
    sourceId:"inbox-signal-one",
    recipient:"avery@example.com",
    recipientOrganization:"Second Chance Network",
    subject:"Re: Pilot timing & next steps",
    body:"This replay must not create a second record."
  }, { now:NOW });
  assert.equal(repeated.alreadyExisted, false, "a replay against the original state creates the same deterministic record");
  assert.equal(repeated.draft.id, saved.draft.id);

  assert.throws(() => saveCommunicationDraft(saved.state, actor, {
    draftId:saved.draft.id,
    expectedVersion:"2026-07-20T00:00:00.000Z",
    sourceKind:"inbox_signal",
    sourceId:"inbox-signal-one",
    recipient:"avery@example.com",
    recipientOrganization:"Second Chance Network",
    subject:"Changed",
    body:"Changed"
  }, { now:"2026-07-21T15:45:00.000Z" }), (error) => error instanceof CommunicationComposerError && error.status === 409);
}

// Recording a manual send updates relationship truth, completes through the task engine,
// and places automated outreach under review without sending, releasing, or enrolling.
{
  const sent = markCommunicationDraftSentManually(saved.state, actor, saved.draft.id, {
    requestId:"manual_sent_request_001",
    expectedVersion:saved.draft.version,
    completeOriginatingTask:true,
    completionNote:"Follow-up sent from Gmail.",
    nextFollowUpDate:"2026-07-28",
    nextAction:"Confirm the meeting time."
  }, { now:SENT_AT });
  assert.equal(sent.externalActions, 0);
  assert.equal(sent.ok, true);
  assert.equal(sent.draft.status, "Sent manually");
  assert.equal(sent.taskCompleted, true);
  assert.equal(sent.nextFollowUpNeeded, false);
  assert.equal(sent.state.tasks[0].status, "done");
  assert.equal(sent.state.partners[0].lastContacted, SENT_AT);
  assert.equal(sent.state.partners[0].nextFollowUpDate, "2026-07-28");
  assert.equal(sent.state.companyContacts[0].last_outbound_at, SENT_AT);
  assert.equal(sent.state.outreachContacts[0].automation_review_required, true);
  assert.equal(sent.state.reactivationContacts[0].campaign_hold, true);
  assert.equal(sent.state.reactivationContacts[0].sequence_status, "Paused");
  assert.equal(sent.state.approvalQueue[0].status, "needs_manual_review");
  assert.equal(sent.state.inboxSignals[0].status, "done");
  assert.equal(sent.state.activityEvents[0].metadata.emailSentByApplication, false);
  assert.equal(sent.state.auditHistory[0].emailSentByApplication, false);
  assert.equal(sent.state.outreachAttempts.length, 0);
  assert.equal(sent.state.reactivationAttempts.length, 0);
  assert.equal(sent.state.externalActionOutbox.length, 0);

  const replay = markCommunicationDraftSentManually(sent.state, actor, saved.draft.id, {
    requestId:"manual_sent_request_001",
    expectedVersion:sent.draft.version,
    completeOriginatingTask:true
  }, { now:"2026-07-21T16:01:00.000Z" });
  assert.equal(replay.alreadyExisted, true);
  assert.deepEqual(replay.collections, {});
}

// Hard suppression disables the Gmail exit but does not prevent honest internal drafting.
{
  const current = state();
  current.outreachSuppressions = [{ id:"suppressed-one", email:"avery@example.com", reason:"unsubscribed" }];
  const context = buildCommunicationContext(current, actor, "partner", "partner-one", { now:NOW });
  assert.equal(context.composer.manualContactAllowed, false);
  assert.equal(context.composer.gmailComposeUrl, "");
  assert.match(context.composer.manualStatus, /unsubscribed/i);
}

// Sensitive contexts and mutations are owner/admin-only.
{
  const viewer = { authenticated:true, id:"viewer-session", role:"viewer" };
  assert.throws(() => buildCommunicationContext(state(), viewer, "partner", "partner-one", { now:NOW }), (error) => error.status === 403);
  const safe = communicationComposerSafeError(new CommunicationComposerError("Draft changed; refresh and try again.", 409, "conflict"));
  assert.equal(safe.status, 409);
  assert.equal(safe.body.outcome, "conflict");
}

// Structural proof: this domain service has no provider send implementation or provider mutation.
{
  const source = readFileSync(new URL("./communication-composer-service.mjs", import.meta.url), "utf8");
  for (const forbidden of ["gmail.users.messages.send", "users/me/messages/send", "runOutreachSend(", "runReactivationSend(", "sendgrid", "LIVE_SEND", "fetch("]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `service must not contain ${forbidden}`);
  }
}

console.log("communication composer service tests passed");

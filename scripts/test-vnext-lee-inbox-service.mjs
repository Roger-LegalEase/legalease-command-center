import assert from "node:assert/strict";
import {
  LEE_INBOX_ACTIONS,
  LEE_INBOX_CATEGORIES,
  LeeInboxError,
  buildLeeInboxView,
  executeLeeInboxAction,
  leeInboxSafeError,
  planLeeInboxRefresh
} from "./lee-inbox-service.mjs";

const NOW = "2026-07-21T15:00:00.000Z";
const OWNER = { authenticated:true, id:"owner-roger", role:"owner", label:"Roger" };
const ADMIN = { authenticated:true, id:"admin-1", role:"admin", label:"Admin" };
const OPERATOR = { authenticated:true, id:"operator-1", role:"operator", label:"Operations" };
const BODY_SENTINEL = "FULL-EMAIL-BODY-MUST-NEVER-LEAK";
let passed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function signal(id, kind, overrides = {}) {
  return {
    id,
    kind,
    status:"suggested",
    counterpartName:`Person ${id}`,
    counterpartEmail:`${id}@example.com`,
    summary:`Founder-facing summary for ${id}.`,
    ageDays:4,
    confidence:0.8,
    threadId:`thread-${id}`,
    ownerOnly:true,
    internalOnly:true,
    bodyText:BODY_SENTINEL,
    body:BODY_SENTINEL,
    evidence:[BODY_SENTINEL],
    updatedAt:"2026-07-21T14:00:00.000Z",
    ...overrides
  };
}

function googleInsight(id, insightType, overrides = {}) {
  return {
    id,
    source:insightType.includes("Meeting") ? "calendar" : "gmail",
    insightType,
    status:"suggested",
    title:`Safe ${insightType} signal`,
    inferredReason:`Safe reason for ${insightType}.`,
    suggestedNextAction:`Handle ${insightType.toLowerCase()}.`,
    relatedPersonOrOrg:"Example Organization",
    confidence:0.86,
    occurredAt:"2026-07-20T15:00:00.000Z",
    updatedAt:"2026-07-21T14:00:00.000Z",
    ownerOnly:true,
    rawPayload:{ body:BODY_SENTINEL },
    ...overrides
  };
}

const BASE_STATE = {
  connectorStatus:[{ connector:"gmail", status:"connected", connected:true }],
  inboxConfig:{ backfillCompletedAt:"", lastScanAt:"2026-07-20T12:00:00.000Z" },
  partners:[{
    id:"partner-1",
    organizationName:"Goodwill Delta",
    primaryContactName:"Dana Partner",
    primaryContactEmail:"partner@example.com",
    owner:"Roger",
    updatedAt:"2026-07-20T00:00:00.000Z"
  }],
  companyContacts:[{
    id:"investor-contact",
    fullName:"Ivy Investor",
    organizationName:"Example Ventures",
    email:"investor@example.com",
    contactType:"investor"
  }],
  inboxSignals:[
    signal("needs", "needs_reply", { dueAt:"2026-07-21T20:00:00.000Z" }),
    signal("quiet", "went_quiet", { ageDays:8 }),
    signal("founder-promise", "commitment", { dueAt:"2026-07-20T23:59:00.000Z" }),
    signal("their-promise", "their_commitment"),
    signal("partner-opportunity", "pipeline_inbound", {
      counterpartName:"Dana Partner",
      counterpartEmail:"partner@example.com",
      pipelineMatch:{ collection:"partners", itemId:"partner-1", matchedBy:"address" }
    }),
    signal("investor", "pipeline_inbound", {
      counterpartName:"Ivy Investor",
      counterpartEmail:"investor@example.com",
      pipelineMatch:{ collection:"companyContacts", itemId:"investor-contact", matchedBy:"address" }
    }),
    signal("press", "pipeline_inbound", { category:"press", organization:"Example Daily" }),
    signal("vendor", "pipeline_inbound", { category:"vendor", organization:"Example Services" }),
    signal("customer", "pipeline_inbound", { category:"customer", organization:"Example Customer" }),
    signal("internal", "pipeline_inbound", { category:"internal", organization:"LegalEase" })
  ],
  googleInsights:[
    googleInsight("meeting-prep", "Meeting Prep", { eventStart:"2026-07-22T16:00:00.000Z" }),
    googleInsight("meeting-follow-up", "Post-Meeting Follow-up", { occurredAt:"2026-07-20T16:00:00.000Z" })
  ],
  tasks:[],
  auditHistory:[],
  activityEvents:[]
};

console.log("Le-E founder inbox service tests");

{
  assert.deepEqual(LEE_INBOX_CATEGORIES, [
    "needs reply",
    "went quiet",
    "founder commitment",
    "their commitment",
    "partner opportunity",
    "investor",
    "press",
    "vendor",
    "customer",
    "internal",
    "meeting prep",
    "post-meeting follow-up"
  ]);
  assert.deepEqual(LEE_INBOX_ACTIONS, [
    "draft_reply",
    "create_task",
    "set_next_action",
    "snooze",
    "dismiss",
    "open_relationship",
    "open_google_context"
  ]);
  ok("the founder categories and action vocabulary are explicit and stable");
}

{
  const view = buildLeeInboxView(BASE_STATE, OWNER, NOW);
  assert.equal(view.ok, true);
  assert.equal(view.authorized, true);
  assert.equal(view.available, true);
  assert.equal(view.counts.total, 12);
  assert.deepEqual(new Set(view.items.map((item) => item.category)), new Set(LEE_INBOX_CATEGORIES));
  for (const item of view.items) {
    assert.ok(item.who);
    assert.ok("organization" in item);
    assert.ok(item.summary);
    assert.ok(["Roger", "Them", "Shared"].includes(item.whoOwesNextMove));
    assert.ok("dueAt" in item && "ageDays" in item && item.timingLabel);
    assert.ok(item.confidence.value >= 0 && item.confidence.value <= 1);
    assert.ok(item.suggestedNextAction);
    assert.equal(item.actions.createTask, true);
    assert.equal(item.actions.snooze, true);
  }
  assert.equal(view.items.find((item) => item.category === "went quiet").whoOwesNextMove, "Them");
  assert.equal(view.items.find((item) => item.category === "their commitment").whoOwesNextMove, "Them");
  assert.equal(view.items.find((item) => item.category === "meeting prep").googleContext.kind, "calendar");
  assert.equal(view.items.find((item) => item.category === "needs reply").googleContext.kind, "gmail");
  assert.equal(view.items.find((item) => item.category === "partner opportunity").relationship.id, "partner:partner-1");
  assert.equal(view.items.find((item) => item.category === "investor").relationship.id, "contact:investor-contact");
  assert.equal(JSON.stringify(view).includes(BODY_SENTINEL), false, "full bodies and evidence must never enter the view");
  assert.equal(JSON.stringify(view).includes("bodyText"), false);
  assert.equal(JSON.stringify(view).includes("rawPayload"), false);
  ok("signals and read-only Google insights project into a complete, body-free founder queue");
}

{
  const filtered = buildLeeInboxView(BASE_STATE, OWNER, NOW, { category:"investor", search:"ivy" });
  assert.equal(filtered.counts.total, 12);
  assert.equal(filtered.counts.visible, 1);
  assert.equal(filtered.items[0].category, "investor");
  assert.throws(
    () => buildLeeInboxView(BASE_STATE, OWNER, NOW, { category:"internal collection" }),
    (error) => error instanceof LeeInboxError && error.status === 400
  );
  const snoozedState = {
    ...BASE_STATE,
    inboxSignals:[...BASE_STATE.inboxSignals, signal("future-snooze", "needs_reply", {
      status:"snoozed",
      snoozedUntil:"2026-07-25T23:59:59.999Z"
    })]
  };
  assert.equal(buildLeeInboxView(snoozedState, OWNER, NOW).counts.total, 12);
  assert.equal(buildLeeInboxView(snoozedState, OWNER, NOW, { includeSnoozed:true }).counts.total, 13);
  ok("category/search filters and snooze visibility preserve a calm active queue");
}

{
  const unauthorized = buildLeeInboxView(BASE_STATE, OPERATOR, NOW);
  assert.equal(unauthorized.authorized, false);
  assert.deepEqual(unauthorized.items, []);
  assert.equal(JSON.stringify(unauthorized).includes("partner@example.com"), false);
  assert.equal(buildLeeInboxView(BASE_STATE, { authenticated:false, id:"", role:"owner" }, NOW).available, false);
  ok("owner-sensitive inbox context is not projected to an unauthorized account");
}

{
  const ownerPlan = planLeeInboxRefresh(BASE_STATE, OWNER, { now:NOW });
  assert.equal(ownerPlan.allowed, true);
  assert.equal(ownerPlan.ownerOnly, true);
  assert.equal(ownerPlan.readOnly, true);
  assert.equal(ownerPlan.requiresHeartbeat, false);
  assert.equal(ownerPlan.externalWrites, false);
  assert.equal(ownerPlan.connectionStatus, "available");
  assert.equal(ownerPlan.request.windowDays, 30);
  assert.equal(ownerPlan.request.messageCap, 500);
  assert.match(ownerPlan.message, /Nothing will be sent or changed in Gmail/);
  const rollingPlan = planLeeInboxRefresh({ ...BASE_STATE, inboxConfig:{ backfillCompletedAt:"2026-07-01T00:00:00.000Z" } }, OWNER, { now:NOW });
  assert.equal(rollingPlan.request.windowDays, 14);
  assert.equal(planLeeInboxRefresh(BASE_STATE, ADMIN, { now:NOW }).allowed, false, "refresh is owner-only even when an admin may read sensitive records");
  assert.equal(planLeeInboxRefresh(BASE_STATE, OPERATOR, { now:NOW }).mailboxBoundary, null);
  ok("manual refresh planning is owner-only, read-only, identity-bounded, and heartbeat-independent");
}

{
  const view = buildLeeInboxView(BASE_STATE, OWNER, NOW);
  const item = view.items.find((entry) => entry.source.id === "needs");
  const payload = {
    itemId:item.id,
    action:"create_task",
    requestId:"lee_create_task_0001",
    expectedVersion:item.source.version,
    title:"Reply to the open conversation",
    dueDate:"2026-07-22"
  };
  const result = executeLeeInboxAction(BASE_STATE, OWNER, NOW, payload);
  assert.equal(result.ok, true);
  assert.equal(result.result.externalActions, 0);
  assert.ok(result.result.taskId);
  assert.equal(result.state.tasks.length, 1);
  assert.equal(result.state.tasks[0].sourceType, "inbox_intelligence");
  assert.equal(result.state.tasks[0].sourceId, "needs");
  assert.equal(result.state.inboxSignals.find((entry) => entry.id === "needs").status, "queued");
  assert.equal(result.state.auditHistory[0].externalSideEffects, false);
  assert.equal(result.state.activityEvents[0].metadata.noExternalSystemsContacted, true);
  assert.equal(JSON.stringify(result.state.tasks).includes(BODY_SENTINEL), false);
  const repeated = executeLeeInboxAction(result.state, OWNER, NOW, payload);
  assert.equal(repeated.alreadyApplied, true);
  assert.equal(repeated.state.tasks.length, 1);
  ok("create task is scoped, idempotent, and records that no external action occurred");
}

{
  const item = buildLeeInboxView(BASE_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "quiet");
  const result = executeLeeInboxAction(BASE_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"snooze",
    requestId:"lee_snooze_item_001",
    expectedVersion:item.source.version,
    snoozeUntil:"2026-07-24"
  });
  const source = result.state.inboxSignals.find((entry) => entry.id === "quiet");
  assert.equal(source.status, "snoozed");
  assert.equal(source.snoozedUntil, "2026-07-24T23:59:59.999Z");
  assert.equal(buildLeeInboxView(result.state, OWNER, NOW).items.some((entry) => entry.source.id === "quiet"), false);
  assert.throws(
    () => executeLeeInboxAction(BASE_STATE, OWNER, NOW, {
      itemId:item.id,
      action:"snooze",
      requestId:"lee_snooze_past_001",
      expectedVersion:item.source.version,
      snoozeUntil:"2026-07-20"
    }),
    /future snooze date/
  );
  ok("snooze uses a validated future date and removes the reminder until it returns");
}

{
  const item = buildLeeInboxView(BASE_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "press");
  const result = executeLeeInboxAction(BASE_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"dismiss",
    requestId:"lee_dismiss_item_001",
    expectedVersion:item.source.version
  });
  assert.equal(result.state.inboxSignals.find((entry) => entry.id === "press").status, "dismissed");
  assert.equal(result.result.message, "Follow-up dismissed.");
  assert.equal(result.result.externalActions, 0);
  ok("dismiss records the founder decision without a provider call or confirmation step");
}

{
  const item = buildLeeInboxView(BASE_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "partner-opportunity");
  const payload = {
    itemId:item.id,
    action:"set_next_action",
    requestId:"lee_partner_next_001",
    expectedVersion:item.source.version,
    nextAction:"Send the pilot overview",
    dueDate:"2026-07-23"
  };
  const result = executeLeeInboxAction(BASE_STATE, OWNER, NOW, payload);
  const partner = result.state.partners.find((entry) => entry.id === "partner-1");
  assert.equal(partner.nextAction, "Send the pilot overview");
  assert.equal(partner.nextFollowUpDate, "2026-07-23");
  assert.equal(result.state.inboxSignals.find((entry) => entry.id === "partner-opportunity").status, "queued");
  assert.equal(result.result.externalActions, 0);
  assert.equal(executeLeeInboxAction(result.state, OWNER, NOW, payload).alreadyApplied, true);
  ok("set next action reuses the existing Partner action boundary when a Partner is linked");
}

{
  const item = buildLeeInboxView(BASE_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "internal");
  const result = executeLeeInboxAction(BASE_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"set_next_action",
    requestId:"lee_internal_next_001",
    expectedVersion:item.source.version,
    nextAction:"Confirm the internal owner",
    dueDate:"2026-07-22"
  });
  assert.equal(result.state.tasks.length, 1);
  assert.equal(result.state.tasks[0].title, "Confirm the internal owner");
  assert.equal(result.result.message, "Next action saved as a follow-up task.");
  ok("set next action falls back to the existing task model when no Partner record is linked");
}

{
  const item = buildLeeInboxView(BASE_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "needs");
  assert.throws(
    () => executeLeeInboxAction(BASE_STATE, OWNER, NOW, {
      itemId:item.id,
      action:"dismiss",
      requestId:"lee_stale_item_0001",
      expectedVersion:"2026-07-21T13:00:00.000Z"
    }),
    (error) => error instanceof LeeInboxError && error.status === 409 && error.outcome === "stale"
  );
  assert.throws(
    () => executeLeeInboxAction(BASE_STATE, OPERATOR, NOW, {
      itemId:item.id,
      action:"dismiss",
      requestId:"lee_denied_item_001",
      expectedVersion:item.source.version
    }),
    (error) => error instanceof LeeInboxError && error.status === 403
  );
  const safe = leeInboxSafeError(new LeeInboxError("Task changed; refresh and try again.", 409, "stale"));
  assert.deepEqual(safe, {
    status:409,
    body:{ ok:false, outcome:"stale", message:"Task changed; refresh and try again." }
  });
  ok("stale writes and unauthorized actions fail closed with concise founder-facing errors");
}

console.log(`PASS test-vnext-lee-inbox-service (${passed} checks)`);

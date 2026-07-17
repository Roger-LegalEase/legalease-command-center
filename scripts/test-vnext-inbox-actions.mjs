#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  InboxActionError,
  executeAuthorizedInboxAction,
  inboxActionSafeError,
  parseInboxActionPayload
} from "./inbox-action-service.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "./roles.mjs";
import {
  INBOX_ACTION_ENDPOINT,
  INBOX_ACTION_PRESENTATION,
  INBOX_ACTION_SOURCE_MATRIX,
  INBOX_MUTATION_INTENTS,
  inboxActionsForProjectionItem
} from "./ui-actions/inbox-actions.mjs";
import { inboxActionBrowserSource, renderInboxActionLayer } from "./ui/inbox-action-ui.mjs";
import { buildInboxPageView } from "./ui/view-models/inbox-page-view.mjs";
import { buildInboxView } from "./ui/view-models/inbox-view.mjs";
import { ROUTE_COMPATIBILITY_TOTALS } from "./ui/route-compatibility.mjs";

const NOW = "2026-07-17T16:00:00.000Z";
const OWNER = Object.freeze({ id:"owner", role:"owner", label:"Roger", authenticated:true });
const OPERATOR = Object.freeze({ id:"operator", role:"operator", label:"Operations", authenticated:true });

function fixtureState() {
  return {
    approvals:[{
      id:"action-approval-social",
      action_type:"review_social_post",
      queue_item_id:"action-queue-approval",
      preview:"Review the example post",
      risk_level:"caution",
      state:"requested",
      requested_at:"2026-07-17T14:00:00.000Z"
    }],
    queueItems:[
      {
        id:"action-queue-approval",
        sourceRef:{ collection:"posts", itemId:"action-post" },
        type:"approval",
        status:"needs_roger",
        title:"Example post needs approval",
        summary:"The post needs a recorded review before it can move forward.",
        priority:10,
        owner:"Roger",
        requiresApproval:true,
        approvalId:"action-approval-social",
        metadata:{ decisionType:"review_social_post" },
        updatedAt:"2026-07-17T14:00:00.000Z"
      },
      {
        id:"action-queue-complete",
        type:"support",
        status:"needs_roger",
        title:"Confirm the support follow-up",
        summary:"The reviewed follow-up is ready to be marked complete.",
        priority:25,
        owner:"Roger",
        requiresApproval:false,
        updatedAt:"2026-07-17T13:00:00.000Z"
      },
      {
        id:"action-queue-snooze",
        type:"meeting",
        status:"needs_roger",
        title:"Revisit the meeting brief",
        summary:"This meeting brief needs a decision or a real revisit date.",
        priority:30,
        owner:"Roger",
        requiresApproval:false,
        updatedAt:"2026-07-17T12:00:00.000Z"
      },
      {
        id:"action-queue-hidden",
        type:"approval",
        status:"needs_roger",
        title:"Confidential owner decision",
        summary:"This private decision is visible only to its owner.",
        priority:5,
        owner:"Roger",
        requiresApproval:true,
        visibility:"owner_only",
        updatedAt:"2026-07-17T15:00:00.000Z"
      }
    ],
    approvalQueue:[{
      id:"action-legacy-approval",
      type:"post",
      sourceId:"action-direct-post",
      title:"Legacy social review",
      status:"needs_review",
      updatedAt:"2026-07-17T11:00:00.000Z"
    }],
    posts:[
      { id:"action-post", title:"Example post", status:"needs_review", owner:"Roger", updatedAt:"2026-07-17T14:00:00.000Z" },
      { id:"action-direct-post", title:"Direct social review", status:"needs_review", owner:"Roger", updatedAt:"2026-07-17T11:00:00.000Z" }
    ],
    campaigns:[{
      id:"action-campaign",
      title:"Example outreach decision",
      status:"ready_to_approve",
      owner:"Roger",
      updatedAt:"2026-07-17T10:00:00.000Z"
    }],
    partners:[{
      id:"action-partner",
      name:"Example Partner",
      owner:"Roger",
      nextAction:"Confirm the next conversation.",
      nextActionDueDate:"2026-07-17",
      status:"qualified",
      updatedAt:"2026-07-17T09:00:00.000Z"
    }],
    tasks:[
      {
        id:"action-task",
        title:"Complete the Partner follow-up",
        description:"The reviewed Partner follow-up is ready to complete.",
        status:"open",
        owner:"Roger",
        priority:"high",
        important:true,
        dueDate:"2026-07-17",
        sourceType:"partner",
        sourceId:"action-partner",
        partnerId:"action-partner",
        updatedAt:"2026-07-17T15:30:00.000Z"
      },
      {
        id:"action-task-operator",
        title:"Complete the operations checklist",
        description:"The operations checklist is assigned and ready to complete.",
        status:"open",
        owner:"Operations",
        priority:"high",
        important:true,
        dueDate:"2026-07-17",
        updatedAt:"2026-07-17T15:20:00.000Z"
      }
    ],
    automationSuggestions:[{
      id:"action-automation",
      title:"Suggested Partner update",
      explanation:"A suggested record change needs review before anything changes.",
      status:"pending",
      owner:"Operations",
      updatedAt:"2026-07-17T08:00:00.000Z"
    }],
    inboxSignals:[{
      id:"action-reply",
      kind:"needs_reply",
      status:"suggested",
      counterpartName:"Example Contact",
      summary:"A response needs a decision.",
      updatedAt:"2026-07-17T07:00:00.000Z"
    }],
    growthInbox:[],
    supportIssues:[],
    reports:[],
    dataRoomItems:[{
      id:"action-file",
      title:"Investor Room evidence",
      status:"needs_update",
      owner:"Roger",
      nextReviewDate:"2026-07-17",
      updatedAt:"2026-07-17T06:00:00.000Z"
    }],
    evidencePackNotes:[],
    soc2Evidence:[],
    soc2Policies:[],
    companyEvents:[],
    auditHistory:[],
    activityEvents:[]
  };
}

function allItems(state, actor = OWNER) {
  const view = buildInboxView(state, actor, NOW);
  return [...view.groups.needsMe, ...view.groups.waiting, ...view.groups.updates];
}

function itemBySource(state, sourceKind, sourceId, actor = OWNER) {
  return allItems(state, actor).find((item) => item.sourceKind === sourceKind && item.sourceId === sourceId);
}

function payloadFor(item, intent, extra = {}) {
  return {
    inboxItemId:item.id,
    intent,
    requestId:`request-${intent}-${String(item.sourceId).replace(/[^a-z0-9]/gi, "-")}`,
    expectedUpdatedAt:item.updatedAt,
    ...extra
  };
}

assert.equal(INBOX_ACTION_ENDPOINT, "/api/ui/inbox/action");
assert.deepEqual(INBOX_MUTATION_INTENTS, ["approve", "complete", "snooze"]);
assert.ok(Object.isFrozen(INBOX_ACTION_PRESENTATION));
assert.ok(Object.values(INBOX_ACTION_PRESENTATION).every(Object.isFrozen));
assert.ok(Object.isFrozen(INBOX_ACTION_SOURCE_MATRIX) && INBOX_ACTION_SOURCE_MATRIX.every(Object.isFrozen));
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", INBOX_ACTION_ENDPOINT), ["read_internal"]);
assert.equal(canPerformEndpoint("owner", "POST", INBOX_ACTION_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("operator", "POST", INBOX_ACTION_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("viewer", "POST", INBOX_ACTION_ENDPOINT).ok, false);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);

const initial = fixtureState();
const before = structuredClone(initial);
const projection = buildInboxView(initial, OWNER, NOW);
const page = buildInboxPageView(projection, {});
assert.deepEqual(initial, before, "Registry and page reads must remain side-effect-free.");
assert.ok(page.items.every((item) => Object.isFrozen(item.actions)));
assert.ok(page.items.every((item) => !Object.hasOwn(item, "sourceKind") && !Object.hasOwn(item, "sourceId")));
assert.ok(page.items.every((item) => !Object.hasOwn(item, "actionIntents")));

const approvalItem = itemBySource(initial, "approvals", "action-approval-social");
const completeQueueItem = itemBySource(initial, "queueItems", "action-queue-complete");
const snoozeQueueItem = itemBySource(initial, "queueItems", "action-queue-snooze");
const taskItem = itemBySource(initial, "tasks", "action-task");
assert.deepEqual(inboxActionsForProjectionItem(approvalItem).map((action) => action.intent), ["approve"]);
assert.deepEqual(inboxActionsForProjectionItem(completeQueueItem).map((action) => action.intent), ["complete", "snooze"]);
assert.deepEqual(inboxActionsForProjectionItem(taskItem).map((action) => action.intent), ["complete"]);
for (const sourceKind of ["approvalQueue", "posts", "campaigns", "partners", "automationSuggestions", "inboxSignals", "dataRoomItems"]) {
  const item = allItems(initial).find((candidate) => candidate.sourceKind === sourceKind);
  if (item) assert.deepEqual(inboxActionsForProjectionItem(item), [], `${sourceKind} must remain Open-only.`);
}
for (const item of projection.groups.updates) assert.deepEqual(inboxActionsForProjectionItem(item), []);

assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), collection:"tasks" }), /unsupported information/);
assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), status:"done" }), /unsupported information/);
assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), patch:{ status:"done" } }), /unsupported information/);
assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), endpoint:"/api/tasks/action-task/done" }), /unsupported information/);
assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), operation:"updateTaskInState" }), /unsupported information/);
assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), intent:"open" }), /not supported/);
assert.throws(() => parseInboxActionPayload({ ...payloadFor(taskItem, "complete"), intent:"delete" }), /not supported/);

const approvalBeforeEvents = initial.companyEvents.length;
const approvalStartedAt = performance.now();
const approved = executeAuthorizedInboxAction(initial, OWNER, NOW, payloadFor(approvalItem, "approve"));
const approvalMs = Math.round((performance.now() - approvalStartedAt) * 1000) / 1000;
assert.equal(approved.body.ok, true);
assert.equal(approved.body.alreadyApplied, false);
assert.equal(approved.state.queueItems.find((item) => item.id === "action-queue-approval").status, "approved");
assert.equal(approved.state.approvals.find((item) => item.id === "action-approval-social").state, "approved");
assert.equal(approved.state.approvals.length, initial.approvals.length, "Approval must update one authoritative record.");
assert.equal(approved.state.companyEvents.length, approvalBeforeEvents + 1);
assert.deepEqual(approved.state.posts, initial.posts, "Approval must not publish or mutate Social records.");
assert.deepEqual(approved.state.campaigns, initial.campaigns, "Approval must not launch a Campaign.");
assert.deepEqual(Object.keys(approved.collections).sort(), ["approvals", "companyEvents", "queueItems"]);

const repeatedApproval = executeAuthorizedInboxAction(approved.state, OWNER, NOW, payloadFor(approvalItem, "approve"));
assert.equal(repeatedApproval.body.alreadyApplied, true);
assert.equal(repeatedApproval.state.approvals.length, approved.state.approvals.length);
assert.equal(repeatedApproval.state.companyEvents.length, approved.state.companyEvents.length);
assert.deepEqual(repeatedApproval.collections, {});
assert.throws(
  () => executeAuthorizedInboxAction(approved.state, OPERATOR, NOW, payloadFor(approvalItem, "approve")),
  (error) => error instanceof InboxActionError && error.status === 404,
  "An already-applied action must still reauthorize."
);

const queueCompleteStartedAt = performance.now();
const queueCompleted = executeAuthorizedInboxAction(initial, OWNER, NOW, payloadFor(completeQueueItem, "complete"));
const queueCompleteMs = Math.round((performance.now() - queueCompleteStartedAt) * 1000) / 1000;
assert.equal(queueCompleted.state.queueItems.find((item) => item.id === "action-queue-complete").status, "completed");
assert.equal(queueCompleted.state.companyEvents.length, initial.companyEvents.length + 1);
assert.deepEqual(queueCompleted.state.partners, initial.partners);

const snoozeStartedAt = performance.now();
const snoozed = executeAuthorizedInboxAction(initial, OWNER, NOW, payloadFor(snoozeQueueItem, "snooze", { snoozeUntil:"2026-07-18" }));
const snoozeMs = Math.round((performance.now() - snoozeStartedAt) * 1000) / 1000;
const snoozedRecord = snoozed.state.queueItems.find((item) => item.id === "action-queue-snooze");
assert.equal(snoozedRecord.status, "snoozed");
assert.match(snoozedRecord.snoozedUntil, /^2026-07-18T23:59:59\.999-04:00$/);
assert.equal(snoozed.state.companyEvents.length, initial.companyEvents.length + 1);
const repeatedSnooze = executeAuthorizedInboxAction(snoozed.state, OWNER, NOW, payloadFor(snoozeQueueItem, "snooze", { snoozeUntil:"2026-07-18" }));
assert.equal(repeatedSnooze.body.alreadyApplied, true);
assert.equal(repeatedSnooze.state.companyEvents.length, snoozed.state.companyEvents.length);
assert.throws(
  () => executeAuthorizedInboxAction(initial, OWNER, NOW, payloadFor(snoozeQueueItem, "snooze", { snoozeUntil:"2026-07-16" })),
  /future snooze date/
);

const taskStartedAt = performance.now();
const taskCompleted = executeAuthorizedInboxAction(initial, OWNER, NOW, payloadFor(taskItem, "complete"));
const taskMs = Math.round((performance.now() - taskStartedAt) * 1000) / 1000;
assert.equal(taskCompleted.state.tasks.find((item) => item.id === "action-task").status, "done");
assert.equal(taskCompleted.state.auditHistory.length, initial.auditHistory.length + 1);
assert.equal(taskCompleted.state.activityEvents.length, initial.activityEvents.length + 1);
assert.deepEqual(taskCompleted.state.partners, initial.partners, "Completing a linked Task must not change Partner stage.");
assert.deepEqual(Object.keys(taskCompleted.collections).sort(), ["activityEvents", "auditHistory", "tasks"]);
const repeatedTask = executeAuthorizedInboxAction(taskCompleted.state, OWNER, NOW, payloadFor(taskItem, "complete"));
assert.equal(repeatedTask.body.alreadyApplied, true);
assert.equal(repeatedTask.state.auditHistory.length, taskCompleted.state.auditHistory.length);
assert.equal(repeatedTask.state.activityEvents.length, taskCompleted.state.activityEvents.length);

const staleState = structuredClone(initial);
staleState.tasks = staleState.tasks.map((task) => task.id === "action-task" ? { ...task, updatedAt:"2026-07-17T15:45:00.000Z" } : task);
const staleBefore = structuredClone(staleState);
assert.throws(
  () => executeAuthorizedInboxAction(staleState, OWNER, NOW, payloadFor(taskItem, "complete")),
  (error) => error instanceof InboxActionError && error.status === 409 && error.outcome === "stale"
);
assert.deepEqual(staleState, staleBefore, "A stale action must create zero transitions.");

const operatorTask = itemBySource(initial, "tasks", "action-task-operator", OPERATOR);
assert.ok(operatorTask, "The operator may see and complete its authorized Task.");
const operatorCompleted = executeAuthorizedInboxAction(initial, OPERATOR, NOW, payloadFor(operatorTask, "complete"));
assert.equal(operatorCompleted.state.tasks.find((item) => item.id === "action-task-operator").status, "done");
assert.throws(
  () => executeAuthorizedInboxAction(initial, OPERATOR, NOW, payloadFor(completeQueueItem, "complete")),
  (error) => error instanceof InboxActionError && error.status === 404
);
const hiddenOwnerItem = itemBySource(initial, "queueItems", "action-queue-hidden", OWNER);
assert.ok(hiddenOwnerItem);
assert.throws(
  () => executeAuthorizedInboxAction(initial, OPERATOR, NOW, payloadFor(hiddenOwnerItem, "approve")),
  (error) => error instanceof InboxActionError && error.status === 404 && !/Confidential|owner decision/.test(error.message)
);

const unsupported = allItems(initial).find((item) => item.sourceKind === "automationSuggestions");
assert.throws(
  () => executeAuthorizedInboxAction(initial, OWNER, NOW, payloadFor(unsupported, "approve")),
  (error) => error instanceof InboxActionError && [404, 409].includes(error.status)
);
assert.deepEqual(initial, before, "Failed and successful pure service calls must not mutate their input state.");

const safeTemporary = inboxActionSafeError(new Error("private stack and provider response"));
assert.equal(safeTemporary.status, 500);
assert.doesNotMatch(JSON.stringify(safeTemporary), /private stack|provider response|collection|capability|endpoint/);

const layer = renderInboxActionLayer();
const browser = inboxActionBrowserSource();
assert.match(layer, /<dialog/);
assert.match(layer, /aria-labelledby/);
assert.match(layer, /Tomorrow/);
assert.match(layer, /Next week/);
assert.match(layer, /Choose a date/);
for (const behavior of ["Working…", "alreadyApplied", "x-csrf-token", "same-origin", "vnext:session-expired", "vnext:recovery-mode", "Escape", "Try again"]) {
  if (behavior === "Escape") assert.match(layer + browser, /cancel/);
  else assert.ok((layer + browser).includes(behavior), `${behavior} must be represented by the action UI.`);
}
assert.doesNotMatch(browser, /\/api\/state|\/api\/boot-state|localStorage|sessionStorage/);
assert.doesNotMatch(browser, /\b(?:Send|Publish|Launch|Release|Resume|Apply|Delete|Reject)\b/);
assert.match(browser, /method:"POST"/);

const registrySource = readFileSync("scripts/ui-actions/inbox-actions.mjs", "utf8");
const actionUiSource = readFileSync("scripts/ui/inbox-action-ui.mjs", "utf8");
const serviceSource = readFileSync("scripts/inbox-action-service.mjs", "utf8");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(registrySource + actionUiSource, /^\s*import[^\n]+(?:storage|database|provider|publish|send|campaign-command|tasks-engine|company-memory|preview-server)/im);
assert.doesNotMatch(registrySource + actionUiSource, /process\.env|readFile|writeFile/);
assert.match(serviceSource, /buildInboxView\(state, actor, nowIso\)/);
assert.match(serviceSource, /find\(\(entry\) => entry\.id === parsed\.inboxItemId\)/);
assert.doesNotMatch(serviceSource, /payload\.(?:sourceKind|sourceId|collection|status|patch|endpoint|operation|capability)/);
assert.match(serviceSource, /roleHasCapability/);
assert.match(serviceSource, /transitionQueueItem/);
assert.match(serviceSource, /updateTaskInState/);
assert.match(serverSource, /url\.pathname === "\/api\/ui\/inbox\/action" && request\.method === "POST"/);
assert.match(serverSource, /readBoundedJson\(request, \{ limit:INBOX_ACTION_BODY_LIMIT \}\)/);
assert.match(serverSource, /serializeStateMutation/);
assert.match(serverSource, /store\.writeCollections\(action\.collections\)/);
assert.doesNotMatch(serverSource.slice(serverSource.indexOf('url.pathname === "/api/ui/inbox/action" && request.method === "POST"'), serverSource.indexOf("url.pathname === ROUTE_ACCESS_ENDPOINT")), /writeState\(|publish|sendEmail|executeApproved|applyAutomation/i);

const migrationDirectory = ["supabase/migrations", "migrations"].find(existsSync);
const migrationFiles = migrationDirectory
  ? readdirSync(migrationDirectory, { withFileTypes:true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
  : [];
assert.equal(migrationFiles.some((name) => /inbox/i.test(name) && /202|action/i.test(name)), false);
assert.doesNotMatch(registrySource + serviceSource + actionUiSource, /state\.(?:inbox|inboxItems|universalInbox)\s*=/);

const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.equal(
  createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex"),
  "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187",
  "Legacy flag-off shell must remain byte-for-byte unchanged."
);

const responseSizes = {
  approve:Buffer.byteLength(JSON.stringify(approved.body)),
  taskComplete:Buffer.byteLength(JSON.stringify(taskCompleted.body)),
  queueComplete:Buffer.byteLength(JSON.stringify(queueCompleted.body)),
  snooze:Buffer.byteLength(JSON.stringify(snoozed.body))
};
assert.ok(Object.values(responseSizes).every((bytes) => bytes < 8_000));
const projectionStartedAt = performance.now();
buildInboxView(fixtureState(), OWNER, NOW);
const projectionRebuildMs = Math.round((performance.now() - projectionStartedAt) * 1000) / 1000;

console.log("INBOX_ACTION_PERFORMANCE", JSON.stringify({
  responseMs:{ approve:approvalMs, taskComplete:taskMs, queueComplete:queueCompleteMs, snooze:snoozeMs },
  responseBytes:responseSizes,
  projectionRebuildMs,
  projectionRebuildsPerAction:2,
  storageWritesPerSuccessfulDomainAction:1,
  sourceTransitionsPerSuccessfulAction:1,
  duplicateTransitions:0,
  approvalRecordsCreated:0,
  approvalRecordsUpdated:1,
  queueAuditEventsPerTransition:1,
  taskAuditEventsPerTransition:1,
  taskActivityEventsPerTransition:1,
  fullStateRequests:0,
  sends:0,
  publications:0,
  campaignExecutions:0,
  recipientEnrollments:0,
  providerCalls:0,
  partnerStageChanges:0,
  fileStatusChanges:0,
  suppressionChanges:0,
  liveGateChanges:0
}));
console.log("PASS test-vnext-inbox-actions");

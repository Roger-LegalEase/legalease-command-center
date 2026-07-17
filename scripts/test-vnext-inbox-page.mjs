#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildAuthorizedInboxPage } from "./inbox-page-service.mjs";
import { requiredCapabilitiesForEndpoint, canPerformEndpoint } from "./roles.mjs";
import {
  PRIMARY_SHELL_DESTINATIONS,
  SECONDARY_SHELL_CONTROLS
} from "./ui/app-shell-navigation.mjs";
import {
  INBOX_PAGE_CONTRACT,
  inboxPageBrowserSource,
  renderInboxPageLoading
} from "./ui/pages/inbox-page.mjs";
import {
  INBOX_PAGE_DUE_CONTRACT,
  INBOX_PAGE_GROUPS,
  INBOX_PAGE_LIMITS,
  buildInboxPageView,
  dueStateForInboxItem
} from "./ui/view-models/inbox-page-view.mjs";
import { buildInboxView } from "./ui/view-models/inbox-view.mjs";
import {
  ROUTE_COMPATIBILITY_TOTALS,
  resolveRouteCompatibility
} from "./ui/route-compatibility.mjs";

const NOW = "2026-07-16T16:00:00.000Z";
const OWNER = Object.freeze({ id:"owner", role:"owner", label:"Roger", authenticated:true });

function fixtureState(taskCount = 8) {
  return {
    approvals:[{
      id:"page-approval-social",
      action_type:"review_social_post",
      queue_item_id:"page-queue-social",
      preview:"Review the community post",
      state:"requested",
      requested_at:"2026-07-15T15:00:00.000Z"
    }],
    queueItems:[{
      id:"page-queue-social",
      sourceRef:{ collection:"posts", itemId:"page-post-social" },
      type:"approval",
      status:"needs_roger",
      title:"Community post needs two fixes",
      summary:"The post needs copy and safety review before it can move forward.",
      priority:20,
      requiresApproval:true,
      metadata:{ decisionType:"review_social_post" },
      updatedAt:"2026-07-15T15:00:00.000Z"
    }],
    approvalQueue:[],
    posts:[
      {
        id:"page-post-social",
        title:"Community post needs two fixes",
        status:"needs_review",
        approvalStatus:"needs_review",
        priority:"high",
        owner:"Roger",
        updatedAt:"2026-07-15T14:00:00.000Z"
      },
      {
        id:"page-post-update",
        title:"Partner milestone announcement",
        status:"posted",
        postedAt:"2026-07-16T14:00:00.000Z",
        updatedAt:"2026-07-16T14:00:00.000Z"
      },
      {
        id:"page-post-hidden",
        title:"Confidential acquisition post",
        status:"needs_review",
        visibility:"owner_only",
        updatedAt:"2026-07-15T16:00:00.000Z"
      }
    ],
    campaigns:[{
      id:"page-campaign",
      title:"July Partner outreach campaign",
      status:"ready_to_approve",
      owner:"Roger",
      priority:"high",
      launchDate:"2026-07-18",
      updatedAt:"2026-07-15T13:00:00.000Z"
    }],
    partners:[
      {
        id:"page-partner-due",
        name:"Philadelphia Reentry Coalition",
        owner:"Roger",
        nextAction:"Confirm the next Partner conversation.",
        nextActionDueDate:"2026-07-15",
        priority:"normal",
        updatedAt:"2026-07-15T12:00:00.000Z"
      },
      {
        id:"page-partner-waiting",
        name:"Future Partner",
        owner:"Roger",
        nextAction:"Follow up after the agreed response date.",
        nextActionDueDate:"2026-07-25",
        priority:"normal",
        updatedAt:"2026-07-15T11:00:00.000Z"
      }
    ],
    tasks:Array.from({ length:taskCount }, (_, index) => ({
      id:`page-task-${String(index).padStart(2, "0")}`,
      title:`Important Task ${String(index + 1).padStart(2, "0")}`,
      description:"This assigned Task is ready for attention.",
      status:index === 1 ? "waiting" : "open",
      waitingOn:index === 1 ? "A recorded external response." : "",
      owner:"Roger",
      important:true,
      priority:index === 0 ? "urgent" : "high",
      dueDate:index % 3 === 0 ? "" : `2026-07-${String(15 + (index % 8)).padStart(2, "0")}`,
      updatedAt:`2026-07-15T${String(index % 20).padStart(2, "0")}:30:00.000Z`
    })),
    automationSuggestions:[{
      id:"page-suggestion",
      title:"Review a suggested Partner update",
      explanation:"A read-only signal found a possible Partner update. Nothing changes without approval.",
      status:"pending",
      priority:"normal",
      owner:"Roger",
      updatedAt:"2026-07-15T10:00:00.000Z"
    }],
    inboxSignals:[{
      id:"page-reply",
      kind:"needs_reply",
      status:"suggested",
      counterpartName:"Synthetic Partner Contact",
      summary:"A Partner response needs a reply.",
      updatedAt:"2026-07-15T09:00:00.000Z"
    }],
    growthInbox:[],
    supportIssues:[],
    reports:[],
    dataRoomItems:[{
      id:"page-file",
      title:"Investor Room operating plan",
      status:"needs_update",
      owner:"Roger",
      nextReviewDate:"2026-07-15",
      priority:"high",
      updatedAt:"2026-07-15T08:00:00.000Z"
    }],
    evidencePackNotes:[],
    soc2Evidence:[],
    soc2Policies:[]
  };
}

function allPageItems(state = fixtureState(), query = {}) {
  return buildAuthorizedInboxPage(state, OWNER, NOW, query);
}

assert.equal(INBOX_PAGE_CONTRACT.route, "inbox");
assert.equal(INBOX_PAGE_CONTRACT.endpoint, "/api/ui/inbox");
assert.equal(resolveRouteCompatibility("#inbox").kind, "page");
assert.equal(resolveRouteCompatibility("#inbox").canonicalRoute, "inbox");
assert.equal(resolveRouteCompatibility("#inbox").destination, "Inbox");
assert.equal(resolveRouteCompatibility("#inbox?group=waiting").safeHash, "#inbox?group=waiting");
assert.deepEqual(PRIMARY_SHELL_DESTINATIONS.map((item) => item.label), ["Today", "Social", "Outreach", "Partners", "Files"]);
assert.equal(PRIMARY_SHELL_DESTINATIONS.length, 5);
assert.equal(PRIMARY_SHELL_DESTINATIONS.some((item) => item.label === "Inbox"), false);
assert.equal(SECONDARY_SHELL_CONTROLS.find((item) => item.id === "inbox")?.route, "inbox");
assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);

assert.deepEqual(INBOX_PAGE_GROUPS.map((group) => group.label), ["Needs me", "Waiting", "Updates"]);
assert.deepEqual(INBOX_PAGE_GROUPS.map((group) => group.key), ["needs_me", "waiting", "update"]);
assert.deepEqual(INBOX_PAGE_GROUPS.map((group) => group.routeValue), ["needs-me", "waiting", "updates"]);
assert.equal(allPageItems().selectedGroup, "needs_me");
assert.equal(INBOX_PAGE_LIMITS.default, 30);
assert.equal(INBOX_PAGE_LIMITS.maximum, 40);

assert.deepEqual(requiredCapabilitiesForEndpoint("GET", "/api/ui/inbox"), ["read_internal"]);
assert.equal(canPerformEndpoint("owner", "GET", "/api/ui/inbox").ok, true);
assert.equal(canPerformEndpoint("admin", "GET", "/api/ui/inbox").ok, true);
assert.equal(canPerformEndpoint("operator", "GET", "/api/ui/inbox").ok, true);
assert.equal(canPerformEndpoint("viewer", "GET", "/api/ui/inbox").ok, false);

const state = fixtureState();
const before = structuredClone(state);
const projection = buildInboxView(state, OWNER, NOW);
const page = buildInboxPageView(projection, {});
assert.deepEqual(state, before, "The page service must not mutate source state.");
assert.ok(Object.isFrozen(page) && Object.isFrozen(page.items) && page.items.every(Object.isFrozen));
assert.equal(page.counts.total, projection.counts.total);
assert.equal(page.groups.find((group) => group.key === "needs_me").count, projection.counts.needsMe);
assert.equal(page.groups.find((group) => group.key === "waiting").count, projection.counts.waiting);
assert.equal(page.groups.find((group) => group.key === "update").count, projection.counts.updates);
assert.equal(page.filteredCount, projection.counts.needsMe);
assert.ok(page.items.every((item) => item.summary && item.href.startsWith("#")));
assert.equal(page.items.filter((item) => item.title === "Community post needs two fixes").length, 1, "Explicit and inferred work stays deduplicated.");
assert.ok(page.items.every((item) => !Object.hasOwn(item, "sourceKind") && !Object.hasOwn(item, "sourceId") && !Object.hasOwn(item, "workKind") && !Object.hasOwn(item, "dedupeKey")));
assert.ok(page.items.every((item) => !Object.hasOwn(item, "actionIntents")));

const typeFilter = allPageItems(state, { type:"social" });
assert.ok(typeFilter.items.length > 0 && typeFilter.items.every((item) => item.type.key === "social"));
const priorityFilter = allPageItems(state, { priority:"urgent" });
assert.ok(priorityFilter.items.length > 0 && priorityFilter.items.every((item) => item.priority === "urgent"));
const ownerFilter = allPageItems(state, { owner:"Roger" });
assert.ok(ownerFilter.items.length > 0 && ownerFilter.items.every((item) => item.owner === "Roger"));
const dueFilter = allPageItems(state, { due:"overdue" });
assert.ok(dueFilter.items.length > 0 && dueFilter.items.every((item) => item.dueState === "overdue"));
const combined = allPageItems(state, { type:"task", priority:"high", owner:"Roger", due:"overdue" });
assert.ok(combined.items.every((item) => item.type.key === "task" && item.priority === "high" && item.owner === "Roger" && item.dueState === "overdue"));
assert.deepEqual(combined.counts, page.counts, "Filters must not replace authorized group counts.");
assert.deepEqual(INBOX_PAGE_DUE_CONTRACT.map((item) => item.label), ["Overdue", "Due today", "Upcoming", "No due date"]);
assert.equal(dueStateForInboxItem({ dueAt:"2026-07-15T23:59:59-04:00" }, NOW), "overdue");
assert.equal(dueStateForInboxItem({ dueAt:"2026-07-16T23:59:59-04:00" }, NOW), "today");
assert.equal(dueStateForInboxItem({ dueAt:"2026-07-17T23:59:59-04:00" }, NOW), "upcoming");
assert.equal(dueStateForInboxItem({ dueAt:"" }, NOW), "none");

const paginatedState = fixtureState(65);
const first = allPageItems(paginatedState, { type:"task", limit:25 });
assert.equal(first.items.length, 25);
assert.equal(first.nextCursor, "inbox-25");
assert.equal(first.truncated, true);
const second = allPageItems(paginatedState, { type:"task", limit:25, cursor:first.nextCursor });
assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, first.items.length + second.items.length);
assert.throws(() => allPageItems(state, { cursor:"../../../unsafe" }), /Invalid Inbox cursor/);
assert.throws(() => allPageItems(state, { group:"fourth-group" }), /Invalid Inbox group/);
assert.throws(() => allPageItems(state, { owner:"<script>" }), /Invalid Inbox|owner/i);

const operator = buildAuthorizedInboxPage(state, { id:"operator", role:"operator", label:"Operations", authenticated:true }, NOW, {});
const viewer = buildAuthorizedInboxPage(state, { id:"viewer", role:"viewer", label:"Viewer", authenticated:true, permissions:["read_internal"] }, NOW, {});
const missing = buildAuthorizedInboxPage(state, null, NOW, {});
assert.ok(operator.counts.total < page.counts.total, "Restricted actors must receive only authorized items.");
assert.equal(viewer.counts.total, 0, "Aggregate-only viewers fail closed even with forged permissions.");
assert.equal(missing.counts.total, 0, "Missing actors fail closed.");
assert.doesNotMatch(JSON.stringify(operator), /Confidential acquisition post|page-post-hidden/);
const stateWithoutHidden = structuredClone(state);
stateWithoutHidden.posts = stateWithoutHidden.posts.filter((item) => item.id !== "page-post-hidden");
assert.deepEqual(
  buildAuthorizedInboxPage(stateWithoutHidden, { id:"operator", role:"operator", label:"Operations", authenticated:true }, NOW, {}).counts,
  operator.counts,
  "Hidden records must not affect restricted counts."
);

const loadingHtml = renderInboxPageLoading();
assert.match(loadingHtml, /<h1[^>]*>Inbox<\/h1>/);
assert.equal((loadingHtml.match(/role="tab"/g) || []).length, 3);
assert.match(loadingHtml, /aria-selected="true"/);
assert.match(loadingHtml, /aria-busy="true"/);
assert.doesNotMatch(loadingHtml, /Queue|Triage|Review Desk|Growth Inbox|Automation Inbox|Telemetry|Operator/);

const browserSource = inboxPageBrowserSource();
for (const behavior of [
  "Abort", "vnext:inbox-count", "vnext:session-expired", "vnext:recovery-mode",
  "ArrowLeft", "ArrowRight", "Load more", "No matching items", "You’re caught up",
  "Nothing is waiting", "No recent updates", "Inbox could not load", "additional access"
]) assert.ok(browserSource.includes(behavior.replace("Abort", "requestSequence")), `${behavior} should be represented by the browser contract.`);
assert.match(browserSource, /textContent = item\.title/);
assert.match(browserSource, /open\.href = item\.href/);
assert.match(browserSource, /method:"GET"/);
assert.doesNotMatch(browserSource, /localStorage|sessionStorage|\/api\/state|\/api\/boot-state/);
assert.doesNotMatch(browserSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
assert.doesNotMatch(browserSource, /textContent = "(?:Approve|Complete|Snooze)"/);
assert.doesNotMatch(browserSource, /send|publish|launch|release|provider/i);

const visiblePageCopy = page.items.map((item) => `${item.type.label} ${item.title} ${item.summary} ${item.owner} ${item.availableInSource}`).join("\n");
for (const forbidden of [
  "queueItems", "approvalQueue", "automationSuggestions", "growthInbox", "evidencePackNotes",
  "dataRoomItems", "review_required", "manage_growth", "view_private_assets", "live gates", "telemetry"
]) assert.doesNotMatch(visiblePageCopy, new RegExp(forbidden, "i"));
assert.doesNotMatch(visiblePageCopy, /\b[a-z]+_[a-z_]+\b/);

const pageModuleSource = readFileSync("scripts/ui/pages/inbox-page.mjs", "utf8");
const pageViewSource = readFileSync("scripts/ui/view-models/inbox-page-view.mjs", "utf8");
const serviceSource = readFileSync("scripts/inbox-page-service.mjs", "utf8");
const shellSource = readFileSync("scripts/ui/app-shell.mjs", "utf8");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const packageSource = readFileSync("package.json", "utf8");
assert.match(serviceSource, /buildInboxView/);
assert.match(serviceSource, /buildInboxPageView\(buildInboxView/);
assert.doesNotMatch(pageModuleSource + pageViewSource, /^\s*import[^\n]+(?:storage|database|network|provider|send|publish|preview-server|campaign-command|tasks-engine)/im);
assert.doesNotMatch(pageModuleSource + pageViewSource, /process\.env|readFile|writeFile/);
assert.match(serverSource, /url\.pathname === "\/api\/ui\/inbox"/);
assert.match(serverSource, /buildAuthorizedInboxPage\(currentState, actor, now/);
const endpointStart = serverSource.indexOf('url.pathname === "/api/ui/inbox" && request.method === "GET"');
const endpointEnd = serverSource.indexOf('url.pathname === ROUTE_ACCESS_ENDPOINT', endpointStart);
assert.ok(endpointStart >= 0 && endpointEnd > endpointStart);
assert.doesNotMatch(serverSource.slice(endpointStart, endpointEnd), /writeChangedCollections|serializeStateMutation|\bpublish(?:ing)?\b|\bsendEmail\b|approval\s*=|\bcomplete\w*\(|\bsnooze\w*\(/i);
assert.match(shellSource, /\/api\/ui\/inbox\?group=needs-me&limit=1/);
assert.match(shellSource, /inboxBadgeCount/);
assert.doesNotMatch(shellSource.slice(shellSource.indexOf("async function refreshInboxCount"), shellSource.indexOf("function normalizeNestedMainRegions")), /\/api\/state|queueItems|companyQueue/);
assert.match(packageSource, /"test:vnext-inbox-page"/);

const migrationDirectory = ["supabase/migrations", "migrations"].find(existsSync);
const migrationFiles = migrationDirectory
  ? readdirSync(migrationDirectory, { withFileTypes:true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
  : [];
assert.equal(migrationFiles.some((name) => /inbox/i.test(name) && /201|universal/i.test(name)), false, "No Inbox migration may be introduced.");
assert.doesNotMatch(pageModuleSource + pageViewSource + serviceSource, /state\.(?:inbox|inboxItems|universalInbox)\s*=/);

const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
assert.equal(
  createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex"),
  "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187",
  "Legacy flag-off shell must remain byte-for-byte unchanged."
);

const performanceState = fixtureState(120);
const performanceBefore = structuredClone(performanceState);
const startedAt = performance.now();
const performancePayload = buildAuthorizedInboxPage(performanceState, OWNER, NOW, { limit:30 });
const responseMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
const payloadBytes = Buffer.byteLength(JSON.stringify(performancePayload));
assert.ok(responseMs < 750, `Isolated endpoint computation should remain below 750ms; measured ${responseMs}ms.`);
assert.ok(payloadBytes < 100_000, `Typical compact payload should remain below 100KB; measured ${payloadBytes} bytes.`);
assert.deepEqual(performanceState, performanceBefore);

console.log("INBOX_PAGE_PERFORMANCE", JSON.stringify({
  authorizedProjectedItems:performancePayload.counts.total,
  counts:performancePayload.counts,
  endpointResponseMs:responseMs,
  endpointPayloadBytes:payloadBytes,
  networkRequests:0,
  storageWrites:0,
  sourceMutations:0,
  actionExecutions:0
}));
console.log("PASS test-vnext-inbox-page");

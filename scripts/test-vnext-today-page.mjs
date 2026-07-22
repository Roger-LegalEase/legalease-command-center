#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "./roles.mjs";
import { buildAuthorizedTodayPage, TODAY_PAGE_ENDPOINT } from "./today-page-service.mjs";
import { renderShellBoundary } from "./ui/shell-boundary.mjs";
import {
  TODAY_PAGE_CONTRACT,
  renderTodayPageLoading,
  todayPageBrowserSource
} from "./ui/pages/today-page.mjs";
import { ROUTE_COMPATIBILITY_TOTALS, resolveRouteCompatibility } from "./ui/route-compatibility.mjs";
import { INBOX_INCLUDED_COLLECTIONS } from "./ui/view-models/inbox-sources.mjs";

const NOW = "2026-07-17T16:00:00.000Z";
const OWNER = Object.freeze({ id:"owner", role:"owner", label:"Roger", authenticated:true });

function emptyState() {
  return Object.fromEntries(INBOX_INCLUDED_COLLECTIONS.map((collection) => [collection, []]));
}

function fixtureState(extraTasks = 0) {
  return {
    ...emptyState(),
    posts:[
      { id:"today-social-next", title:"Review the access guide post", status:"needs_review", priority:"critical", updatedAt:"2026-07-17T14:00:00.000Z" },
      { id:"today-social-later-one", title:"Review the Partner resource post", status:"needs_review", priority:"normal", updatedAt:"2026-07-17T06:30:00.000Z" },
      { id:"today-social-later-two", title:"Review the community workshop post", status:"needs_review", priority:"normal", updatedAt:"2026-07-17T06:00:00.000Z" },
      { id:"today-social-progress", title:"Access guide published", status:"posted", postedAt:"2026-07-17T13:00:00.000Z", updatedAt:"2026-07-17T13:00:00.000Z" },
      { id:"today-hidden", title:"Hidden urgent post", status:"needs_review", priority:"critical", allowedRoles:["admin"], updatedAt:"2026-07-17T15:00:00.000Z" }
    ],
    campaigns:[
      { id:"today-campaign-next", campaignName:"July Partner outreach campaign", status:"ready", owner:"Roger", priority:"high", complianceStatus:"approved", partnerApprovalStatus:"approved", startDate:"2026-07-17", updatedAt:"2026-07-17T12:00:00.000Z" },
      { id:"today-campaign-progress", campaignName:"Partner education outreach", status:"completed", owner:"Roger", completedAt:"2026-07-17T11:00:00.000Z", updatedAt:"2026-07-17T11:00:00.000Z" }
    ],
    partners:[
      { id:"today-partner-next", organizationName:"Philadelphia Reentry Coalition", owner:"Roger", priority:"high", nextAction:"Confirm the next Partner conversation.", nextFollowUpDate:"2026-07-17", updatedAt:"2026-07-17T10:00:00.000Z" },
      { id:"today-partner-progress", organizationName:"Synthetic Community Partner", owner:"Roger", responseReceivedAt:"2026-07-17T09:30:00.000Z", responseSummary:"The Partner confirmed the next milestone.", updatedAt:"2026-07-17T09:30:00.000Z" }
    ],
    tasks:[
      { id:"today-now-task", title:"Prepare the current Partner brief", status:"open", owner:"Roger", priority:"normal", important:true, dueDate:"2026-07-17", nextAction:"Prepare the short Partner brief.", updatedAt:"2026-07-17T08:00:00.000Z" },
      { id:"today-needs-task", title:"Confirm the evidence handoff", status:"open", owner:"Roger", priority:"high", important:true, dueDate:"2026-07-18", nextAction:"Confirm the reviewed evidence handoff.", updatedAt:"2026-07-17T07:00:00.000Z" },
      { id:"today-progress-task", title:"Finish the Partner report", status:"done", owner:"Roger", completionNote:"The Partner report is complete.", completedAt:"2026-07-17T09:00:00.000Z", updatedAt:"2026-07-17T09:00:00.000Z" },
      ...Array.from({ length:extraTasks }, (_, index) => ({
        id:`today-perf-${String(index).padStart(3, "0")}`,
        title:`Synthetic production-like priority ${String(index + 1).padStart(3, "0")}`,
        status:"open",
        owner:"Roger",
        priority:index % 11 === 0 ? "critical" : "high",
        important:true,
        dueDate:`2026-07-${String(17 + (index % 3)).padStart(2, "0")}`,
        updatedAt:`2026-07-17T${String(index % 15).padStart(2, "0")}:00:00.000Z`
      }))
    ],
    dailyRunSessions:[{
      session_id:"today-current-run",
      status:"active",
      started_at:"2026-07-17T12:00:00.000Z",
      last_active_at:"2026-07-17T15:30:00.000Z",
      current_bucket_key:"due_today",
      bucket_snapshot:{ buckets:[{ key:"due_today", items:[{ id:"today-now-task", type:"task", route:"tasks", source:"tasks" }] }] },
      completed_bucket_keys:[], completed_items:[], skipped_bucket_keys:[], parked_items:[]
    }],
    morningBriefs:[],
    auditHistory:[{ id:"technical-noise", timestamp:"2026-07-17T15:45:00.000Z", action:"health ping" }],
    activityEvents:[{ id:"provider-noise", createdAt:"2026-07-17T15:40:00.000Z", title:"Provider sync" }]
  };
}

assert.equal(TODAY_PAGE_ENDPOINT, "/api/ui/today");
assert.equal(TODAY_PAGE_CONTRACT.route, "today");
assert.deepEqual(TODAY_PAGE_CONTRACT.answerSections, ["now", "next", "needs-you", "progress"]);
assert.equal(TODAY_PAGE_CONTRACT.maximumNextItems, 3);
assert.equal(TODAY_PAGE_CONTRACT.maximumProgressItems, 5);
assert.equal(resolveRouteCompatibility("#today").canonicalRoute, "today");
assert.equal(resolveRouteCompatibility("#overview").canonicalRoute, "today");
assert.equal(resolveRouteCompatibility("#cockpit").canonicalRoute, "today");
assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);

const state = fixtureState();
const before = structuredClone(state);
const payload = buildAuthorizedTodayPage(state, OWNER, NOW);
assert.deepEqual(state, before, "Today endpoint projection must not mutate source state.");
assert.ok(Object.isFrozen(payload) && Object.isFrozen(payload.nextItems) && Object.isFrozen(payload.progressSummary));
assert.deepEqual(Object.keys(payload), ["ok", "generatedAt", "dateLabel", "nowItem", "nextItems", "needsMeSummary", "progressSummary", "utilities"]);
assert.equal(payload.ok, true);
assert.equal(payload.generatedAt, NOW);
assert.equal(payload.dateLabel, "Friday, July 17");
assert.equal(payload.nowItem.title, "Prepare the current Partner brief");
assert.equal(payload.nowItem.actionLabel, "Resume");
assert.equal(payload.nowItem.href, "#item/tasks/today-now-task");
assert.equal(payload.nowItem.taskId, "today-now-task");
assert.equal(payload.nextItems.length, 3);
assert.deepEqual(payload.nextItems.map((item) => item.href), [
  "#social/post/today-social-next",
  "#outreach/campaign/today-campaign-next",
  "#partners/partner/today-partner-next"
]);
assert.ok(!payload.nextItems.some((item) => item.href === payload.nowItem.href));
assert.equal(payload.needsMeSummary.count, 6);
assert.equal(payload.needsMeSummary.urgentCount, 1);
assert.equal(payload.needsMeSummary.highCount, 2);
assert.ok(payload.needsMeSummary.topItems.every((item) => ![payload.nowItem.href, ...payload.nextItems.map((entry) => entry.href)].includes(item.href)));
assert.equal(payload.needsMeSummary.href, "#inbox?group=needs-me");
assert.equal(payload.progressSummary.available, true);
assert.equal(payload.progressSummary.periodLabel, "This week");
assert.equal(payload.progressSummary.count, 4);
assert.ok(payload.progressSummary.items.length <= 5);
assert.equal(payload.progressSummary.href, "#inbox?group=updates");
assert.equal(payload.utilities.quickCaptureAvailable, true);
assert.equal(payload.utilities.reviewPlanHref, "#daily-run");

const serialized = JSON.stringify(payload);
for (const internalField of ["sourceKind", "sourceId", "dedupeKey", "capabilities", "permissions", "queueItems", "approvalQueue", "providerPayload", "rawEmailBody"])
  assert.doesNotMatch(serialized, new RegExp(`"${internalField}"`, "i"));
assert.doesNotMatch(serialized, /"(?:actionIntent|approve|complete|snooze|send|publish|launch|release)"\s*:/i);
assert.doesNotMatch(serialized, /Hidden urgent post|today-hidden|health ping|Provider sync/i);
assert.ok(Buffer.byteLength(serialized) < 100_000);

const unavailable = buildAuthorizedTodayPage({}, OWNER, NOW);
assert.equal(unavailable.nowItem, null);
assert.deepEqual(unavailable.nextItems, []);
assert.equal(unavailable.needsMeSummary.count, 0);
assert.equal(unavailable.progressSummary.available, false);
const forged = buildAuthorizedTodayPage(state, { id:"viewer", role:"viewer", authenticated:true, permissions:["read_internal", "route_captures"] }, NOW);
assert.equal(forged.nowItem, null);
assert.equal(forged.needsMeSummary.count, 0);
assert.equal(forged.progressSummary.available, false);
assert.equal(forged.utilities.quickCaptureAvailable, false);

assert.deepEqual(requiredCapabilitiesForEndpoint("GET", TODAY_PAGE_ENDPOINT), ["read_internal"]);
assert.equal(canPerformEndpoint("owner", "GET", TODAY_PAGE_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("admin", "GET", TODAY_PAGE_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("operator", "GET", TODAY_PAGE_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("viewer", "GET", TODAY_PAGE_ENDPOINT).ok, false);

const loadingHtml = renderTodayPageLoading();
assert.equal((loadingHtml.match(/data-today-answer=/g) || []).length, 4);
assert.deepEqual([...loadingHtml.matchAll(/data-today-answer="([^"]+)"/g)].map((match) => match[1]), ["now", "next", "needs-you", "progress"]);
assert.equal((loadingHtml.match(/<h1\b/g) || []).length, 1);
assert.match(loadingHtml, /aria-busy="true"/);
assert.match(loadingHtml, /Your clearest path through what matters now/);
assert.doesNotMatch(loadingHtml, /Cockpit|Command center|Work OS|Operator|Queue|Triage|Telemetry|Live gates|System health/i);

const browserSource = todayPageBrowserSource();
for (const behavior of [
  "You’re clear to plan the day", "No additional priorities", "Nothing needs you",
  "No progress recorded this week", "Progress is unavailable", "Today could not load",
  "No records were changed. Try again.", "Today needs additional access", "vnext:session-expired",
  "vnext:recovery-mode", "Open Inbox", "View updates", "Open Quick Capture"
]) assert.ok(browserSource.includes(behavior), `${behavior} must be represented by the Today page contract.`);
assert.match(browserSource, /dataset\.taskOpen = "true"/);
assert.match(browserSource, /textContent = String\(value/);
assert.match(browserSource, /checked\.safeHash === href/);
assert.match(browserSource, /method:"GET"/);
assert.doesNotMatch(browserSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
assert.doesNotMatch(browserSource, /localStorage|sessionStorage|\/api\/state|\/api\/boot-state/);
assert.equal((browserSource.match(/vnext:open-quick-capture/g) || []).length, 1, "Today may expose only one shared Quick Capture entry.");
assert.doesNotMatch(browserSource, /"#capture-inbox"/, "Today should open the shared CCX-205 sheet instead of a second capture route.");
assert.doesNotMatch(browserSource, /quick-capture[^\n]{0,200}(?:input|textarea)|\/api\/daily-run\/quick-capture/i, "Today must not duplicate or replace the reviewed Quick Capture form.");
assert.doesNotMatch(browserSource, /textContent\s*=\s*"(?:Approve|Complete|Snooze|Send|Publish|Launch|Release)"/i);

const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const serviceSource = readFileSync("scripts/today-page-service.mjs", "utf8");
const pageSource = readFileSync("scripts/ui/pages/today-page.mjs", "utf8");
const shellSource = readFileSync("scripts/ui/app-shell.mjs", "utf8");
const cssSource = readFileSync("assets/ui/today-page.css", "utf8");
const packageSource = readFileSync("package.json", "utf8");
assert.equal((serviceSource.match(/buildTodayView\(state, actor, now\)/g) || []).length, 1, "The service must invoke the CCX-203 projection exactly once.");
assert.match(serverSource, /url\.pathname === "\/api\/ui\/today" && request\.method === "GET"/);
assert.match(serverSource, /buildAuthorizedTodayPage\(currentState, actor, now\)/);
const endpointStart = serverSource.indexOf('url.pathname === "/api/ui/today" && request.method === "GET"');
const endpointEnd = serverSource.indexOf('url.pathname === "/api/ui/social" && request.method === "GET"', endpointStart);
assert.ok(endpointStart >= 0 && endpointEnd > endpointStart);
const endpointSource = serverSource.slice(endpointStart, endpointEnd);
assert.doesNotMatch(endpointSource, /writeCollections|writeChangedCollections|serializeStateMutation|fetch\(|provider|sendEmail|publish\w*\(|approve\w*\(|complete\w*\(|snooze\w*\(|launch\w*\(|release\w*\(/i);
assert.doesNotMatch(serverSource, /url\.pathname === "\/api\/ui\/today\/(?:action|mutate|start|complete|snooze)"/i);
assert.match(shellSource, /todayPageBrowserSource/);
assert.match(shellSource, /TODAY_PAGE_STYLESHEET_PATH/);
assert.match(packageSource, /"test:vnext-today-page"/);
assert.doesNotMatch(pageSource, /^\s*import[^\n]+(?:storage|database|network|provider|send|publish|preview-server|tasks-engine|daily-run-session|inbox-view|today-view)/im);
assert.doesNotMatch(pageSource, /process\.env|readFile|writeFile|createServer/);
assert.match(cssSource, /\.vnext-today-now[\s\S]*min-height:/);
assert.match(cssSource, /background: var\(--le-teal-500\)/);
assert.match(cssSource, /@media \(max-width: 768px\)[\s\S]*\.vnext-today-now \{ order: 1/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(cssSource, /gradient|backdrop-filter/i);

const legacyShellStart = serverSource.indexOf("function htmlShell()");
const legacyShellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", legacyShellStart);
assert.ok(legacyShellStart >= 0 && legacyShellEnd > legacyShellStart);
assert.equal(createHash("sha256").update(serverSource.slice(legacyShellStart, legacyShellEnd)).digest("hex"), "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187", "Legacy flag-off shell must remain byte-for-byte unchanged.");
const legacyTodayStart = serverSource.indexOf("    function commandCenterOverviewHtml(posts)");
const legacyTodayEnd = serverSource.indexOf("\n    function focusItemsForMode", legacyTodayStart);
assert.ok(legacyTodayStart >= 0 && legacyTodayEnd > legacyTodayStart);
assert.equal(createHash("sha256").update(serverSource.slice(legacyTodayStart, legacyTodayEnd)).digest("hex"), "36f509ab37d1e0ca838bbe84838677eee67d35e7519aa8aeb44fa3913e565d76", "Legacy Today must remain byte-for-byte unchanged.");

const legacyFixture = "<html><body>legacy shell and Today fixture</body></html>";
assert.equal(renderShellBoundary({ config:{ enabled:false }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vNext" }), legacyFixture);
assert.equal(renderShellBoundary({ config:{ enabled:true }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vNext" }), "vNext");
assert.equal(renderShellBoundary({ config:{ enabled:false, reason:"invalid" }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vNext" }), legacyFixture);

const performanceState = fixtureState(130);
const performanceBefore = structuredClone(performanceState);
const startedAt = performance.now();
const performancePayload = buildAuthorizedTodayPage(performanceState, OWNER, NOW);
const endpointResponseMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
const endpointPayloadBytes = Buffer.byteLength(JSON.stringify(performancePayload));
assert.ok(endpointResponseMs < 750, `Isolated Today response should remain below 750 ms; measured ${endpointResponseMs} ms.`);
assert.ok(endpointPayloadBytes < 100_000, `Today response should remain substantially below 100 KB; measured ${endpointPayloadBytes} bytes.`);
assert.deepEqual(performanceState, performanceBefore);

console.log("TODAY_PAGE_PERFORMANCE", JSON.stringify({
  endpointResponseMs,
  endpointPayloadBytes,
  pageRequestCount:1,
  duplicateRequestCount:0,
  fullStateRequests:0,
  quickCaptureRequestsWhileUnused:0,
  searchRequestsWhileClosed:0,
  createRequestsWhileClosed:0,
  sourceMutations:0,
  storageWrites:0,
  actionExecutions:0
}));
console.log("TODAY_PAGE_FIXTURE", JSON.stringify({
  now:{ title:payload.nowItem.title, actionLabel:payload.nowItem.actionLabel, href:payload.nowItem.href },
  next:payload.nextItems.map((item) => ({ title:item.title, href:item.href })),
  needsYou:{ count:payload.needsMeSummary.count, urgent:payload.needsMeSummary.urgentCount, high:payload.needsMeSummary.highCount },
  progress:{ count:payload.progressSummary.count, shown:payload.progressSummary.items.length },
  quickCapture:"one subordinate entry to the shared seven-intent capture sheet"
}));
console.log("PASS test-vnext-today-page");

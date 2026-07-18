#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SOCIAL_HOME_ENDPOINT,
  SOCIAL_HOME_LIMITS,
  SOCIAL_HOME_VIEWS,
  SocialHomeValidationError,
  buildAuthorizedSocialHome
} from "./social-home-service.mjs";
import { GLOBAL_CREATE_ENDPOINTS } from "./global-create-service.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "./roles.mjs";

const NOW = "2026-07-18T15:00:00.000Z";
const actor = Object.freeze({ id:"social-test-owner", role:"owner", authenticated:true });
const admin = Object.freeze({ id:"social-test-admin", role:"admin", authenticated:true });
const operator = Object.freeze({ id:"social-test-operator", role:"operator", authenticated:true });
const viewer = Object.freeze({ id:"social-test-viewer", role:"viewer", authenticated:true });

function post(id, status, extra = {}) {
  return {
    id,
    title:`Social ${id}`,
    hook:`Truthful summary for ${id}`,
    body:`Stored Post copy for ${id}.`,
    status,
    targetChannels:["linkedin"],
    channelVariants:{ linkedin:{ body:`LinkedIn copy for ${id}.` } },
    imageIntentionallyOmitted:true,
    guidelinesGate:{ passed:true, hardFails:[] },
    approvalRequired:false,
    scheduledFor:"",
    topic:"Access guide",
    owner:"Roger",
    createdAt:"2026-07-10T12:00:00.000Z",
    updatedAt:"2026-07-17T12:00:00.000Z",
    ...extra
  };
}

const paginatedDrafts = Array.from({ length:30 }, (_, index) => post(`page-${String(index).padStart(2, "0")}`, "draft", {
  title:`Paginated draft ${String(index + 1).padStart(2, "0")}`,
  updatedAt:`2026-07-${String(16 - (index % 6)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`
}));

const state = {
  posts:[
    post("idea", "idea", { body:"", contentBankIdeaId:"converted-source" }),
    post("draft", "draft"),
    post("review", "needs_review", { approvalRequired:true, approvalStatus:"needs_review" }),
    post("scheduled-boundary", "scheduled", { title:"Timezone boundary Post", scheduledFor:"2026-07-21T00:30:00.000Z", timezone:"America/New_York" }),
    post("scheduled-local", "scheduled", { scheduledFor:"2026-07-20T14:00:00", timezone:"America/New_York" }),
    post("scheduled-missing-timezone", "scheduled", { scheduledFor:"2026-07-22T16:00:00.000Z" }),
    post("scheduled-invalid-timezone", "scheduled", { scheduledFor:"2026-07-23T16:00:00.000Z", timezone:"Not/A_Zone" }),
    post("scheduled-date-only", "scheduled", { scheduledFor:"2026-07-24", timezone:"America/New_York" }),
    post("scheduled-dst-gap", "scheduled", { scheduledFor:"2026-03-08T02:30:00", timezone:"America/New_York" }),
    post("scheduled-dst-fold", "scheduled", { scheduledFor:"2026-11-01T01:30:00", timezone:"America/New_York" }),
    post("published", "published", { publishedAt:"2026-07-16T15:00:00.000Z", publishedUrl:"https://example.com/social/published", performance:{ impressions:1200, likes:44, comments:7, clicks:15 } }),
    post("published-unavailable", "published", { publishedAt:"2026-07-15T15:00:00.000Z", publishedUrl:"https://example.com/social/published-unavailable" }),
    post("hidden", "draft", { visibility:"owner_only", allowedRoles:["admin"] }),
    ...paginatedDrafts
  ],
  contentBank:[
    { id:"converted-source", title:"Converted source must not duplicate", status:"idea", updatedAt:"2026-07-17T09:00:00.000Z" },
    { id:"unconverted-source", title:"Truthful unconverted idea", summary:"A stored Content Bank idea.", topic:"Community", owner:"Roger", updatedAt:"2026-07-17T10:00:00.000Z" },
    { id:"hidden-source", title:"Restricted source", visibility:"owner_only", allowedRoles:["admin"] }
  ],
  postImages:[],
  brandAssets:[],
  postingKits:[],
  socialAccounts:[{ id:"linkedin-test", channel:"linkedin", connected:true, connectedAt:"2026-07-01T00:00:00.000Z", accountName:"Synthetic" }],
  approvals:[], approvalQueue:[], queueItems:[], publishEvents:[], activityEvents:[], auditHistory:[], generationBatches:[],
  runtime:{ livePostingGates:{ linkedin:false } },
  settings:{ sourceItems:[] }
};

const before = JSON.stringify(state);
const ideas = buildAuthorizedSocialHome(state, actor, NOW, { view:"ideas", limit:40 });
assert.equal(SOCIAL_HOME_ENDPOINT, "/api/ui/social");
assert.deepEqual(SOCIAL_HOME_VIEWS.map((view) => view.label), ["Ideas", "Calendar", "Library", "Results"]);
assert.equal(ideas.selectedView, "ideas");
assert.equal(ideas.generatedAt, NOW);
assert.equal(ideas.capabilities.createsPost, true);
assert.equal(ideas.capabilities.createPostReason, null);
assert.equal(ideas.capabilities.mutatesSource, false);
assert.equal(ideas.capabilities.schedules, false);
assert.equal(ideas.capabilities.approves, false);
assert.equal(ideas.capabilities.publishes, false);
assert.ok(ideas.items.some((item) => item.stableKey === "contentBank:unconverted-source"));
assert.equal(ideas.items.some((item) => item.stableKey === "contentBank:converted-source"), false);
assert.equal(ideas.items.some((item) => item.id === "hidden" || item.id === "hidden-source"), false);
assert.equal(new Set(ideas.items.map((item) => item.stableKey)).size, ideas.items.length);
assert.ok(ideas.items.filter((item) => item.kind === "post").every((item) => item.href === `#social/post/${item.id}`));
assert.ok(ideas.items.filter((item) => item.kind === "post").every((item) => item.readiness.available && item.readiness.state));
assert.ok(ideas.items.filter((item) => item.kind === "post").every((item) => item.channels.selectedChannels[0]?.label === "LinkedIn"));

const calendar = buildAuthorizedSocialHome(state, actor, NOW, { view:"calendar", limit:40 });
assert.ok(calendar.items.some((item) => item.schedule.scheduled));
assert.ok(calendar.items.some((item) => !item.schedule.scheduled));
assert.equal(calendar.views.map((view) => view.key).join(","), "ideas,calendar,library,results");
assert.equal(calendar.calendarGroups.scheduled, 7);
assert.equal(calendar.calendarGroups.unscheduled, calendar.views.find((view) => view.key === "calendar").count - 7);
const firstUnscheduled = calendar.items.findIndex((item) => !item.schedule.scheduled);
assert.ok(firstUnscheduled > 0 && calendar.items.slice(0, firstUnscheduled).every((item) => item.schedule.scheduled));
assert.ok(calendar.items.slice(firstUnscheduled).every((item) => !item.schedule.scheduled));

const boundary = calendar.items.find((item) => item.id === "scheduled-boundary");
assert.equal(boundary.schedule.calendarDate, "2026-07-20");
assert.match(boundary.schedule.display, /^Jul 20, 2026, 8:30 PM (?:ET|EDT)$/);
assert.equal(boundary.schedule.timezone, "America/New_York");
assert.equal(boundary.schedule.timingState, "resolved");
assert.equal(calendar.items.find((item) => item.id === "scheduled-local").schedule.resolvedAt, "2026-07-20T18:00:00.000Z");
assert.match(calendar.items.find((item) => item.id === "scheduled-missing-timezone").schedule.display, /Timezone unavailable$/);
assert.equal(calendar.items.find((item) => item.id === "scheduled-invalid-timezone").schedule.timezoneState, "invalid");
assert.match(calendar.items.find((item) => item.id === "scheduled-invalid-timezone").schedule.display, /Timezone unavailable$/);
assert.deepEqual(
  { date:calendar.items.find((item) => item.id === "scheduled-date-only").schedule.calendarDate, kind:calendar.items.find((item) => item.id === "scheduled-date-only").schedule.kind },
  { date:"2026-07-24", kind:"date_only" }
);
assert.equal(calendar.items.find((item) => item.id === "scheduled-dst-gap").schedule.timingState, "nonexistent");
assert.match(calendar.items.find((item) => item.id === "scheduled-dst-gap").schedule.display, /does not exist/);
assert.equal(calendar.items.find((item) => item.id === "scheduled-dst-fold").schedule.timingState, "ambiguous");
assert.match(calendar.items.find((item) => item.id === "scheduled-dst-fold").schedule.display, /ambiguous/);

const july20 = buildAuthorizedSocialHome(state, actor, NOW, { view:"calendar", dateFrom:"2026-07-20", dateTo:"2026-07-20", limit:40 });
const july21 = buildAuthorizedSocialHome(state, actor, NOW, { view:"calendar", dateFrom:"2026-07-21", dateTo:"2026-07-21", limit:40 });
assert.ok(july20.items.some((item) => item.id === "scheduled-boundary"));
assert.equal(july21.items.some((item) => item.id === "scheduled-boundary"), false);

const calendarPageOne = buildAuthorizedSocialHome(state, actor, NOW, { view:"calendar", limit:8 });
const calendarPageTwo = buildAuthorizedSocialHome(state, actor, NOW, { view:"calendar", limit:8, cursor:calendarPageOne.nextCursor });
assert.equal(calendarPageOne.items.filter((item) => item.schedule.scheduled).length, 7);
assert.equal(calendarPageOne.items.filter((item) => !item.schedule.scheduled).length, 1);
assert.equal(new Set([...calendarPageOne.items, ...calendarPageTwo.items].map((item) => item.stableKey)).size, calendarPageOne.items.length + calendarPageTwo.items.length);

const library = buildAuthorizedSocialHome(state, actor, NOW, { view:"library", limit:40 });
assert.deepEqual([...new Set(library.items.map((item) => item.status.key))].sort(), ["draft", "needs_review", "published", "scheduled"]);
assert.equal(library.items.some((item) => item.kind !== "post"), false);

const results = buildAuthorizedSocialHome(state, actor, NOW, { view:"results", limit:40 });
assert.equal(results.items.length, 2);
assert.ok(results.items.every((item) => item.status.key === "published" && item.result.available));
assert.equal(results.items.find((item) => item.id === "published")?.result.metrics.impressions, 1200);
assert.equal(results.items.find((item) => item.id === "published-unavailable")?.result.metrics.impressions, null);

const pageOne = buildAuthorizedSocialHome(state, actor, NOW, { view:"ideas", limit:24 });
const pageTwo = buildAuthorizedSocialHome(state, actor, NOW, { view:"ideas", limit:24, cursor:pageOne.nextCursor });
assert.equal(pageOne.items.length, SOCIAL_HOME_LIMITS.default);
assert.equal(pageOne.truncated, true);
assert.ok(pageOne.nextCursor);
assert.equal(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.stableKey)).size, pageOne.items.length + pageTwo.items.length);
assert.equal(pageTwo.nextCursor, null);

const filtered = buildAuthorizedSocialHome(state, actor, NOW, { view:"ideas", topic:"access guide", channel:"linkedin", status:"draft", limit:40 });
assert.ok(filtered.items.length > 0);
assert.ok(filtered.items.every((item) => item.topic === "Access guide" && item.status.key === "draft"));
assert.deepEqual(filtered.activeFilters, { status:"draft", channel:"linkedin", topic:"access guide", owner:"", dateFrom:"", dateTo:"" });

const unavailable = buildAuthorizedSocialHome({ contentBank:state.contentBank }, actor, NOW, { view:"ideas" });
assert.equal(unavailable.sourceAvailability.posts, false);
assert.ok(unavailable.items.some((item) => item.kind === "source_idea"));

const adminHome = buildAuthorizedSocialHome(state, admin, NOW, { view:"ideas", limit:40 });
const restricted = buildAuthorizedSocialHome(state, operator, NOW, { view:"ideas", limit:40 });
const viewerHome = buildAuthorizedSocialHome(state, viewer, NOW, { view:"ideas", limit:40 });
assert.equal(adminHome.capabilities.createsPost, true);
assert.equal(adminHome.capabilities.createPostReason, null);
assert.equal(restricted.capabilities.createsPost, false);
assert.equal(viewerHome.capabilities.createsPost, false);
assert.equal(restricted.capabilities.createPostReason, "This account can view Social but cannot create Posts.");
assert.equal(viewerHome.capabilities.createPostReason, "This account can view Social but cannot create Posts.");
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.post), ["manage_content_drafts"]);
assert.equal(canPerformEndpoint("owner", "POST", GLOBAL_CREATE_ENDPOINTS.post).ok, true);
assert.equal(canPerformEndpoint("admin", "POST", GLOBAL_CREATE_ENDPOINTS.post).ok, true);
assert.equal(canPerformEndpoint("operator", "POST", GLOBAL_CREATE_ENDPOINTS.post).ok, false);
assert.equal(canPerformEndpoint("viewer", "POST", GLOBAL_CREATE_ENDPOINTS.post).ok, false);
assert.equal(restricted.items.some((item) => item.id === "hidden" || item.id === "hidden-source"), false);
assert.ok(Object.isFrozen(restricted) && Object.isFrozen(restricted.items));
assert.equal(JSON.stringify(state), before, "Social projection must not mutate state.");

assert.throws(() => buildAuthorizedSocialHome(state, actor, NOW, { view:"composer" }), SocialHomeValidationError);
assert.throws(() => buildAuthorizedSocialHome(state, actor, NOW, { cursor:"bad" }), SocialHomeValidationError);
assert.throws(() => buildAuthorizedSocialHome(state, actor, NOW, { dateFrom:"2026-07-20", dateTo:"2026-07-10" }), SocialHomeValidationError);

const [server, shell, page, styles, roles, packageJson] = await Promise.all([
  readFile(new URL("./preview-server.mjs", import.meta.url), "utf8"),
  readFile(new URL("./ui/app-shell.mjs", import.meta.url), "utf8"),
  readFile(new URL("./ui/pages/social-home.mjs", import.meta.url), "utf8"),
  readFile(new URL("../assets/ui/social-home.css", import.meta.url), "utf8"),
  readFile(new URL("./roles.mjs", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8")
]);
assert.match(server, /buildAuthorizedSocialHome/);
assert.match(server, /url\.pathname === "\/api\/ui\/social"/);
assert.match(shell, /socialHomeBrowserSource/);
assert.match(shell, /compactSocialRoute/);
assert.match(page, /openWorkflow\("social-post"/);
assert.match(page, /fetch\(contract\.endpoint/);
assert.match(page, /capabilities\?\.createsPost === true/);
assert.doesNotMatch(page, /new Date\([^)]*scheduledAt[^)]*\)\.toLocaleString/);
assert.doesNotMatch(page, /manage_content_drafts/);
assert.doesNotMatch(page, /fetch\(["'`]\/api\/(?:state|publishing|approval)|schedulePost|approvePost|regeneratePost/i);
assert.match(styles, /focus-visible/);
assert.match(styles, /max-width:430px/);
assert.match(styles, /background:var\(--le-orange-600,#F04800\)/);
assert.match(styles, /border[^;]*var\(--le-orange-700,#D84100\)/);
assert.match(styles, /color:var\(--le-navy-950,#071E33\)/);
assert.match(roles, /path === "\/api\/ui\/social"/);
assert.equal(JSON.parse(packageJson).scripts["test:vnext-social-home"], "node scripts/test-vnext-social-home.mjs");

console.log("PASS test-vnext-social-home");
console.log(JSON.stringify({ views:ideas.views.map((view) => ({ key:view.key, count:view.count })), createAvailability:{ owner:true, admin:true, operator:false, viewer:false }, calendarGroups:calendar.calendarGroups, firstPage:pageOne.items.length, secondPage:pageTwo.items.length, serious:0, critical:0, mutations:0 }));

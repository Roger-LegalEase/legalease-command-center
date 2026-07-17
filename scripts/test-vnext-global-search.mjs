import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildGlobalSearchIndex,
  GLOBAL_SEARCH_ENDPOINT,
  GLOBAL_SEARCH_GROUPS,
  GLOBAL_SEARCH_LIMITS,
  GLOBAL_SEARCH_SOURCE_MAPPINGS,
  searchGlobalRecords,
  validateGlobalSearchQuery
} from "./global-search-service.mjs";
import {
  GLOBAL_SEARCH_CONTRACT,
  globalSearchBrowserSource,
  renderGlobalSearchDialog,
  renderGlobalSearchTrigger
} from "./ui/global-search.mjs";
import {
  resolveRouteCompatibility,
  ROUTE_COMPATIBILITY_TOTALS
} from "./ui/route-compatibility.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "./roles.mjs";
import { renderShellBoundary } from "./ui/shell-boundary.mjs";

const exactGroups = ["Posts", "Campaigns", "Partners", "Files", "Tasks", "Reports"];
assert.deepEqual(GLOBAL_SEARCH_GROUPS.map((group) => group.label), exactGroups);
assert.deepEqual(GLOBAL_SEARCH_CONTRACT.groups.map((group) => group.label), exactGroups);
assert.equal(GLOBAL_SEARCH_CONTRACT.endpoint, GLOBAL_SEARCH_ENDPOINT);
assert.equal(GLOBAL_SEARCH_CONTRACT.debounceMs, 200);
assert.equal(GLOBAL_SEARCH_LIMITS.queryLength, 160);
assert.equal(GLOBAL_SEARCH_LIMITS.defaultResults, 36);
assert.equal(GLOBAL_SEARCH_LIMITS.maximumResults, 60);
assert.equal(GLOBAL_SEARCH_LIMITS.recentRecords, 8);

const triggerHtml = renderGlobalSearchTrigger();
const dialogHtml = renderGlobalSearchDialog();
assert.match(triggerHtml, />Search</);
assert.match(triggerHtml, /aria-haspopup="dialog"/);
assert.match(triggerHtml, /aria-expanded="false"/);
assert.match(triggerHtml, /aria-controls="vnext-global-search-dialog"/);
assert.match(dialogHtml, /role="dialog"/);
assert.match(dialogHtml, /aria-modal="true"/);
assert.match(dialogHtml, /role="combobox"/);
assert.match(dialogHtml, /role="listbox"/);
assert.match(dialogHtml, /aria-live="polite"/);
let priorFilter = -1;
for (const label of exactGroups) {
  const index = dialogHtml.indexOf(`>${label}</span>`);
  assert(index > priorFilter, `${label} should be in the approved group order.`);
  priorFilter = index;
}
assert.doesNotMatch(dialogHtml, /Operator Search|captureInbox|dataRoomItems|evidencePackNotes|partnerPrograms|auditHistory/);

const state = {
  posts:[
    { id:"post-launch", title:"Launch update", hook:"Café résumé launch", body:"Draft body", status:"draft", updatedAt:"2026-07-16T12:00:00.000Z" },
    { id:"post-hidden", title:"Hidden launch plan", status:"draft", visibility:"owner_only", updatedAt:"2026-07-17T12:00:00.000Z" },
    { id:"post-launch", title:"Duplicate launch update", status:"draft", updatedAt:"2026-07-18T12:00:00.000Z" }
  ],
  campaigns:[
    { id:"campaign-launch", name:"Launch outreach", campaignType:"announcement", goal:"Launch safely", status:"draft", updatedAt:"2026-07-15T12:00:00.000Z" }
  ],
  partners:[
    { id:"partner-launch", organizationName:"Launch Community", primaryContactName:"Example Person", primaryContactEmail:"private@example.com", geography:"Québec", nextAction:"Plan launch", stage:"new", updatedAt:"2026-07-14T12:00:00.000Z" }
  ],
  dataRoomItems:[
    { id:"file-launch", name:"Launch readiness", section:"Company overview", notes:"Launch source", status:"draft", updatedAt:"2026-07-13T12:00:00.000Z" }
  ],
  evidencePackNotes:[
    { id:"evidence-launch", title:"Launch evidence note", notes:"Launch proof", status:"current", updatedAt:"2026-07-12T12:00:00.000Z" }
  ],
  soc2Evidence:[
    { id:"soc2-launch", evidenceTitle:"Launch control evidence", controlArea:"Access", notes:"Launch audit", status:"current", updatedAt:"2026-07-11T12:00:00.000Z" }
  ],
  soc2Policies:[
    { id:"policy-launch", policyName:"Launch security policy", summary:"Launch controls", status:"current", lastReviewedDate:"2026-07-10" }
  ],
  brandAssets:[
    { id:"brand-launch", name:"Launch logo", assetType:"Logo", tags:["launch"], approved:true, updatedAt:"2026-07-09T12:00:00.000Z" }
  ],
  tasks:[
    { id:"task-launch", title:"Launch checklist", description:"Finish launch checks", priority:"high", status:"open", updatedAt:"2026-07-08T12:00:00.000Z" }
  ],
  reports:[
    { id:"report-launch", reportTitle:"Launch results", summary:"Launch reporting period", reportingPeriod:"Q3", status:"current", generatedAt:"2026-07-07T12:00:00.000Z" }
  ]
};

const ownerIndex = buildGlobalSearchIndex(state, { role:"owner" });
const operatorIndex = buildGlobalSearchIndex(state, { role:"operator" });
assert.equal(ownerIndex.filter((item) => item.canonicalHref === "#social/post/post-launch").length, 1, "duplicate source records should collapse to one exact result");
assert.equal(ownerIndex.some((item) => item.id === "post-hidden"), true);
assert.equal(operatorIndex.some((item) => item.id === "post-hidden"), false);
assert.equal(operatorIndex.some((item) => item.searchText.includes("private@example.com")), false);
assert(Object.isFrozen(ownerIndex) && ownerIndex.every(Object.isFrozen));

const grouped = searchGlobalRecords(state, "launch", { role:"owner" });
assert.equal("query" in grouped, false, "The endpoint response should not echo raw search text.");
assert.deepEqual(grouped.groups.map((group) => group.label), exactGroups);
assert(grouped.groups.every((group) => group.results.length > 0), "empty group headings must be omitted");
assert.equal(grouped.groups.find((group) => group.label === "Reports").results.length, 1);
assert.equal(grouped.groups.find((group) => group.label === "Files").results.some((item) => item.id === "report-launch"), false);

const byId = Object.fromEntries(grouped.groups.flatMap((group) => group.results.map((item) => [item.id, item])));
assert.equal(byId["post-launch"].canonicalHref, "#social/post/post-launch");
assert.equal(byId["campaign-launch"].canonicalHref, "#outreach/campaign/campaign-launch");
assert.equal(byId["partner-launch"].canonicalHref, "#partners/partner/partner-launch");
assert.equal(byId["file-launch"].canonicalHref, "#files/data-room-item/file-launch");
assert.equal(byId["evidence-launch"].canonicalHref, "#files/evidence-note/evidence-launch");
assert.equal(byId["soc2-launch"].canonicalHref, "#files/soc2-evidence/soc2-launch");
assert.equal(byId["policy-launch"].canonicalHref, "#files/soc2-policy/policy-launch");
assert.equal(byId["brand-launch"].canonicalHref, "#files/brand-asset/brand-launch");
assert.equal(byId["task-launch"].canonicalHref, "#item/tasks/task-launch");
assert.equal(byId["report-launch"].canonicalHref, "#files/report/report-launch");
assert.equal(byId["task-launch"].destination, "Inbox");
assert.equal(byId["report-launch"].destination, "Files");
assert.deepEqual(Object.keys(byId["post-launch"]), ["id", "objectType", "title", "context", "status", "updatedAt", "canonicalHref", "destination", "sourceKind"]);
assert.doesNotMatch(JSON.stringify(grouped), /safe_actions|safeActions|fullState|primaryContactEmail|private@example\.com|provider|token|secret/i);

assert.equal(searchGlobalRecords(state, "POST-LAUNCH", { role:"owner" }).groups[0].results[0].id, "post-launch", "exact stable ID should rank first case-insensitively");
assert.equal(searchGlobalRecords(state, "launch update", { role:"owner" }).groups[0].results[0].id, "post-launch", "exact title should rank first");
assert.equal(searchGlobalRecords(state, "LAUNCH OUT", { role:"owner" }).groups[0].results[0].id, "campaign-launch", "title prefix matching should be case-insensitive");
assert.equal(searchGlobalRecords(state, "résumé", { role:"owner" }).groups[0].results[0].id, "post-launch", "Unicode search should remain meaningful");
assert.equal(searchGlobalRecords(state, "québec", { role:"owner" }).groups[0].results[0].id, "partner-launch");

const onlyTasks = searchGlobalRecords(state, "launch", { role:"owner", types:["tasks"] });
assert.deepEqual(onlyTasks.groups.map((group) => group.label), ["Tasks"]);
assert.deepEqual(searchGlobalRecords(state, "launch", { role:"owner", types:["none"] }).groups, []);
assert.deepEqual(searchGlobalRecords(state, "not-present", { role:"owner" }).groups, []);

const limited = searchGlobalRecords(state, "launch", { role:"owner", limit:2 });
assert.equal(limited.returned, 2);
assert.equal(limited.truncated, true);
assert.equal(limited.nextCursor, "2");
const nextPage = searchGlobalRecords(state, "launch", { role:"owner", limit:2, cursor:limited.nextCursor });
assert.equal(nextPage.returned, 2);
assert.notEqual(nextPage.groups.flatMap((group) => group.results)[0].canonicalHref, limited.groups.flatMap((group) => group.results)[0].canonicalHref);
assert.throws(() => searchGlobalRecords(state, "launch", { role:"owner", limit:61 }), /between 1 and 60/);
assert.throws(() => searchGlobalRecords(state, "launch", { role:"owner", cursor:"bad" }), /cursor is invalid/);
assert.throws(() => validateGlobalSearchQuery("x".repeat(161)), /too long/);
assert.throws(() => validateGlobalSearchQuery("unsafe\u0000query"), /unsupported/);
assert.throws(() => validateGlobalSearchQuery("<script>alert(1)</script>"), /unsupported/);
assert.equal(validateGlobalSearchQuery("  Café — résumé!  "), "Café — résumé!");

const restricted = searchGlobalRecords(state, "post-hidden", { role:"operator" });
assert.equal(restricted.total, 0);
assert.deepEqual(restricted.groups, []);
const ownerHidden = searchGlobalRecords(state, "post-hidden", { role:"owner" });
assert.equal(ownerHidden.total, 1);
assert.equal(ownerHidden.groups[0].results[0].id, "post-hidden");

const recent = searchGlobalRecords(state, "", {
  role:"operator",
  recentHrefs:["#social/post/post-hidden", "#item/tasks/task-launch", "#files/report/report-launch", "#item/tasks/task-launch"]
});
assert.deepEqual(recent.recentResults.map((item) => item.id), ["task-launch", "report-launch"]);
assert.equal(searchGlobalRecords(state, "", { role:"operator" }).returned, 0, "empty query must not dump the index");

assert.deepEqual(requiredCapabilitiesForEndpoint("GET", GLOBAL_SEARCH_ENDPOINT), ["read_internal"]);
assert.equal(canPerformEndpoint("owner", "GET", GLOBAL_SEARCH_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("admin", "GET", GLOBAL_SEARCH_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("operator", "GET", GLOBAL_SEARCH_ENDPOINT).ok, true);
assert.equal(canPerformEndpoint("viewer", "GET", GLOBAL_SEARCH_ENDPOINT).ok, false);

assert.deepEqual(Object.fromEntries(Object.entries(GLOBAL_SEARCH_SOURCE_MAPPINGS).map(([collection, mapping]) => [collection, mapping.link])), {
  posts:"#social/post/<id>",
  campaigns:"#outreach/campaign/<id>",
  partners:"#partners/partner/<id>",
  dataRoomItems:"#files/data-room-item/<id>",
  evidencePackNotes:"#files/evidence-note/<id>",
  soc2Evidence:"#files/soc2-evidence/<id>",
  soc2Policies:"#files/soc2-policy/<id>",
  brandAssets:"#files/brand-asset/<id>",
  tasks:"#item/tasks/<id>",
  reports:"#files/report/<id>"
});

assert.equal(resolveRouteCompatibility("#search").kind, "page");
assert.equal(resolveRouteCompatibility("#search").canonicalRoute, "search");
assert.equal(resolveRouteCompatibility("#search").destination, "Search");
assert.equal(resolveRouteCompatibility("#operator-search").canonicalRoute, "operator-search");
assert.equal(resolveRouteCompatibility("#operator-search").destination, "Search");
assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);

const browserSource = globalSearchBrowserSource();
for (const behavior of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape", "aria-activedescendant", "AbortController", "ignoredStaleResponses", "duplicateRequests", "vnext:close-navigation", "vnext:request-close-global-create"]) {
  assert(browserSource.includes(behavior), `${behavior} should be part of the shared Search interaction contract.`);
}
assert.match(browserSource, /textContent = result\.title/);
assert.match(browserSource, /recentRecords = \[result/);
assert.match(browserSource, /recentRecords\.map/);
assert.doesNotMatch(browserSource, /localStorage|sessionStorage/);
assert.doesNotMatch(browserSource, /innerHTML\s*=/);
assert.doesNotMatch(browserSource, /\/api\/state|\/api\/boot-state/);

const uiSource = await readFile(new URL("./ui/global-search.mjs", import.meta.url), "utf8");
const viewModelSource = await readFile(new URL("./ui/global-search-view-model.mjs", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("./global-search-service.mjs", import.meta.url), "utf8");
const operatorSource = await readFile(new URL("./operator-search.mjs", import.meta.url), "utf8");
const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const shellSource = await readFile(new URL("./ui/app-shell.mjs", import.meta.url), "utf8");

assert.doesNotMatch(uiSource + viewModelSource, /from ["'][^"']*(?:storage|database|network|send|publish|engine|preview-server|global-search-service)/i);
assert.doesNotMatch(uiSource + viewModelSource, /process\.env|readFile|writeFile/);
assert.doesNotMatch(serviceSource, /send_email|publish_page|post_content|safe_actions|runOperatorSearchAction|writeState|writeChangedCollections/);
assert.match(operatorSource, /search-index-helpers\.mjs/);
assert.match(serviceSource, /search-index-helpers\.mjs/);
assert.match(serverSource, /url\.pathname === "\/api\/ui\/search"/);
assert.match(serverSource, /searchGlobalRecords\(currentState/);
assert.match(serverSource, /role:actor\?\.role \|\| "viewer"/);
assert.doesNotMatch(serverSource.slice(serverSource.indexOf('url.pathname === "/api/ui/search" && request.method === "GET"'), serverSource.indexOf('url.pathname === "/api/ui/inbox" && request.method === "GET"')), /writeChangedCollections|serializeStateMutation|withPublicChannelSetup|publish|approval|mutation/i);
assert.equal((shellSource.match(/id="vnext-global-search-trigger"/g) || []).length, 0, "The shared trigger is rendered from one pure module rather than duplicated shell markup.");
assert.match(shellSource, /renderGlobalSearchTrigger/);
assert.match(shellSource, /globalSearchBrowserSource/);
assert.match(shellSource, /isGlobalSearchRoute/);

const legacyFixture = "<html>legacy flag-off shell fixture</html>";
assert.equal(renderShellBoundary({ config:{ enabled:false }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vnext" }), legacyFixture);
assert.equal(renderShellBoundary({ config:{ enabled:true }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vnext" }), "vnext");
assert.match(serverSource, /readCommandCenterVNextConfig\(process\.env\)/);
assert.doesNotMatch(serverSource, /COMMAND_CENTER_UX_VNEXT[^\n]*(?:url|cookie|localStorage|sessionStorage)/i);

console.log("PASS test-vnext-global-search");

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  buildQuickCaptureCapabilities,
  createQuickCapture,
  QUICK_CAPTURE_BODY_LIMIT,
  QUICK_CAPTURE_CAPABILITIES_ENDPOINT,
  QUICK_CAPTURE_ENDPOINT,
  QUICK_CAPTURE_INTENTS,
  quickCaptureAuthority
} from "./quick-capture-service.mjs";
import {
  QUICK_CAPTURE_INTENT_OPTIONS,
  QUICK_CAPTURE_UI_CONTRACT,
  quickCaptureBrowserSource,
  renderQuickCaptureForm
} from "./ui/quick-capture.mjs";
import { routeRegistry } from "./ui/navigation.mjs";
import { ROUTE_COMPATIBILITY_TOTALS } from "./ui/route-compatibility.mjs";
import { renderShellBoundary } from "./ui/shell-boundary.mjs";

const expectedIntents = ["Task", "Decision", "Blocker", "Post idea", "Partner note", "Campaign idea", "File/report note"];
const expectedDestinations = ["Tasks", "Capture Inbox", "Capture Inbox", "Social", "Capture Inbox", "Outreach", "Files"];
assert.deepEqual(QUICK_CAPTURE_INTENTS.map((item) => item.label), expectedIntents);
assert.deepEqual(QUICK_CAPTURE_INTENTS.map((item) => item.destination), expectedDestinations);
assert.deepEqual(QUICK_CAPTURE_INTENT_OPTIONS.map((item) => item.label), expectedIntents);
assert.equal(QUICK_CAPTURE_UI_CONTRACT.exactIntentCount, 7);
assert.equal(QUICK_CAPTURE_UI_CONTRACT.submitLabel, "Save");
assert.equal(QUICK_CAPTURE_ENDPOINT, "/api/ui/quick-capture");
assert.equal(QUICK_CAPTURE_CAPABILITIES_ENDPOINT, "/api/ui/quick-capture/capabilities");
assert.equal(QUICK_CAPTURE_BODY_LIMIT, 12 * 1024);

const formHtml = renderQuickCaptureForm();
assert.equal((formHtml.match(/name="intent"/g) || []).length, 7);
for (const label of expectedIntents) assert.match(formHtml, new RegExp(`>${label.replace("/", "\\/")}<`));
assert.match(formHtml, /data-quick-capture-destination/);
assert.match(formHtml, /Choose an intent to see where it will be saved/);
assert.match(formHtml, />Save</);
assert.match(formHtml, /data-quick-capture-open/);
assert.match(formHtml, />Open</);
assert.match(formHtml, /A suggestion never selects or saves a destination for you/);
assert.equal((formHtml.match(/data-quick-capture-form/g) || []).length, 1);

const ownerCapabilities = buildQuickCaptureCapabilities("owner");
const operatorCapabilities = buildQuickCaptureCapabilities("operator");
const viewerCapabilities = buildQuickCaptureCapabilities("viewer");
assert(ownerCapabilities.intents.every((item) => item.enabled));
assert(operatorCapabilities.intents.find((item) => item.id === "task").enabled);
assert(operatorCapabilities.intents.find((item) => item.id === "decision").enabled);
assert.equal(operatorCapabilities.intents.find((item) => item.id === "post-idea").enabled, false);
assert.equal(operatorCapabilities.intents.find((item) => item.id === "campaign-idea").enabled, false);
assert.equal(operatorCapabilities.intents.find((item) => item.id === "file-report-note").enabled, false);
assert(viewerCapabilities.intents.every((item) => !item.enabled));
assert.equal(quickCaptureAuthority("owner", "post-idea").ok, true);
assert.equal(quickCaptureAuthority("operator", "post-idea").ok, false);
assert.equal(quickCaptureAuthority("viewer", "task").ok, false);
assert(Object.isFrozen(ownerCapabilities) && Object.isFrozen(ownerCapabilities.intents));
assert(ownerCapabilities.intents.every((item) => !Object.keys(item).some((key) => /capability|permission/i.test(key))));

const NOW = "2026-07-17T16:00:00.000Z";
const OWNER = Object.freeze({ id:"quick-capture-owner", role:"owner", label:"Fixture Owner", authenticated:true });
const baseState = Object.freeze({
  tasks:Object.freeze([]),
  captureInbox:Object.freeze([]),
  posts:Object.freeze([]),
  campaigns:Object.freeze([]),
  dataRoomItems:Object.freeze([]),
  activityEvents:Object.freeze([]),
  auditHistory:Object.freeze([])
});
const requestIds = Object.freeze({
  task:"11111111-1111-4111-8111-111111111111",
  decision:"22222222-2222-4222-8222-222222222222",
  blocker:"33333333-3333-4333-8333-333333333333",
  post:"44444444-4444-4444-8444-444444444444",
  partner:"55555555-5555-4555-8555-555555555555",
  campaign:"66666666-6666-4666-8666-666666666666",
  file:"77777777-7777-4777-8777-777777777777"
});

const inputs = Object.freeze([
  Object.freeze({ intent:"task", title:"Prepare the founder update", details:"Draft the reviewed two-paragraph update.", creationRequestId:requestIds.task }),
  Object.freeze({ intent:"decision", title:"Choose the August planning window", details:"Review the two internal options.", creationRequestId:requestIds.decision }),
  Object.freeze({ intent:"blocker", title:"Partner brief is missing approval", details:"Keep this in review until the source is complete.", creationRequestId:requestIds.blocker }),
  Object.freeze({ intent:"post-idea", title:"A clearer path through record clearing", details:"Draft-only post idea.", creationRequestId:requestIds.post }),
  Object.freeze({ intent:"partner-note", title:"Community Partner asked for a follow-up", details:"Review before routing this note.", relatedPartner:"Example Community Partner", creationRequestId:requestIds.partner }),
  Object.freeze({ intent:"campaign-idea", title:"August Partner education", details:"An inert draft only.", campaignType:"partner_outreach", creationRequestId:requestIds.campaign }),
  Object.freeze({ intent:"file-report-note", title:"July operating report notes", details:"Draft document record only.", fileSection:"Company overview", creationRequestId:requestIds.file })
]);

let state = structuredClone(baseState);
const results = [];
for (const input of inputs) {
  const before = structuredClone(state);
  const created = createQuickCapture(state, input, { actor:OWNER, now:NOW });
  assert.equal(created.body.ok, true);
  assert.equal(created.body.intent, input.intent);
  assert.equal(created.body.alreadyExisted, false);
  assert(!Object.hasOwn(created.body, "state"));
  assert(!Object.hasOwn(created.body, "record"));
  assert(!Object.keys(created.body).some((key) => /capability|permission|token|secret|provider/i.test(key)));
  assert.deepEqual(state, before, `${input.intent} must not mutate its source state.`);
  state = created.state;
  results.push(created.body);
}

assert.deepEqual(results.map((result) => result.destination), expectedDestinations);
assert.deepEqual(results.map((result) => result.canonicalHref), [
  `#item/tasks/task-quick-${requestIds.task}`,
  `#item/captureInbox/capture-${requestIds.decision}`,
  `#item/captureInbox/capture-${requestIds.blocker}`,
  `#social/post/post-${requestIds.post}`,
  `#item/captureInbox/capture-${requestIds.partner}`,
  `#outreach/campaign/campaign-${requestIds.campaign}`,
  `#files/data-room-item/document-${requestIds.file}`
]);
assert.deepEqual({
  tasks:state.tasks.length,
  decisions:state.captureInbox.filter((item) => item.capture_type === "decision").length,
  blockers:state.captureInbox.filter((item) => item.capture_type === "blocker").length,
  posts:state.posts.length,
  partnerNotes:state.captureInbox.filter((item) => item.capture_type === "partner_update").length,
  campaigns:state.campaigns.length,
  files:state.dataRoomItems.length
}, { tasks:1, decisions:1, blockers:1, posts:1, partnerNotes:1, campaigns:1, files:1 });
assert.equal(state.activityEvents.length, 7);
assert.equal(state.auditHistory.length, 7);
assert(state.activityEvents.every((event) => event.metadata?.externalSideEffects === false));
assert(state.auditHistory.every((event) => event.externalSideEffects === false || /quick capture/.test(event.action)));
assert.equal(state.tasks.filter((task) => task.sourceType === "quick_capture").length, 1, "Only the Task intent may create a Task.");
assert.equal(state.posts[0].status, "idea");
assert.equal(state.posts[0].body, "");
assert.equal(state.posts[0].notes, inputs[3].details);
assert.equal(state.posts[0].captureIntent, "post-idea");
assert.equal(state.posts[0].scheduledFor, "");
assert.equal(state.posts[0].publishedAt, "");
assert.equal(state.campaigns[0].status, "draft");
assert.equal(state.campaigns[0].captureIntent, "campaign-idea");
assert.deepEqual(state.campaigns[0].recipients, []);
assert.equal(state.campaigns[0].sendCount, 0);
assert.equal(state.campaigns[0].liveMode, false);
assert.equal(state.dataRoomItems[0].status, "draft");
assert.equal(state.dataRoomItems[0].captureIntent, "file-report-note");
assert.equal(state.dataRoomItems[0].binaryUploaded, false);
assert.equal(state.dataRoomItems[0].externallyShared, false);
assert.equal(state.captureInbox.find((item) => item.capture_type === "partner_update").linked_partner, "Example Community Partner");
assert.equal(state.partners?.length || 0, 0, "Partner note must not create or alter a Partner.");

const countsBeforeRepeat = Object.freeze({
  tasks:state.tasks.length,
  captures:state.captureInbox.length,
  posts:state.posts.length,
  campaigns:state.campaigns.length,
  files:state.dataRoomItems.length,
  activities:state.activityEvents.length,
  audits:state.auditHistory.length
});
const repeated = createQuickCapture(state, { ...inputs[0], title:"A changed retry title" }, { actor:OWNER, now:NOW });
assert.equal(repeated.state, state);
assert.equal(repeated.body.alreadyExisted, true);
assert.equal(repeated.body.title, inputs[0].title);
assert.deepEqual(countsBeforeRepeat, {
  tasks:repeated.state.tasks.length,
  captures:repeated.state.captureInbox.length,
  posts:repeated.state.posts.length,
  campaigns:repeated.state.campaigns.length,
  files:repeated.state.dataRoomItems.length,
  activities:repeated.state.activityEvents.length,
  audits:repeated.state.auditHistory.length
});

assert.throws(
  () => createQuickCapture(state, { ...inputs[2], creationRequestId:requestIds.task }, { actor:OWNER, now:NOW }),
  (error) => error?.status === 409 && /existing intent/.test(error.message),
  "One creation request ID must never be reused for a different capture intent."
);
assert.deepEqual(countsBeforeRepeat, {
  tasks:state.tasks.length,
  captures:state.captureInbox.length,
  posts:state.posts.length,
  campaigns:state.campaigns.length,
  files:state.dataRoomItems.length,
  activities:state.activityEvents.length,
  audits:state.auditHistory.length
});

const deniedState = structuredClone(baseState);
assert.throws(
  () => createQuickCapture(deniedState, inputs[3], { actor:{ id:"operator", role:"operator", label:"Operator" }, now:NOW }),
  /does not allow/,
  "Domain authorization must be rechecked before creation."
);
assert.deepEqual(deniedState, structuredClone(baseState));
for (const invalid of [
  { ...inputs[0], title:"<script>alert(1)</script>" },
  { ...inputs[0], creationRequestId:"short" },
  { ...inputs[0], intent:"not-an-intent" },
  { ...inputs[0], unexpected:"field" },
  { ...inputs[5], campaignType:"silent_default" },
  { ...inputs[6], fileSection:"Private path" }
]) {
  assert.throws(() => createQuickCapture(deniedState, invalid, { actor:OWNER, now:NOW }));
  assert.deepEqual(deniedState, structuredClone(baseState));
}

const browserSource = quickCaptureBrowserSource();
assert.match(browserSource, /vnext:open-quick-capture/);
assert.match(browserSource, /vnext:quick-capture-opened/);
assert.match(browserSource, /suggestion never selects or saves|suggestedIntent/i);
assert.match(browserSource, /suggestionAction\.addEventListener\("click"/);
assert.doesNotMatch(browserSource.slice(0, browserSource.indexOf("suggestionAction.addEventListener")), /\.checked\s*=\s*true/, "Le-E suggestion setup must not silently select an intent.");
assert.match(browserSource, /form\.dataset\.submitting === "true"/);
assert.match(browserSource, /submitButton\.disabled = true/);
assert.match(browserSource, /vnext:session-expired/);
assert.match(browserSource, /safeExactHash/);
assert.match(browserSource, /textContent/);
assert.doesNotMatch(browserSource, /typeof load === "function"|\/api\/state|\/api\/boot-state/, "Quick Capture must not refresh broad state after a compact save.");
assert.match(browserSource, /recentResults/);
assert.match(browserSource, /dataset\.quickCaptureExactResult/);
assert.doesNotMatch(browserSource, /innerHTML\s*=|localStorage|sessionStorage|\/api\/(?:send|publish|launch|release|enroll|approve)|\b(?:send|publish|launch|release|enroll|approve)\w*\s*\(/i);

const uiSource = await readFile(new URL("./ui/quick-capture.mjs", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("./quick-capture-service.mjs", import.meta.url), "utf8");
const globalCreateSource = await readFile(new URL("./ui/global-create.mjs", import.meta.url), "utf8");
const todaySource = await readFile(new URL("./ui/pages/today-page.mjs", import.meta.url), "utf8");
const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const shellSource = await readFile(new URL("./ui/app-shell.mjs", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../assets/ui/quick-capture.css", import.meta.url), "utf8");
const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");
assert.doesNotMatch(uiSource, /^\s*import[^\n]+(?:storage|database|network|provider|send|publish|engine|preview-server)/im);
assert.doesNotMatch(uiSource, /process\.env|readFile|writeFile|createServer/);
assert.doesNotMatch(serviceSource, /provider|sendEmail|publish\w*\(|launch\w*\(|release\w*\(|enroll\w*\(|approve\w*\(|suppression|liveGate/i);
assert.match(globalCreateSource, /renderQuickCaptureForm/);
assert.match(globalCreateSource, /window\.__LE_QUICK_CAPTURE\?\.submit/);
assert.match(todaySource, /vnext:open-quick-capture/);
assert.equal((todaySource.match(/Open Quick Capture/g) || []).length, 1);
assert.match(serverSource, /url\.pathname === QUICK_CAPTURE_ENDPOINT && request\.method === "POST"/);
assert.match(serverSource, /readBoundedJson\(request, \{ limit:QUICK_CAPTURE_BODY_LIMIT \}\)/);
assert.match(serverSource, /createQuickCapture\(currentState, input, \{ actor, now \}\)/);
assert.doesNotMatch(serverSource, /\/api\/ui\/today\/(?:action|mutate|capture)/i);
assert.match(shellSource, /quickCaptureBrowserSource/);
assert.match(shellSource, /QUICK_CAPTURE_STYLESHEET_PATH/);
assert.match(cssSource, /@media \(max-width: 35rem\)/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(cssSource, /gradient|backdrop-filter/i);
assert.match(packageSource, /"test:vnext-quick-capture"/);

const legacyShellStart = serverSource.indexOf("function htmlShell()");
const legacyShellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", legacyShellStart);
assert.ok(legacyShellStart >= 0 && legacyShellEnd > legacyShellStart);
assert.equal(createHash("sha256").update(serverSource.slice(legacyShellStart, legacyShellEnd)).digest("hex"), "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187");
const legacyTodayStart = serverSource.indexOf("    function commandCenterOverviewHtml(posts)");
const legacyTodayEnd = serverSource.indexOf("\n    function focusItemsForMode", legacyTodayStart);
assert.ok(legacyTodayStart >= 0 && legacyTodayEnd > legacyTodayStart);
assert.equal(createHash("sha256").update(serverSource.slice(legacyTodayStart, legacyTodayEnd)).digest("hex"), "36f509ab37d1e0ca838bbe84838677eee67d35e7519aa8aeb44fa3913e565d76");
const legacyFixture = "<html><body>legacy Quick Capture fixture</body></html>";
assert.equal(renderShellBoundary({ config:{ enabled:false }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vNext" }), legacyFixture);
assert.equal(renderShellBoundary({ config:{ enabled:true }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vNext" }), "vNext");
assert.equal(routeRegistry.length, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);

console.log("QUICK_CAPTURE_MATRIX", JSON.stringify(results.map((result) => ({ intent:result.intentLabel, destination:result.destination, href:result.canonicalHref }))));
console.log("QUICK_CAPTURE_COUNTS", JSON.stringify({ task:1, decision:1, blocker:1, postIdea:1, partnerNote:1, campaignIdea:1, fileReportNote:1 }));
console.log("QUICK_CAPTURE_SAFETY", JSON.stringify({ sends:0, publications:0, externalActions:0, providerCalls:0, partnerStageChanges:0, fileStatusChanges:0, suppressionChanges:0, liveGateChanges:0 }));
console.log("PASS test-vnext-quick-capture");

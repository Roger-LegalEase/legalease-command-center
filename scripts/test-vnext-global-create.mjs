import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildGlobalCreateViewModel,
  GLOBAL_CREATE_CONTRACT,
  GLOBAL_CREATE_OPTIONS,
  globalCreateBrowserSource,
  renderGlobalCreateMenu,
  renderGlobalCreateWorkspace
} from "./ui/global-create.mjs";
import {
  createGlobalObject,
  GLOBAL_CREATE_ENDPOINTS,
  GLOBAL_CREATE_SOURCE_MAPPINGS
} from "./global-create-service.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "./roles.mjs";
import { renderShellBoundary } from "./ui/shell-boundary.mjs";

const expectedLabels = ["Social post", "Outreach campaign", "Partner", "File or folder", "Quick note"];
assert.deepEqual(GLOBAL_CREATE_OPTIONS.map((item) => item.label), expectedLabels);
assert.equal(GLOBAL_CREATE_OPTIONS.length, 5);
assert.equal(GLOBAL_CREATE_OPTIONS.some((item) => item.label === "Task"), false);
assert.equal(new Set(GLOBAL_CREATE_OPTIONS.map((item) => item.endpoint)).size, 5);
assert.equal(GLOBAL_CREATE_CONTRACT.folderSupport, false);
assert.equal(GLOBAL_CREATE_CONTRACT.folderDeferral, "Folders are not available in the current Files system yet.");

const ownerView = buildGlobalCreateViewModel(Object.fromEntries(GLOBAL_CREATE_OPTIONS.map((item) => [item.id, { enabled:true }])));
const restrictedView = buildGlobalCreateViewModel({ "quick-note":{ enabled:true } });
assert(ownerView.items.every((item) => item.enabled));
assert.equal(restrictedView.items.find((item) => item.id === "quick-note").enabled, true);
assert.equal(restrictedView.items.find((item) => item.id === "partner").enabled, false);
assert.match(restrictedView.items.find((item) => item.id === "partner").reason, /not available/i);
assert(Object.isFrozen(ownerView) && Object.isFrozen(ownerView.items));

const menu = renderGlobalCreateMenu(ownerView);
const workspace = renderGlobalCreateWorkspace();
let priorIndex = -1;
for (const label of expectedLabels) {
  const index = menu.indexOf(`>${label}<`);
  assert(index > priorIndex, `${label} should appear once in the approved order.`);
  priorIndex = index;
}
assert.doesNotMatch(menu, />Task</);
assert.match(workspace, /role="dialog"/);
assert.match(workspace, /aria-modal="true"/);
assert.match(workspace, /Folders are not available in the current Files system yet\./);
assert.match(workspace, /data-global-create-form="social-post"/);
assert.match(workspace, /data-global-create-form="outreach-campaign"/);
assert.match(workspace, /data-global-create-form="partner"/);
assert.match(workspace, /data-global-create-form="file-or-folder"/);
assert.match(workspace, /data-global-create-form="quick-note"/);

assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.post), ["manage_content_drafts"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.campaign), ["manage_growth"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.partner), ["manage_growth"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.file), ["manage_growth"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", GLOBAL_CREATE_ENDPOINTS.note), ["route_captures"]);
for (const endpoint of Object.values(GLOBAL_CREATE_ENDPOINTS)) assert.equal(canPerformEndpoint("owner", "POST", endpoint).ok, true);
assert.equal(canPerformEndpoint("operator", "POST", GLOBAL_CREATE_ENDPOINTS.post).ok, false);
assert.equal(canPerformEndpoint("operator", "POST", GLOBAL_CREATE_ENDPOINTS.partner).ok, false);
assert.equal(canPerformEndpoint("operator", "POST", GLOBAL_CREATE_ENDPOINTS.note).ok, true);
assert.equal(canPerformEndpoint("viewer", "POST", GLOBAL_CREATE_ENDPOINTS.note).ok, false);

const now = "2026-07-16T12:00:00.000Z";
const actor = { id:"owner-fixture", role:"owner", label:"Fixture Owner" };
const baseState = { posts:[], campaigns:[], partners:[], dataRoomItems:[], captureInbox:[], tasks:[], activityEvents:[], auditHistory:[] };
const ids = {
  post:"11111111-1111-4111-8111-111111111111",
  campaign:"22222222-2222-4222-8222-222222222222",
  partner:"33333333-3333-4333-8333-333333333333",
  file:"44444444-4444-4444-8444-444444444444",
  note:"55555555-5555-4555-8555-555555555555"
};

let state = baseState;
const post = createGlobalObject(state, "post", { creationRequestId:ids.post, title:"Café access — a founder's note", draftCopy:"Draft only.", channel:"linkedin" }, { now, actor });
state = post.state;
assert.equal(post.record.status, "draft");
assert.equal(post.record.scheduledFor, "");
assert.equal(post.record.publishedAt, "");
assert.equal(post.result.canonicalHref, `#social/post/post-${ids.post}`);

const campaign = createGlobalObject(state, "campaign", { creationRequestId:ids.campaign, campaignName:"Partner introduction", campaignType:"partner_outreach", goal:"Start a conversation." }, { now, actor });
state = campaign.state;
assert.equal(campaign.record.status, "draft");
assert.deepEqual(campaign.record.recipients, []);
assert.equal(campaign.record.sendCount, 0);
assert.equal(campaign.record.liveMode, false);
assert.equal(campaign.result.canonicalHref, `#outreach/campaign/campaign-${ids.campaign}`);

const partner = createGlobalObject(state, "partner", { creationRequestId:ids.partner, organizationName:"Example Community Org", partnerType:"nonprofit", primaryContactEmail:"person@example.com", geography:"PA" }, { now, actor });
state = partner.state;
assert.equal(partner.record.status, "new");
assert.equal(partner.record.stage, "new");
assert.equal(partner.record.email, "person@example.com");
assert.equal(partner.result.canonicalHref, `#partners/partner/partner-${ids.partner}`);

const file = createGlobalObject(state, "file", { creationRequestId:ids.file, name:"Readiness notes", section:"Compliance", sourceLink:"https://example.com/document", notes:"Internal draft." }, { now, actor });
state = file.state;
assert.equal(file.record.status, "draft");
assert.equal(file.record.binaryUploaded, false);
assert.equal(file.record.externallyShared, false);
assert.equal(file.result.canonicalHref, `#files/data-room-item/document-${ids.file}`);

const note = createGlobalObject(state, "note", { creationRequestId:ids.note, note:"Remember the filing deadline — internal only." }, { now, actor });
state = note.state;
assert.equal(note.record.capture_type, "conversation_note");
assert.equal(note.record.review_state, "review_required");
assert.deepEqual(state.tasks, []);
assert.equal(note.result.canonicalHref, `#item/captureInbox/capture-${ids.note}`);

assert.equal(state.posts.length, 1);
assert.equal(state.campaigns.length, 1);
assert.equal(state.partners.length, 1);
assert.equal(state.dataRoomItems.length, 1);
assert.equal(state.captureInbox.length, 1);
assert.equal(state.activityEvents.length, 5);
assert.equal(state.auditHistory.length, 5);
assert(state.auditHistory.every((event) => event.action === "global_create" && event.externalSideEffects === false));
assert(state.activityEvents.every((event) => event.metadata.externalSideEffects === false));

const repeated = createGlobalObject(state, "partner", { creationRequestId:ids.partner, organizationName:"Changed name", partnerType:"other" }, { now, actor });
assert.equal(repeated.result.alreadyExisted, true);
assert.equal(repeated.state, state);
assert.equal(repeated.record.organizationName, "Example Community Org");
assert.equal(repeated.state.partners.length, 1);
assert.equal(repeated.state.auditHistory.length, 5);
assert(Object.isFrozen(repeated.result));
assert.deepEqual(Object.keys(repeated.result), ["ok", "objectType", "id", "title", "canonicalHref", "destination", "createdAt", "alreadyExisted"]);
assert.throws(
  () => createGlobalObject(state, "partner", { creationRequestId:ids.partner, organizationName:"<script>invalid</script>", partnerType:"other" }, { now, actor }),
  /unsupported content/,
  "validation must rerun when an idempotency key already exists"
);
const collisionState = { ...baseState, posts:[{ id:`post-${ids.post}`, title:"Unrelated record", createdVia:"Other" }] };
assert.throws(
  () => createGlobalObject(collisionState, "post", { creationRequestId:ids.post, title:"Valid title", draftCopy:"", channel:"" }, { now, actor }),
  /conflicts with an existing record/,
  "a creation request must not claim a colliding record from another workflow"
);

assert.throws(() => createGlobalObject(baseState, "post", { creationRequestId:ids.post, title:"<script>alert(1)</script>", channel:"" }, { now, actor }), /unsupported content/);
assert.throws(() => createGlobalObject(baseState, "file", { creationRequestId:ids.file, name:"Unsafe", section:"Other", sourceLink:"http:\/\/example.com" }, { now, actor }), /valid HTTPS/);
assert.throws(() => createGlobalObject(baseState, "partner", { creationRequestId:ids.partner, organizationName:"Example", partnerType:"nonprofit", primaryContactEmail:"not-an-email" }, { now, actor }), /valid contact email/);
assert.throws(() => createGlobalObject(baseState, "note", { creationRequestId:"short", note:"No" }, { now, actor }), /request was invalid/);
assert.equal(baseState.posts.length, 0);
assert.equal(baseState.dataRoomItems.length, 0);
assert.equal(baseState.partners.length, 0);
assert.equal(baseState.captureInbox.length, 0);

assert.deepEqual(Object.fromEntries(Object.entries(GLOBAL_CREATE_SOURCE_MAPPINGS).map(([key, value]) => [key, value.collection])), {
  post:"posts",
  campaign:"campaigns",
  partner:"partners",
  file:"dataRoomItems",
  note:"captureInbox"
});

const browserSource = globalCreateBrowserSource();
for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "aria-expanded", "window.confirm", "x-csrf-token", "creationRequestId"]) assert(browserSource.includes(key));
assert.match(browserSource, /submit\.disabled = true/);
assert.match(browserSource, /credentials:"same-origin"/);
assert.doesNotMatch(browserSource, /localStorage|sessionStorage|document\.location\.search/);

const uiSource = await readFile(new URL("./ui/global-create.mjs", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("./global-create-service.mjs", import.meta.url), "utf8");
const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const shellSource = await readFile(new URL("./ui/app-shell.mjs", import.meta.url), "utf8");
const rolesSource = await readFile(new URL("./roles.mjs", import.meta.url), "utf8");

assert.doesNotMatch(uiSource, /from ["'][^"']*(?:storage|database|network|send|publish|engine|preview-server)/i);
assert.doesNotMatch(uiSource, /process\.env|readFile|writeFile/);
assert.doesNotMatch(serviceSource, /from ["'][^"']*(?:storage|database|network|send|publish)/i);
assert.match(serverSource, /const bodyRoleDecision = canPerformEndpoint\(actor\?\.role \|\| "viewer", request\.method, url\.pathname, input\)/);
assert.match(serverSource, /await writeChangedCollections\(currentState, result\.state\)/);
assert.doesNotMatch(serverSource.slice(serverSource.indexOf("const globalCreateKind = globalCreateKindsByPath"), serverSource.indexOf('if (url.pathname === "/api/reports/aggregate"')), /withPublicChannelSetup|state:/);
assert.match(rolesSource, /\/api\/ui\/create\/post/);
assert.match(shellSource, /globalCreateBrowserSource/);
assert.equal((shellSource.match(/class="vnext-create-trigger"/g) || []).length, 1, "Desktop and responsive layouts must share one Create trigger contract.");

const legacyFixture = "<html>legacy shell fixture</html>";
assert.equal(renderShellBoundary({ config:{ enabled:false }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vnext" }), legacyFixture);
assert.equal(renderShellBoundary({ config:{ enabled:true }, renderLegacyApp:() => legacyFixture, renderVNextApp:() => "vnext" }), "vnext");
assert.match(serverSource, /readCommandCenterVNextConfig\(process\.env\)/);
assert.doesNotMatch(serverSource, /COMMAND_CENTER_UX_VNEXT[^\n]*(?:url|cookie|localStorage|sessionStorage)/i);

console.log("PASS test-vnext-global-create");

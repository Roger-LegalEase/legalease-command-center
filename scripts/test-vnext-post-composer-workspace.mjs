#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chmod, rename } from "node:fs/promises";
import path from "node:path";
import { buildPostComposerContract, normalizeComposerPatch, composerSavePath } from "./post-composer-service.mjs";
import { canPerformEndpoint } from "./roles.mjs";
import { jsonRequest, loginWithCredential, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const POST_ID = "composer-fixture-post";
const FIELD_KEYS = ["headline", "body", "hook", "cta", "hashtags"];
function fixtureState() {
  return {
    posts: [{
      id:POST_ID,
      _version:7,
      title:"Synthetic education Post",
      headline:"A deterministic fixture headline",
      body:"Synthetic shared copy for composer verification.",
      hook:"Start with a clear synthetic example",
      cta:"Review the synthetic guide",
      hashtags:["#SyntheticFixture", "#TestOwned"],
      targetChannels:["linkedin", "instagram"],
      channelVariants:[{
        id:"composer-fixture-linkedin-variant",
        channel:"linkedin",
        body:"Synthetic LinkedIn variant copy.",
        assetIds:["composer-fixture-accent"]
      }],
      selectedTemplateId:"composer-fixture-template",
      logoAssetId:"brand-contract-white-wordmark",
      wilmaAssetId:"composer-fixture-character",
      backgroundAssetId:"composer-fixture-background",
      disclaimerIds:["composer-fixture-disclaimer"],
      assetIds:["composer-fixture-accent"],
      creativeSurfaceTone:"dark",
      scheduledFor:"2026-07-20T14:00:00.000Z",
      timezone:"America/New_York",
      scheduleStatus:"valid",
      approvalRequired:true,
      approvalStatus:"approved",
      approvedAt:"2026-07-18T11:00:00.000Z",
      status:"approved",
      guidelinesGate:{ passed:true, hardFails:[] },
      copyReviewed:true,
      finalPreviewConfirmed:true,
      updatedAt:"2026-07-18T11:30:00.000Z"
    }],
    generationProfiles:[{
      id:"composer-fixture-template",
      displayName:"Synthetic education template",
      templateCategory:"Synthetic education",
      description:"A deterministic test-owned layout.",
      supportedChannels:["linkedin", "instagram"],
      surfaceTone:"dark",
      requiredAssetRoles:["logo", "wilma_pose", "background"],
      assetIds:[
        "brand-contract-white-wordmark",
        "composer-fixture-character",
        "composer-fixture-background",
        "composer-fixture-accent"
      ],
      defaultDisclaimerId:"composer-fixture-disclaimer",
      active:true,
      approved:true
    }],
    brandAssets:[
      { id:"composer-fixture-character", name:"Synthetic character pose", assetType:"wilma_pose", approved:true },
      { id:"composer-fixture-background", name:"Synthetic navy background", assetType:"background", approved:true },
      { id:"composer-fixture-accent", name:"Synthetic accent", assetType:"visual_reference", approved:true }
    ],
    postImages:[{
      id:"composer-fixture-final-image",
      postId:POST_ID,
      generationStatus:"generated",
      finalImageReady:true,
      renderQa:{ passed:true },
      styleGate:{ passed:true },
      versionNumber:1,
      createdAt:"2026-07-18T10:30:00.000Z"
    }],
    library:[{
      id:"composer-fixture-disclaimer",
      title:"Synthetic informational disclaimer",
      category:"disclaimer",
      status:"approved",
      body:"Synthetic information only."
    }],
    socialAccounts:[
      { id:"composer-fixture-linkedin-account", platform:"linkedin", status:"connected", connected:true },
      { id:"composer-fixture-instagram-account", platform:"instagram", status:"connected", connected:true }
    ],
    approvals:[{
      id:"composer-fixture-approval",
      type:"post",
      sourceId:POST_ID,
      status:"approved",
      updatedAt:"2026-07-18T11:00:00.000Z"
    }],
    postingKits:[],
    approvalQueue:[],
    queueItems:[],
    publishEvents:[],
    publishClaims:[],
    contentBank:[],
    reports:[],
    dataRoomItems:[],
    evidencePackNotes:[],
    activityEvents:[],
    auditHistory:[],
    generationBatches:[],
    assetBundles:[],
    brandRules:[],
    postVersions:[],
    copyVersions:[],
    reviewFeedback:[],
    reviewFeedbackRecords:[],
    postReviewFeedback:[],
    scheduleConflicts:[],
    settings:{ sourceItems:[], localAssets:[] },
    runtime:{ livePostingGates:{ linkedin:true, instagram:true } }
  };
}

const testSource = readFileSync(new URL(import.meta.url), "utf8");
assert.doesNotMatch(testSource, new RegExp(["data", "social-command-center\\.json"].join("/")), "Focused verification must not reference ignored operational state.");
const sourceState = fixtureState();
const state = structuredClone(sourceState);
const source = state.posts[0];
source._version = 7;
const owner = { authenticated:true, role:"owner", id:"owner" };
const admin = { authenticated:true, role:"admin", id:"admin" };
const operator = { authenticated:true, role:"operator", id:"operator" };
const viewer = { authenticated:true, role:"viewer", id:"viewer" };

assert.equal(composerSavePath(source.id), `/api/ui/social/post/${source.id}/save`);
assert.equal(canPerformEndpoint("owner", "POST", composerSavePath(source.id)).ok, true);
assert.equal(canPerformEndpoint("admin", "POST", composerSavePath(source.id)).ok, true);
assert.equal(canPerformEndpoint("operator", "POST", composerSavePath(source.id)).ok, false);
assert.equal(canPerformEndpoint("viewer", "POST", composerSavePath(source.id)).ok, false);

const stateBeforeRead = structuredClone(state);
const contract = buildPostComposerContract(state, owner, source.id, NOW);
assert.equal(contract.ok, true);
assert.equal(contract.generatedAt, NOW);
assert.equal(contract.post.id, source.id);
assert.equal(contract.post.href, `#social/post/${source.id}`);
assert.equal(contract.version, 7, "Authorized reads return the exact stored version.");
assert.equal(contract.capabilities.reads, true);
assert.equal(contract.capabilities.edits, true);
assert.deepEqual(Object.keys(contract.fields), FIELD_KEYS);
assert.equal(typeof contract.schedule.state, "string");
assert.equal(typeof contract.review.state, "string");
assert.equal(typeof contract.publishing.state, "string");
assert.equal(contract.capabilities.schedules, false);
assert.equal(contract.capabilities.approves, false);
assert.equal(contract.capabilities.publishes, false);
assert.equal(JSON.stringify(contract).includes("accessToken"), false);
assert.equal(JSON.stringify(contract).includes("privateAssetPath"), false);
assert.deepEqual(state, stateBeforeRead, "Composer reads must not mutate their input or unrelated state.");

assert.equal(buildPostComposerContract(state, admin, source.id, NOW).capabilities.edits, true);
const readOnly = buildPostComposerContract(state, operator, source.id, NOW);
assert.equal(readOnly.ok, true);
assert.equal(readOnly.capabilities.edits, false);
assert.equal(buildPostComposerContract(state, viewer, source.id, NOW).ok, false);
const noVersion = structuredClone(state);
delete noVersion.posts[0]._version;
delete noVersion.posts[0].version;
const noVersionContract = buildPostComposerContract(noVersion, owner, source.id, NOW);
assert.equal(noVersionContract.version, null);
assert.equal(noVersionContract.capabilities.edits, false, "A missing version disables save.");

const hiddenState = structuredClone(state);
hiddenState.posts[0] = { ...hiddenState.posts[0], visibility:"owner_only", allowedRoles:["owner"], title:"Protected title" };
const hidden = buildPostComposerContract(hiddenState, operator, source.id, NOW);
assert.equal(hidden.ok, false);
assert.equal(hidden.outcome, "unavailable");
assert.equal(hidden.post, undefined);
assert.equal(hidden.version, undefined);
assert.equal(JSON.stringify(hidden).includes("Protected title"), false);

const duplicateState = structuredClone(state);
duplicateState.posts.unshift({ ...source, title:"Hidden duplicate", _version:99, visibility:"owner_only", allowedRoles:["owner"] });
const duplicate = buildPostComposerContract(duplicateState, operator, source.id, NOW);
assert.equal(duplicate.ok, false, "Duplicate raw Post IDs fail closed before visibility projection.");
assert.equal(duplicate.post, undefined);
assert.equal(duplicate.version, undefined);
assert.equal(JSON.stringify(duplicate).includes("Hidden duplicate"), false);

const valid = { headline:"A", body:"B", hook:"H", cta:"C", hashtags:["#one"] };
const validInput = { fields:structuredClone(valid) };
assert.deepEqual(normalizeComposerPatch(validInput), valid);
assert.deepEqual(validInput, { fields:valid }, "Patch normalization must not mutate its input.");
assert.throws(() => normalizeComposerPatch({ fields:{ status:"approved" } }), /shared Post copy/);
assert.throws(() => normalizeComposerPatch({ fields:{ headline:3 } }), /invalid/);
assert.throws(() => normalizeComposerPatch({ fields:{ headline:"x".repeat(201) } }), /too long/);
assert.throws(() => normalizeComposerPatch({ fields:{ body:"bad\u0000body" } }), /invalid/);
assert.throws(() => normalizeComposerPatch({ fields:{ hashtags:"#one" } }), /list/);
assert.deepEqual(normalizeComposerPatch({ fields:{ headline:"", body:"", hook:"", cta:"", hashtags:[] } }), { headline:"", body:"", hook:"", cta:"", hashtags:[] });

const credentials = Object.fromEntries(["owner", "admin", "operator", "viewer"].map((role) => [role, `${role}-composer-credential-2026-A7v9`]));
const fixturePost = (id, extra = {}) => ({
  ...structuredClone(source), id, title:`Fixture ${id}`, headline:`Headline ${id}`, body:`Body ${id}`,
  hook:`Hook ${id}`, cta:`CTA ${id}`, hashtags:["#fixture"], _version:7, ...extra
});
const endpointState = structuredClone(sourceState);
endpointState.posts = [
  fixturePost("composer-owner-visible"),
  fixturePost("composer-admin-visible"),
  fixturePost("composer-operator-visible"),
  fixturePost("composer-hidden", { title:"Nondisclosed title", visibility:"owner_only", allowedRoles:["owner"] }),
  fixturePost("composer-duplicate", { title:"First duplicate" }),
  fixturePost("composer-duplicate", { title:"Second duplicate", _version:44 })
];

const server = await startPreviewServer({
  seed:endpointState,
  env:{
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_OWNER_TOKEN:credentials.owner,
    COMMAND_CENTER_ADMIN_TOKEN:credentials.admin,
    COMMAND_CENTER_OPERATOR_TOKEN:credentials.operator,
    COMMAND_CENTER_VIEWER_TOKEN:credentials.viewer
  }
});

function sessionHeaders(session, json = false) {
  return {
    cookie:session.cookie,
    "x-csrf-token":session.csrfToken,
    ...(json ? { "content-type":"application/json" } : {})
  };
}

async function endpointRead(id, session) {
  return jsonRequest(server.baseUrl, `/api/ui/social/post/${encodeURIComponent(id)}/composer`, { headers:sessionHeaders(session) });
}

async function endpointSave(id, session, body) {
  return jsonRequest(server.baseUrl, `/api/ui/social/post/${encodeURIComponent(id)}/save`, {
    method:"POST", headers:sessionHeaders(session, true), body:JSON.stringify(body)
  });
}

try {
  const sessions = {};
  for (const role of ["owner", "admin", "operator", "viewer"]) sessions[role] = await loginWithCredential(server, credentials[role]);

  const ownerRead = await endpointRead("composer-owner-visible", sessions.owner);
  assert.equal(ownerRead.response.status, 200);
  assert.equal(ownerRead.json.version, 7);
  assert.equal(ownerRead.json.capabilities.edits, true);
  const ownerFields = { headline:"Owner edited", body:"Owner body", hook:"Owner hook", cta:"Owner CTA", hashtags:["#owner"] };
  const ownerSave = await endpointSave("composer-owner-visible", sessions.owner, { fields:ownerFields, expectedVersion:7 });
  assert.equal(ownerSave.response.status, 200);
  assert.equal(ownerSave.json.version, 8, "A successful save increments exactly one version.");
  assert.deepEqual(ownerSave.json.fields, ownerFields);

  const adminRead = await endpointRead("composer-admin-visible", sessions.admin);
  assert.equal(adminRead.response.status, 200);
  assert.equal(adminRead.json.capabilities.edits, true);
  const adminSave = await endpointSave("composer-admin-visible", sessions.admin, { fields:{ headline:"Admin edited" }, expectedVersion:7 });
  assert.equal(adminSave.response.status, 200, "Admin saves according to manage_content_drafts.");
  assert.equal(adminSave.json.version, 8);

  const operatorRead = await endpointRead("composer-operator-visible", sessions.operator);
  assert.equal(operatorRead.response.status, 200);
  assert.equal(operatorRead.json.capabilities.edits, false);
  const operatorSave = await endpointSave("composer-operator-visible", sessions.operator, { fields:{ headline:"Forbidden" }, expectedVersion:7 });
  assert.equal(operatorSave.response.status, 403);
  assert.equal(operatorSave.json.outcome, "unauthorized");

  const viewerRead = await endpointRead("composer-operator-visible", sessions.viewer);
  assert.equal(viewerRead.response.status, 403, "Viewer read follows the existing read_internal policy.");
  const viewerSave = await endpointSave("composer-operator-visible", sessions.viewer, { fields:{ headline:"Forbidden" }, expectedVersion:7 });
  assert.equal(viewerSave.response.status, 403);

  const hiddenRead = await endpointRead("composer-hidden", sessions.operator);
  assert.equal(hiddenRead.response.status, 404);
  assert.equal(hiddenRead.json.outcome, "unavailable");
  assert.equal(hiddenRead.json.post, undefined);
  assert.equal(JSON.stringify(hiddenRead.json).includes("Nondisclosed title"), false);
  const hiddenSave = await endpointSave("composer-hidden", sessions.operator, { fields:{ headline:"Forbidden" }, expectedVersion:7 });
  const guessedSave = await endpointSave("composer-guessed", sessions.operator, { fields:{ headline:"Forbidden" }, expectedVersion:7 });
  assert.equal(hiddenSave.response.status, 403);
  assert.equal(guessedSave.response.status, 403);
  assert.deepEqual(hiddenSave.json, guessedSave.json, "Hidden and guessed save IDs are identityless.");

  const duplicateRead = await endpointRead("composer-duplicate", sessions.owner);
  const duplicateSave = await endpointSave("composer-duplicate", sessions.owner, { fields:{ headline:"No write" }, expectedVersion:7 });
  assert.equal(duplicateRead.response.status, 404);
  assert.equal(duplicateSave.response.status, 404);

  const missingVersion = await endpointSave("composer-operator-visible", sessions.owner, { fields:{ headline:"No version" } });
  assert.equal(missingVersion.response.status, 400);
  assert.equal(missingVersion.json.outcome, "validation_error");
  assert.equal(missingVersion.json.field, "expectedVersion");
  const stale = await endpointSave("composer-owner-visible", sessions.owner, { fields:{ headline:"Stale" }, expectedVersion:7 });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.json.outcome, "conflict");
  assert.equal(stale.json.currentVersion, 8);

  const persisted = JSON.parse(readFileSync(server.dataPath, "utf8"));
  const beforeOwner = endpointState.posts.find((post) => post.id === "composer-owner-visible");
  const afterOwner = persisted.posts.find((post) => post.id === "composer-owner-visible");
  const changedKeys = Object.keys(afterOwner).filter((key) => JSON.stringify(afterOwner[key]) !== JSON.stringify(beforeOwner[key])).sort();
  assert.deepEqual(changedKeys, [...FIELD_KEYS, "_version"].sort(), "Only five shared fields and _version may change.");
  assert.equal(afterOwner._version, beforeOwner._version + 1);
  for (const key of FIELD_KEYS) assert.deepEqual(afterOwner[key], ownerFields[key]);
  const unrelatedBefore = endpointState.posts.filter((post) => post.id !== "composer-owner-visible" && post.id !== "composer-admin-visible");
  const unrelatedAfter = persisted.posts.filter((post) => post.id !== "composer-owner-visible" && post.id !== "composer-admin-visible");
  assert.deepEqual(unrelatedAfter, unrelatedBefore, "Unauthorized, stale, hidden, and duplicate requests leave unrelated Posts unchanged.");
} finally {
  await server.stop();
}

const failingServer = await startPreviewServer({
  seed:{ ...endpointState, posts:[fixturePost("composer-storage-failure")] },
  env:{ COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_OWNER_TOKEN:credentials.owner }
});
const failingDataDirectory = path.dirname(failingServer.dataPath);
try {
  const session = await loginWithCredential(failingServer, credentials.owner);
  const read = await jsonRequest(failingServer.baseUrl, "/api/ui/social/post/composer-storage-failure/composer", { headers:sessionHeaders(session) });
  assert.equal(read.response.status, 200);
  await chmod(failingDataDirectory, 0o500);
  const failure = await jsonRequest(failingServer.baseUrl, "/api/ui/social/post/composer-storage-failure/save", {
    method:"POST", headers:sessionHeaders(session, true), body:JSON.stringify({ fields:{ headline:"Safe failure" }, expectedVersion:7 })
  });
  assert.equal(failure.response.status, 500);
  assert.deepEqual(failure.json, { ok:false, outcome:"recoverable_error", message:"The Post could not be saved. Your edits are still here; try again safely." });
} finally {
  await chmod(failingDataDirectory, 0o700).catch(() => {});
  await failingServer.stop();
}

const flagOffServer = await startPreviewServer({
  seed:{ ...endpointState, posts:[fixturePost("composer-flag-off")] },
  env:{ COMMAND_CENTER_UX_VNEXT:"false", COMMAND_CENTER_REQUIRE_AUTH:"false", COMMAND_CENTER_AUTH_DISABLED:"true" }
});
try {
  await rename(path.dirname(flagOffServer.dataPath), `${path.dirname(flagOffServer.dataPath)}-offline`);
  const read = await jsonRequest(flagOffServer.baseUrl, "/api/ui/social/post/composer-flag-off/composer");
  const save = await jsonRequest(flagOffServer.baseUrl, "/api/ui/social/post/composer-flag-off/save", {
    method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ fields:{ headline:"No write" }, expectedVersion:7 })
  });
  assert.equal(read.response.status, 404);
  assert.equal(read.json.outcome, "not_available");
  assert.equal(save.response.status, 404);
  assert.equal(save.json.outcome, "not_available");
} finally {
  await flagOffServer.stop();
}

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert.match(serverSource, /commandCenterVNextConfig\.enabled/);
assert.match(serverSource, /expectedVersion/);
assert.doesNotMatch(serverSource.slice(serverSource.indexOf("const composerSave"), serverSource.indexOf('url.pathname === "/api/ui/inbox/action"')), /\.find\(\(item\) => item\.id === id\)/);
console.log("PASS test-vnext-post-composer-workspace");

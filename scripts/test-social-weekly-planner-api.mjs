#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handleSocialWeeklyPlannerApiRequest,
  isSocialWeeklyPlannerApiPath,
  SOCIAL_WEEKLY_API_BODY_LIMIT,
  SOCIAL_WEEKLY_API_PREFIX,
  SOCIAL_WEEKLY_API_ROUTES
} from "./social-weekly-planner-api.mjs";

const NOW = "2026-07-21T14:00:00.000Z";
const owner = { authenticated:true, id:"owner-session", role:"owner", label:"Roger" };

function initialState() {
  return {
    posts:[],
    postImages:[],
    brandAssets:[],
    postingKits:[],
    library:[],
    contentBank:[],
    reports:[],
    dataRoomItems:[],
    evidencePackNotes:[],
    approvals:[],
    approvalQueue:[],
    queueItems:[],
    publishEvents:[],
    publishClaims:[],
    socialAccounts:[],
    activityEvents:[],
    auditHistory:[],
    generationBatches:[],
    externalActionOutbox:[],
    settings:{ sourceItems:[], localAssets:[] },
    runtime:{ livePostingGates:{ linkedin:false } }
  };
}

function memoryStore(seed = initialState()) {
  let current = structuredClone(seed);
  const writes = [];
  let reads = 0;
  return {
    async readCollections(collectionNames) {
      reads += 1;
      return Object.fromEntries(collectionNames.map((collection) => [collection, structuredClone(current[collection] ?? [])]));
    },
    async writeCollections(patch) {
      const saved = structuredClone(patch);
      writes.push(saved);
      current = { ...current, ...saved };
    },
    snapshot() { return structuredClone(current); },
    writes() { return structuredClone(writes); },
    reads() { return reads; }
  };
}

function call(options = {}) {
  return handleSocialWeeklyPlannerApiRequest({
    enabled:true,
    method:"GET",
    pathname:SOCIAL_WEEKLY_API_PREFIX,
    searchParams:new URLSearchParams(),
    actor:owner,
    now:NOW,
    ...options
  });
}

function assertCompact(body) {
  assert.equal(Object.prototype.hasOwnProperty.call(body, "state"), false, "HTTP body must not echo state");
  assert.equal(Object.prototype.hasOwnProperty.call(body, "collections"), false, "HTTP body must not expose scoped persistence patches");
}

assert.equal(SOCIAL_WEEKLY_API_BODY_LIMIT, 128 * 1024);
assert.equal(isSocialWeeklyPlannerApiPath(SOCIAL_WEEKLY_API_PREFIX), true);
assert.equal(isSocialWeeklyPlannerApiPath(`${SOCIAL_WEEKLY_API_PREFIX}/posts/example`), true);
assert.equal(isSocialWeeklyPlannerApiPath("/api/ui/social"), false);
assert.deepEqual(SOCIAL_WEEKLY_API_ROUTES, [
  "GET /api/ui/social/weekly?week=YYYY-MM-DD",
  "POST /api/ui/social/weekly",
  "POST /api/ui/social/weekly/posts/:postId",
  "POST /api/ui/social/weekly/posts/:postId/manual-publication",
  "POST /api/ui/social/weekly/posts/:postId/results",
  "POST /api/ui/social/weekly/export"
]);
assert.equal(SOCIAL_WEEKLY_API_ROUTES.some((route) => /\/publish(?:$|\/)/i.test(route)), false, "no posting route is exposed");

{
  const store = memoryStore();
  const unmatched = await call({ pathname:"/api/ui/social" , store });
  assert.deepEqual(unmatched, { matched:false });
  const disabled = await call({ enabled:false, store, searchParams:new URLSearchParams({ week:"2026-07-20" }) });
  assert.equal(disabled.status, 404);
  assert.equal(store.reads(), 0, "disabled route does not read state");
  const unavailablePostingRoute = await call({ method:"POST", pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/example/publish`, store });
  assert.equal(unavailablePostingRoute.status, 404);
  assert.equal(store.reads(), 0, "unknown posting route does not read state");
}

const createInput = {
  requestId:"weekly_api_create_000001",
  week:"2026-07-21",
  objective:"Create qualified Partner conversations from one founder insight.",
  themes:["Founder clarity", "Partner proof"],
  inputs:{
    proof:"A synthetic Partner handoff kept its owner and next step visible.",
    educationalIdea:"Explain how context makes follow-up more useful.",
    cta:"Invite teams to compare operating workflows."
  },
  posts:[{
    title:"A clearer founder follow-up",
    status:"ready",
    shared:{ body:"Useful follow-up starts with useful context." },
    selectedChannels:["linkedin"],
    variants:[{
      channel:"linkedin",
      headline:"Follow-up should preserve context",
      hook:"A task alone is not a relationship system.",
      body:"Keep the conversation, owner, commitment, and next move together so the founder can act without rebuilding context.",
      cta:"What context does your team lose most often?",
      hashtags:["#FounderOps", "#LegalTech"]
    }]
  }]
};

const store = memoryStore();
let postId;

// Create uses one allowlisted scoped write and returns a compact plan, never full state.
{
  const response = await call({
    method:"POST",
    store,
    input:createInput
  });
  assert.equal(response.matched, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.outcome, "saved");
  assert.equal(response.body.externalActions, 0);
  assert.equal(response.body.postingProviderCalls, 0);
  assert.equal(response.body.plan.week.start, "2026-07-20");
  assert.equal(response.body.posts.length, 1);
  postId = response.body.posts[0].id;
  assertCompact(response.body);
  assert.equal(store.writes().length, 1);
  assert.deepEqual(Object.keys(store.writes()[0]).sort(), ["activityEvents", "auditHistory", "posts"]);
  assert.equal(store.snapshot().posts.length, 1);
  assert.equal(store.snapshot().publishEvents.length, 0);
  assert.equal(store.snapshot().publishClaims.length, 0);
  assert.equal(store.snapshot().externalActionOutbox.length, 0);
  assert.deepEqual(store.snapshot().runtime.livePostingGates, { linkedin:false });

  const replay = await call({ method:"POST", store, input:createInput, now:"2026-07-21T14:01:00.000Z" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.outcome, "already_applied");
  assert.equal(store.writes().length, 1, "idempotent replay performs no write");
}

// GET is owner/internal scoped and only accepts one week filter.
{
  const response = await call({ store, searchParams:new URLSearchParams({ week:"2026-07-23" }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.posts.length, 1);
  assert.equal(response.body.capabilities.postAutomatically, false);
  assertCompact(response.body);

  const missing = await call({ store, searchParams:new URLSearchParams() });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.field, "week");
  const extra = await call({ store, searchParams:new URLSearchParams({ week:"2026-07-20", debug:"true" }) });
  assert.equal(extra.status, 400);
  const duplicateParams = new URLSearchParams();
  duplicateParams.append("week", "2026-07-20");
  duplicateParams.append("week", "2026-07-21");
  assert.equal((await call({ store, searchParams:duplicateParams })).status, 400);

  const viewer = await call({ store, actor:{ authenticated:true, id:"viewer-session", role:"viewer" }, searchParams:new URLSearchParams({ week:"2026-07-20" }) });
  assert.equal(viewer.status, 403);
  assert.equal(viewer.body.outcome, "unauthorized");
}

// Update delegates to the established Post variant mutation and persists only the allowlist.
{
  const response = await call({
    method:"POST",
    pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/${encodeURIComponent(postId)}`,
    store,
    now:"2026-07-21T15:00:00.000Z",
    input:{
      requestId:"weekly_api_update_000001",
      expectedVersion:1,
      status:"ready",
      fields:{ body:"A useful founder workbench keeps relationship context beside the next action." },
      selectedChannels:["linkedin"],
      variants:[{
        channel:"linkedin",
        fields:{ body:{ mode:"custom", value:"A useful founder workbench keeps the relationship, commitment, owner, and next action visible in one place." } }
      }]
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.outcome, "saved");
  assert.equal(response.body.post.version, 2);
  assert.equal(response.body.post.status.key, "ready");
  assert.equal(response.body.externalActions, 0);
  assertCompact(response.body);
  assert.deepEqual(Object.keys(store.writes().at(-1)).sort(), ["activityEvents", "auditHistory", "posts"]);
}

// Manual publication records the external fact but the app performs no posting action.
{
  const response = await call({
    method:"POST",
    pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/${encodeURIComponent(postId)}/manual-publication`,
    store,
    now:"2026-07-21T16:00:00.000Z",
    input:{
      requestId:"weekly_api_manual_000001",
      expectedVersion:2,
      channel:"linkedin",
      publishedUrl:"https://www.linkedin.com/posts/synthetic-api-weekly"
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.outcome, "recorded");
  assert.equal(response.body.allPlatformsRecorded, true);
  assert.equal(response.body.post.status.key, "needs_results");
  assert.equal(response.body.externalActions, 0);
  assert.equal(response.body.postingProviderCalls, 0);
  assertCompact(response.body);
  const persisted = store.snapshot();
  assert.equal(persisted.publishEvents.length, 0);
  assert.equal(persisted.publishClaims.length, 0);
  assert.equal(persisted.externalActionOutbox.length, 0);
  assert.equal(persisted.activityEvents[0].metadata.postedByApplication, false);
}

// Results remain a normal scoped Post update.
{
  const response = await call({
    method:"POST",
    pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/${encodeURIComponent(postId)}/results`,
    store,
    now:"2026-07-23T14:00:00.000Z",
    input:{
      requestId:"weekly_api_results_00001",
      expectedVersion:3,
      impressions:900,
      likes:31,
      comments:4,
      clicks:12
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.post.status.key, "published_manually");
  assert.equal(response.body.externalActions, 0);
  assertCompact(response.body);
  assert.equal(store.snapshot().posts[0].performance.impressions, 900);
}

// Export is read-only, returns founder-facing content, and never exposes state.
{
  const writesBefore = store.writes().length;
  const response = await call({
    method:"POST",
    pathname:`${SOCIAL_WEEKLY_API_PREFIX}/export`,
    store,
    now:"2026-07-23T14:01:00.000Z",
    input:{ week:"2026-07-20", format:"markdown" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.outcome, "exported");
  assert.equal(response.body.filename, "social-plan-2026-07-20.md");
  assert.match(response.body.content, /^# Social plan/);
  assert.match(response.body.content, /### LinkedIn/);
  assert.equal(response.body.externalActions, 0);
  assert.equal(response.body.postingProviderCalls, 0);
  assertCompact(response.body);
  assert.equal(store.writes().length, writesBefore, "export does not write");
  for (const forbidden of ["livePostingGates", "publishClaims", "externalActionOutbox", "providerPayload"]) {
    assert.doesNotMatch(JSON.stringify(response.body), new RegExp(forbidden, "i"));
  }
}

// Method, query, path, validation, and persistence failures fail closed.
{
  const writesBefore = store.writes().length;
  const method = await call({ method:"GET", pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/${encodeURIComponent(postId)}`, store });
  assert.equal(method.status, 405);
  const query = await call({ method:"POST", pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/${encodeURIComponent(postId)}`, searchParams:new URLSearchParams({ force:"true" }), store, input:{} });
  assert.equal(query.status, 400);
  const malformed = await call({ method:"POST", pathname:`${SOCIAL_WEEKLY_API_PREFIX}/posts/%E0%A4%A`, store, input:{} });
  assert.equal(malformed.status, 400);
  assert.equal(store.writes().length, writesBefore);

  const noWriteStore = {
    async readCollections(collectionNames) {
      const state = initialState();
      return Object.fromEntries(collectionNames.map((collection) => [collection, structuredClone(state[collection] ?? [])]));
    }
  };
  const unavailable = await call({ method:"POST", store:noWriteStore, input:{ ...createInput, requestId:"weekly_no_store_write_001" } });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.outcome, "unavailable");
  assertCompact(unavailable.body);
}

// Structural proof: adapter has no posting/provider adapter and can only write allowlisted collections.
{
  const source = readFileSync(new URL("./social-weekly-planner-api.mjs", import.meta.url), "utf8");
  for (const required of ["writeCollections", '"posts"', '"activityEvents"', '"auditHistory"']) assert.match(source, new RegExp(required));
  for (const forbidden of ["writeState(", "publishSocialPost(", "publishChannel(", "runPublishing(", "scheduleSocialPost(", "fetch(", "socialAccounts", "publishEvents", "publishClaims", "externalActionOutbox"]) {
    assert.equal(source.includes(forbidden), false, `weekly HTTP adapter must not contain ${forbidden}`);
  }
}

console.log("social weekly planner API tests passed");

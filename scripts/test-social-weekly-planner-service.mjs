#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWeeklySocialPlan,
  createWeeklySocialPlan,
  exportWeeklySocialPlan,
  recordWeeklySocialPublication,
  recordWeeklySocialResults,
  socialWeekRange,
  SocialWeeklyPlannerError,
  socialWeeklyPlannerSafeError,
  updateWeeklySocialPost
} from "./social-weekly-planner-service.mjs";

const NOW = "2026-07-21T14:00:00.000Z";
const actor = { authenticated:true, id:"owner-session", role:"owner", label:"Roger" };

function state() {
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
    runtime:{ livePostingGates:{ linkedin:false, instagram:false, facebook:false, x:false, threads:false } }
  };
}

const input = {
  requestId:"weekly_plan_request_000001",
  week:"2026-07-21",
  objective:"Turn founder operating insight into qualified Partner conversations.",
  themes:["Founder operations", "Partner proof"],
  inputs:{
    proof:"A synthetic Partner pilot reduced follow-up ambiguity.",
    announcement:"The founder workbench is ready for internal review.",
    customerInsight:"Customers need a visible next step.",
    partnerStory:"A community organization asked for a clearer handoff.",
    educationalIdea:"Explain why operational clarity improves access.",
    cta:"Invite Partner teams to compare workflows."
  },
  posts:[
    {
      title:"What a four-hour founder day needs",
      status:"ready",
      shared:{
        headline:"A calmer operating day",
        body:"A founder should be able to see the next move without rebuilding context.",
        hook:"Four hours requires sharper choices.",
        cta:"Compare your workflow.",
        hashtags:["#FounderOps", "#LegalEase"]
      },
      selectedChannels:["linkedin", "instagram"],
      variants:[
        {
          channel:"linkedin",
          headline:"The four-hour founder operating system",
          hook:"Being busy is not the same as moving the business.",
          body:"A useful founder dashboard should surface commitments, relationships, and the next revenue move in one calm view.",
          cta:"What would you remove from your operating day?",
          hashtags:["#FounderOps", "#LegalTech"]
        },
        {
          channel:"instagram",
          headline:"Less context switching. More progress.",
          hook:"The goal is a calmer founder day.",
          body:"See the next move. Finish it in context. Keep the relationship history attached.",
          cta:"Save this for your next weekly reset.",
          hashtags:["#BuildInPublic", "#LegalEase"]
        }
      ]
    },
    {
      title:"A Partner handoff should keep its context",
      status:"drafting",
      shared:{ body:"A relationship should not lose its history when the next action changes." },
      platforms:["facebook", "x", "threads"],
      variants:[
        { channel:"facebook", body:"Partnership work moves faster when the decision, owner, and next follow-up stay together." },
        { channel:"x", body:"A next action without relationship context is just another loose task." },
        { channel:"threads", body:"The best follow-up system keeps the conversation and commitment beside the task." }
      ]
    }
  ]
};

assert.deepEqual(socialWeekRange("2026-07-21"), {
  start:"2026-07-20",
  end:"2026-07-26",
  id:"social-week-2026-07-20"
});

let created;
{
  const initial = state();
  const before = structuredClone(initial);
  created = createWeeklySocialPlan(initial, actor, input, { now:NOW });
  assert.equal(created.ok, true);
  assert.equal(created.externalActions, 0);
  assert.equal(created.alreadyExisted, false);
  assert.equal(created.state.posts.length, 2);
  assert.equal(created.plan.week.start, "2026-07-20");
  assert.equal(created.plan.objective, input.objective);
  assert.deepEqual(created.plan.themes, input.themes);
  assert.equal(created.plan.counts.ready, 1);
  assert.equal(created.plan.counts.drafting, 1);
  assert.equal(created.plan.safety.automaticPosting, false);
  assert.equal(created.plan.safety.providerCalls, 0);
  assert.deepEqual(Object.keys(created.collections).sort(), ["activityEvents", "auditHistory", "posts"]);
  assert.deepEqual(initial, before, "weekly planning must not mutate its input state");
  assert.deepEqual(created.state.publishEvents, before.publishEvents);
  assert.deepEqual(created.state.publishClaims, before.publishClaims);
  assert.deepEqual(created.state.externalActionOutbox, before.externalActionOutbox);
  assert.deepEqual(created.state.runtime, before.runtime);
  assert.equal(created.state.posts.some((post) => post.scheduledFor), false);
  assert.equal(created.state.posts.some((post) => post.liveMode), false);
  const firstPost = created.state.posts.find((post) => post.weeklyPlanPostIndex === 0);
  assert.equal(firstPost.channelVariants.length, 2);
  assert.notEqual(firstPost.channelVariants[0].body, firstPost.channelVariants[1].body);
  assert.equal(firstPost.contentType, "weekly_social_plan");

  const replay = createWeeklySocialPlan(created.state, actor, input, { now:"2026-07-21T14:01:00.000Z" });
  assert.equal(replay.alreadyExisted, true);
  assert.deepEqual(replay.collections, {});
  assert.strictEqual(replay.state, created.state);
}

// The projection reuses the canonical channel-variant model and exports only founder-facing copy.
{
  const view = buildWeeklySocialPlan(created.state, actor, "2026-07-24", { now:NOW });
  assert.equal(view.posts.length, 2);
  assert.deepEqual(view.posts[0].selectedChannels.map((item) => item.key), ["linkedin", "instagram"]);
  assert.equal(view.posts[0].independentlyEdited, true);
  assert.match(view.copyAllText, /LinkedIn/);
  assert.match(view.copyAllText, /Instagram/);
  assert.match(view.copyAllText, /Threads/);
  const markdown = exportWeeklySocialPlan(view, "markdown");
  assert.match(markdown, /^# Social plan/);
  assert.match(markdown, /## What a four-hour founder day needs/);
  const json = JSON.parse(exportWeeklySocialPlan(view, "json"));
  assert.equal(json.posts.length, 2);
  assert.equal("id" in json.posts[0], false, "export omits internal record identifiers");
  assert.equal(exportWeeklySocialPlan(view, "text"), view.copyAllText);
  for (const forbidden of ["livePostingGates", "publishClaims", "externalActionOutbox", "sourceCollection", "providerPayload"]) {
    assert.doesNotMatch(markdown, new RegExp(forbidden, "i"));
    assert.doesNotMatch(JSON.stringify(json), new RegExp(forbidden, "i"));
  }
}

let updated;
{
  const post = created.state.posts.find((item) => item.weeklyPlanPostIndex === 0);
  updated = updateWeeklySocialPost(created.state, actor, post.id, {
    requestId:"weekly_update_request_0001",
    expectedVersion:1,
    status:"ready",
    fields:{ body:"The weekly operating system should preserve context and make the next move obvious." },
    selectedChannels:["linkedin", "instagram"],
    variants:[
      { channel:"linkedin", fields:{ body:{ mode:"custom", value:"A founder workbench earns its keep when every decision and relationship has a visible next move." } } },
      { channel:"instagram", fields:{ body:{ mode:"custom", value:"One calm screen. One clear next move. Less founder context switching." } } }
    ]
  }, { now:"2026-07-21T15:00:00.000Z" });
  assert.equal(updated.ok, true);
  assert.equal(updated.externalActions, 0);
  assert.equal(updated.post.version, 2);
  assert.equal(updated.post.status.key, "ready");
  assert.equal(updated.post.independentlyEdited, true);
  assert.equal(updated.state.posts.find((item) => item.id === post.id).body, "The weekly operating system should preserve context and make the next move obvious.");
  assert.equal(updated.state.publishEvents.length, 0);

  assert.throws(() => updateWeeklySocialPost(created.state, actor, post.id, {
    requestId:"weekly_duplicate_copy_001",
    expectedVersion:1,
    status:"ready",
    selectedChannels:["linkedin", "instagram"],
    variants:[
      { channel:"linkedin", fields:{ body:{ mode:"custom", value:"Identical platform copy." } } },
      { channel:"instagram", fields:{ body:{ mode:"custom", value:"Identical platform copy." } } }
    ]
  }, { now:"2026-07-21T15:01:00.000Z" }), /independently edited copy/);
}

let firstPublication;
let allPublished;
{
  const post = updated.state.posts.find((item) => item.weeklyPlanPostIndex === 0);
  firstPublication = recordWeeklySocialPublication(updated.state, actor, post.id, {
    requestId:"weekly_manual_publish_0001",
    expectedVersion:2,
    channel:"linkedin",
    publishedUrl:"https://www.linkedin.com/posts/synthetic-weekly-one"
  }, { now:"2026-07-21T16:00:00.000Z" });
  assert.equal(firstPublication.externalActions, 0);
  assert.equal(firstPublication.allPlatformsRecorded, false);
  assert.equal(firstPublication.post.status.key, "ready");
  assert.equal(firstPublication.post.publication.channels.find((item) => item.channel === "linkedin").url, "https://www.linkedin.com/posts/synthetic-weekly-one");
  assert.equal(firstPublication.state.publishEvents.length, 0);

  allPublished = recordWeeklySocialPublication(firstPublication.state, actor, post.id, {
    requestId:"weekly_manual_publish_0002",
    expectedVersion:3,
    channel:"instagram",
    publishedUrl:"https://www.instagram.com/p/synthetic-weekly-one"
  }, { now:"2026-07-21T16:05:00.000Z" });
  assert.equal(allPublished.allPlatformsRecorded, true);
  assert.equal(allPublished.post.status.key, "needs_results");
  assert.equal(allPublished.state.posts.find((item) => item.id === post.id).status, "manually_posted");
  assert.equal(allPublished.state.activityEvents[0].metadata.postedByApplication, false);
  assert.equal(allPublished.state.activityEvents[0].metadata.postingProviderCalled, false);
  assert.equal(allPublished.state.publishEvents.length, 0);
  assert.equal(allPublished.state.externalActionOutbox.length, 0);
}

{
  const post = allPublished.state.posts.find((item) => item.weeklyPlanPostIndex === 0);
  const results = recordWeeklySocialResults(allPublished.state, actor, post.id, {
    requestId:"weekly_results_request_0001",
    expectedVersion:4,
    impressions:1250,
    likes:42,
    comments:7,
    clicks:19,
    engagementRate:5.44
  }, { now:"2026-07-23T14:00:00.000Z" });
  assert.equal(results.externalActions, 0);
  assert.equal(results.post.status.key, "published_manually");
  assert.equal(results.state.posts.find((item) => item.id === post.id).performance.impressions, 1250);
  const view = buildWeeklySocialPlan(results.state, actor, "2026-07-20", { now:"2026-07-23T14:01:00.000Z" });
  assert.equal(view.counts.published_manually, 1);
}

// Validation and authorization stay narrow and founder-safe.
{
  assert.throws(() => createWeeklySocialPlan(state(), actor, { ...input, requestId:"weekly_too_many_themes_1", themes:["One", "Two", "Three", "Four"] }, { now:NOW }), /one to three themes/i);
  const viewer = { authenticated:true, id:"viewer-session", role:"viewer" };
  assert.throws(() => createWeeklySocialPlan(state(), viewer, input, { now:NOW }), (error) => error instanceof SocialWeeklyPlannerError && error.status === 403);
  assert.throws(() => buildWeeklySocialPlan(state(), { authenticated:false }, "2026-07-20", { now:NOW }), (error) => error.status === 401);
  const safe = socialWeeklyPlannerSafeError(new SocialWeeklyPlannerError("The Post changed. Refresh and try again.", 409, "version_conflict"));
  assert.equal(safe.status, 409);
  assert.equal(safe.body.outcome, "version_conflict");
}

// Structural proof: the planner never invokes posting, scheduling, generation, or provider APIs.
{
  const source = readFileSync(new URL("./social-weekly-planner-service.mjs", import.meta.url), "utf8");
  for (const forbidden of ["publishSocialPost(", "publishChannel(", "runPublishing(", "scheduleSocialPost(", "imagegen", "LIVE_POSTING_ENABLED", "fetch("]) {
    assert.equal(source.includes(forbidden), false, `weekly planner must not contain ${forbidden}`);
  }
}

console.log("social weekly planner service tests passed");

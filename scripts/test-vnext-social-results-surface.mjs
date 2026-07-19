#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildSocialResultsView } from "./ui/view-models/social-results.mjs";

const NOW = "2026-07-19T12:00:00.000Z";
const actor = { authenticated:true, role:"owner", id:"synthetic-owner" };
const post = {
  id:"surface-result-01", title:"Know your next legal step", body:"Read the guide.", topic:"Legal education", theme:"Know Your Options",
  campaignId:"campaign-01", selectedTemplateId:"template-01", targetChannels:["linkedin", "facebook"], approvalStatus:"approved", approvalRevision:"surface-result-01-rev-1",
  publishAttempts:[], performance:{ impressions:0, likes:12 }, performanceUpdatedAt:NOW
};
const state = {
  posts:[post],
  publishEvents:[
    { id:"event-linkedin", postId:post.id, approvalRevision:post.approvalRevision, channel:"linkedin", eventType:"published", publishedAt:"2026-07-19T10:00:00.000Z", publishedUrl:"https://example.com/linkedin/result" },
    { id:"event-facebook-failed", postId:post.id, approvalRevision:post.approvalRevision, channel:"facebook", eventType:"failed", publishedAt:"2026-07-19T10:01:00.000Z", publishedUrl:"https://example.com/facebook/failed" }
  ], publishClaims:[], campaigns:[{ id:"campaign-01", name:"Education campaign" }], generationProfiles:[{ id:"template-01", profileName:"Guide", category:"Education", defaultDisclaimerId:"disclaimer-01", active:true }],
  library:[{ id:"disclaimer-01", category:"disclaimer", title:"Synthetic information disclaimer", body:"Synthetic information only.", status:"approved" }],
  dataRoomItems:[{ id:"proof-01", name:"Reviewed source", postId:post.id }], reports:[], evidencePackNotes:[], socialAccounts:[{ id:"account-linkedin", platform:"linkedin", connected:true }], settings:{ sourceItems:[], localAssets:[] }, runtime:{ livePostingGates:{ linkedin:true } }
};

const view = buildSocialResultsView(state, actor, NOW);
assert.equal(view.items.length, 1, "only the explicit successful channel should project");
assert.equal(view.items[0].channel, "linkedin");
assert.equal(view.items[0].metrics.impressions, 0, "explicit zero remains zero");
assert.equal(view.items[0].metrics.comments, null, "missing metrics remain unavailable");
assert.equal(view.items[0].metricAvailability.key, "partial");
assert.equal(view.items[0].reuse.executable, false);
assert.equal(view.summaries.publishedResultCount, 1);
assert.equal(view.pagination.limit, 24);
assert.equal(view.filters.metrics.find((item) => item.key === "available").count, 1);

const [surface, shell, roles, server, packageJson] = await Promise.all([
  readFile(new URL("./ui/pages/social-results.mjs", import.meta.url), "utf8"),
  readFile(new URL("./ui/pages/social-home.mjs", import.meta.url), "utf8"),
  readFile(new URL("./roles.mjs", import.meta.url), "utf8"),
  readFile(new URL("./preview-server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8")
]);
assert.match(surface, /\/api\/ui\/social\/results/);
assert.match(surface, /#queue\?view=results/);
assert.match(surface, /Clear filters/);
assert.match(surface, /Load more/);
assert.match(shell, /routeState\(\)\.view === "results"/);
assert.match(roles, /path === "\/api\/ui\/social\/results"/);
assert.match(server, /buildSocialResultsView/);
assert.equal(JSON.parse(packageJson).scripts["test:vnext-social-results-surface"], "node scripts/test-vnext-social-results-surface.mjs");

console.log("PASS test-vnext-social-results-surface");
console.log(JSON.stringify({ endpoint:"/api/ui/social/results", results:view.items.length, projectedChannels:view.items.map((item) => item.channel), mutations:0, providerCalls:0 }));

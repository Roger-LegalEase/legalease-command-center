#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Auth note: static x-command-center-token API auth was removed in PR #110 (sessions only).
// Like test-publish-now-live-gate.mjs, this test runs the server in local-operator mode
// (auth not required → requests act as the local owner, CSRF-exempt); sessions and CSRF are
// covered by the dedicated auth suites. No production auth behavior is bypassed or changed.
const rootDir = process.cwd();
const source = readFileSync(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");
const port = Number(process.env.TEST_SCHEDULED_PUBLISHING_PORT || 3491);
const baseUrl = `http://127.0.0.1:${port}`;
const encryptionKey = "scheduled-publishing-encryption-key-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-scheduled-publishing-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

const dueTime = "2026-01-01T09:00";
const futureTime = "2099-01-01T09:00";

const basePost = {
  title:"Scheduled trust update",
  hook:"LegalEase update",
  body:"Record clearing work is moving forward with partner review.",
  cta:"Follow along for the next step.",
  hashtags:["#LegalEase"],
  platform:"linkedin",
  targetChannels:["linkedin", "x"],
  complianceRisk:"low",
  imageIntentionallyOmitted:true,
  imageFinalized:true,
  finalPreviewConfirmed:true,
  copyReviewed:true,
  channelAdaptations:{
    linkedin:{ text:"LegalEase update\\n\\nRecord clearing work is moving forward with partner review." },
    x:{ text:"Record clearing work is moving forward with partner review." }
  }
};

const seedState = {
  settings:{},
  contentBank:[],
  postImages:[],
  publishEvents:[],
  activityEvents:[],
  auditHistory:[],
  posts:[
    { id:"post-draft", ...basePost, status:"draft", scheduledFor:"" },
    { id:"post-approved", ...basePost, status:"approved", scheduledFor:"" },
    { id:"post-long-x", ...basePost, status:"approved", scheduledFor:"", channelAdaptations:{ ...basePost.channelAdaptations, x:{ text:"x".repeat(281) } } }
  ],
  socialAccounts:[
    {
      id:"channel-linkedin",
      platform:"linkedin",
      status:"connected",
      displayName:"LinkedIn",
      accountName:"Roger LinkedIn",
      accountId:"linkedin-owner",
      externalAccountId:"linkedin-owner",
      accessTokenEncrypted:"test-encrypted-linkedin-token",
      connectedAt:"2026-01-01T00:00:00.000Z",
      oauthConfigured:true
    },
    {
      id:"channel-x",
      platform:"x",
      status:"connected",
      displayName:"Twitter / X",
      accountName:"Roger X",
      accountId:"x-owner",
      externalAccountId:"x-owner",
      accessTokenEncrypted:"test-encrypted-x-token",
      connectedAt:"2026-01-01T00:00:00.000Z",
      oauthConfigured:true
    }
  ],
  soc2AuditLogs:[]
};

await writeFile(seedPath, JSON.stringify(seedState, null, 2));

assert(source.includes("Schedule Post"), "Queue should expose Schedule Post copy");
for (const forbidden of ["Post Now", "Publish Now", "Tweet Now", "Send to X", "Send to LinkedIn"]) {
  assert(!source.includes(`>${forbidden}<`), `normal UI should not expose ${forbidden} button labels`);
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server: ${logs}`);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers:{
      "content-type":"application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function postFromState(state, id) {
  return (state.posts || []).find(post => post.id === id);
}

function channelStatus(post, channel) {
  return post.per_channel_publish_status?.[channel] || post.perChannelPublishStatus?.[channel] || "";
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: rootDir,
  env:{
    ...process.env,
    PORT:String(port),
    COMMAND_CENTER_REQUIRE_AUTH:"false",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_SEED_PATH:seedPath,
    OAUTH_TOKEN_ENCRYPTION_KEY:encryptionKey,
    LINKEDIN_CLIENT_ID:"scheduled-linkedin-client",
    LINKEDIN_CLIENT_SECRET:"scheduled-linkedin-secret",
    LINKEDIN_REDIRECT_URI:`${baseUrl}/api/linkedin/callback`,
    X_CLIENT_ID:"scheduled-x-client",
    X_CLIENT_SECRET:"scheduled-x-secret",
    X_REDIRECT_URI:`${baseUrl}/api/x/callback`,
    LINKEDIN_MOCK_POSTING_ENABLED:"true",
    X_MOCK_POSTING_ENABLED:"true",
    LINKEDIN_LIVE_POSTING_ENABLED:"false",
    ENABLE_LIVE_LINKEDIN_POSTING:"false",
    ENABLE_LIVE_X_POSTING:"false",
    ENABLE_LIVE_TWITTER_POSTING:"false",
    NODE_ENV:"test",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const draftSchedule = await api("/api/posts/schedule", {
    method:"POST",
    body:JSON.stringify({ id:"post-draft", scheduledFor:futureTime, targetChannels:["linkedin"] })
  });
  assert.equal(draftSchedule.response.status, 200, "draft scheduling request should return safe state instead of crashing");
  const draft = postFromState(draftSchedule.payload.state, "post-draft");
  assert.equal(draft.status, "draft", "unapproved posts should not be scheduled");
  assert.match(draft.publishErrorSummary, /approve/i, "unapproved scheduling should explain approval is required");

  const longXSchedule = await api("/api/posts/schedule", {
    method:"POST",
    body:JSON.stringify({ id:"post-long-x", scheduledFor:futureTime, targetChannels:["x"] })
  });
  assert.equal(longXSchedule.response.status, 200, "overlong X scheduling request should fail safely");
  const longXPost = postFromState(longXSchedule.payload.state, "post-long-x");
  assert.notEqual(longXPost.status, "scheduled", "overlong X posts should not be scheduled");
  assert.match(longXPost.publishErrorSummary, /over 280/i, "X character validation should block scheduling");

  const scheduled = await api("/api/posts/schedule", {
    method:"POST",
    body:JSON.stringify({ id:"post-approved", scheduledFor:dueTime, targetChannels:["linkedin", "x"] })
  });
  assert.equal(scheduled.response.status, 200, "approved post should be schedulable");
  let scheduledPost = postFromState(scheduled.payload.state, "post-approved");
  assert.equal(scheduledPost.status, "scheduled", "approved post should become scheduled");
  assert.equal(scheduledPost.post_status, "Scheduled", "scheduled post should store founder-facing post_status");
  assert.deepEqual(scheduledPost.targetChannels, ["linkedin", "x"], "post should keep selected target channels");
  assert.equal(channelStatus(scheduledPost, "linkedin"), "scheduled", "LinkedIn per-channel status should be scheduled");
  assert.equal(channelStatus(scheduledPost, "x"), "scheduled", "X per-channel status should be scheduled");

  const blockedRun = await api("/api/publishing/run", { method:"POST", body:"{}" });
  assert.equal(blockedRun.response.status, 200, "publishing runner should complete safely with gates off");
  scheduledPost = postFromState(blockedRun.payload.state, "post-approved");
  assert.equal(scheduledPost.status, "scheduled", "gate-blocked posts should remain scheduled for a future safe run");
  assert.equal(channelStatus(scheduledPost, "linkedin"), "blocked", "LinkedIn should be blocked while live gate is off");
  assert.equal(channelStatus(scheduledPost, "x"), "blocked", "X should be blocked while live gate is off");
  assert.match(scheduledPost.per_channel_failure_reason.linkedin, /live posting is disabled/i, "LinkedIn gate block should be logged safely");
  assert.match(scheduledPost.per_channel_failure_reason.x, /live posting is disabled/i, "X gate block should be logged safely");
  assert.equal(blockedRun.payload.results.length, 1, "one due post should be processed");
  assert.deepEqual(blockedRun.payload.results[0].channels.map(item => item.channel), ["linkedin", "x"], "runner should evaluate both target channels");

  child.kill("SIGTERM");
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
}

const liveChild = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: rootDir,
  env:{
    ...process.env,
    PORT:String(port + 1),
    COMMAND_CENTER_REQUIRE_AUTH:"false",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_SEED_PATH:seedPath,
    OAUTH_TOKEN_ENCRYPTION_KEY:encryptionKey,
    LINKEDIN_CLIENT_ID:"scheduled-linkedin-client",
    LINKEDIN_CLIENT_SECRET:"scheduled-linkedin-secret",
    LINKEDIN_REDIRECT_URI:`${baseUrl}/api/linkedin/callback`,
    X_CLIENT_ID:"scheduled-x-client",
    X_CLIENT_SECRET:"scheduled-x-secret",
    X_REDIRECT_URI:`${baseUrl}/api/x/callback`,
    LINKEDIN_MOCK_POSTING_ENABLED:"true",
    X_MOCK_POSTING_ENABLED:"true",
    LINKEDIN_LIVE_POSTING_ENABLED:"false",
    ENABLE_LIVE_LINKEDIN_POSTING:"true",
    ENABLE_LIVE_X_POSTING:"true",
    NODE_ENV:"test",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  const liveBase = `http://127.0.0.1:${port + 1}`;
  await waitForServer(liveChild);
  const liveApi = async (pathname, options = {}) => {
    const response = await fetch(`${liveBase}${pathname}`, {
      ...options,
      headers:{
        "content-type":"application/json",
        ...(options.headers || {})
      }
    });
    return { response, payload:await response.json().catch(() => ({})) };
  };

  const liveRun = await liveApi("/api/publishing/run", { method:"POST", body:"{}" });
  assert.equal(liveRun.response.status, 200, "publishing runner should process due posts with gates enabled");
  let posted = postFromState(liveRun.payload.state, "post-approved");
  assert.equal(posted.status, "posted", "post should move to Posted after all target channels succeed");
  assert.equal(posted.post_status, "Posted", "posted state should store founder-facing post_status");
  assert.equal(channelStatus(posted, "linkedin"), "posted", "LinkedIn should be posted");
  assert.equal(channelStatus(posted, "x"), "posted", "X should be posted");
  assert.equal(posted.per_channel_external_post_id.linkedin, "mock-linkedin-post-approved", "LinkedIn external id should be stored per channel");
  assert.equal(posted.per_channel_external_post_id.x, "mock-x-post-approved", "X external id should be stored per channel");
  assert.ok(Array.isArray(posted.publish_attempts) && posted.publish_attempts.length >= 4, "publish attempts should include blocked and posted attempts");
  assert.ok(posted.posted_at, "posted_at should be stored");

  const duplicateRun = await liveApi("/api/publishing/run", { method:"POST", body:"{}" });
  assert.equal(duplicateRun.response.status, 200, "publishing runner should be idempotent");
  assert.equal(duplicateRun.payload.results.length, 0, "already posted channels should not publish again");
  posted = postFromState(duplicateRun.payload.state, "post-approved");
  const postedAttempts = (posted.publish_attempts || []).filter(attempt => attempt.status === "posted");
  assert.equal(postedAttempts.length, 2, "duplicate publish should not add new posted attempts");

  // /api/health is a bare {status:"ok"} now; gate visibility and the no-secrets guarantee
  // live on /api/version.
  const health = await fetch(`${liveBase}/api/health`);
  const healthJson = await health.json();
  assert.equal(healthJson.status, "ok", "health should report ok");
  const version = await fetch(`${liveBase}/api/version`);
  const versionJson = await version.json();
  assert.equal(versionJson.liveGatesCount, 2, "version should count enabled live gates only");
  const versionText = JSON.stringify(versionJson);
  assert.ok(!versionText.includes("scheduled-publishing-encryption-key"), "version must not expose token encryption settings");
  assert.ok(!versionText.includes("test-encrypted"), "version must not expose token values");
} finally {
  liveChild.kill("SIGTERM");
}

console.log("scheduled publishing tests passed.");

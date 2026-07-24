#!/usr/bin/env node
// Publish Now live-gate tests — the manual publishPostNow path must enforce
// livePostingEnabledForChannel exactly like the scheduled publisher (runPublishingWorker):
// blocked with errorCode "live_gate_disabled" while the channel's env flag is off, allowed
// when it is on. Closes the e620bde audit gap recorded in
// docs/founder-os/evidence/publish-now-gate-review.md.
//
// Layers under test:
//   1. Source order — the gate call sits before the publish claim and the provider call.
//   2. Behavior — publishPostNow runs in a vm sandbox (the same extraction pattern as
//      test-social-guidelines-gate.mjs) with stubbed collaborators and the REAL
//      livePostingEnvKeys/livePostingEnabledForChannel code, off and on.
//   3. HTTP — the auth-endpoint-hardening layer refuses POST /api/posts/{id}/publish-now
//      outright today; if that shield is ever relaxed, layer 2 is what still blocks per channel.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const rootDir = process.cwd();
const source = readFileSync(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");

// --- Layer 1: source order -------------------------------------------------------------------
const publishNowStart = source.indexOf("async function publishPostNow(");
assert(publishNowStart >= 0, "publishPostNow should exist");
const publishNowEnd = source.indexOf("\nasync function ", publishNowStart + 1);
const publishNowBlock = source.slice(publishNowStart, publishNowEnd);
const gateIndex = publishNowBlock.indexOf("livePostingEnabledForChannel(");
const claimIndex = publishNowBlock.indexOf("acquireSocialPublishClaim(");
const providerIndex = publishNowBlock.indexOf("publishToChannel(");
assert(gateIndex >= 0, "publishPostNow should call livePostingEnabledForChannel");
assert(claimIndex >= 0 && providerIndex >= 0, "publishPostNow should still claim and publish");
assert(gateIndex < claimIndex && gateIndex < providerIndex, "live gate must run before the publish claim and the provider call");
assert(publishNowBlock.includes('"live_gate_disabled"'), "publishPostNow gate block should use the scheduled publisher errorCode");

// --- Layer 2: behavior in a vm sandbox -------------------------------------------------------
const gateStart = source.indexOf("const livePostingEnvKeys = {");
const gateEnd = source.indexOf("function liveGateSummary");
assert(gateStart >= 0 && gateEnd > gateStart, "livePostingEnvKeys block should exist");
const liveGateBlock = source.slice(gateStart, gateEnd);

function basePost() {
  return {
    id: "post-1",
    title: "Publish Now trust update",
    platform: "linkedin",
    targetChannels: ["linkedin"],
    status: "approved",
    publishAttemptCount: 0
  };
}

function makeHarness(env) {
  const calls = { provider: [], events: [], patches: [], claimTransitions: [], claimsAcquired: 0 };
  const state = { posts: [basePost()] };
  const context = {
    Date,
    process: { env },
    console,
    store: {
      readState: async () => state,
      updatePost: async (id, patch) => {
        calls.patches.push({ id, ...patch });
        Object.assign(state.posts.find((post) => post.id === id), patch);
        return state;
      }
    },
    publishReadiness: () => ({ ok: true }),
    recordPublishEvent: async (event) => {
      calls.events.push({ eventType: event.eventType, errorCode: event.errorCode || "" });
      return state;
    },
    acquireSocialPublishClaim: async () => {
      calls.claimsAcquired += 1;
      return { claimed: true, claim: { id: "claim-1" } };
    },
    transitionSocialPublishClaim: async (storeRef, claimId, status) => {
      calls.claimTransitions.push(status);
    },
    incrementSecurityMetric: async () => {},
    auditService: { append: async () => {} },
    publishToChannel: async ({ channel }) => {
      calls.provider.push(channel);
      return { externalPostId: "ext-1", externalPostUrl: "https://example.com/ext-1", message: "Published." };
    },
    safeProviderReference: (value) => value,
    safeSocialError: (channel, error) => error.message,
    channelLabels: { linkedin: "LinkedIn" }
  };
  vm.createContext(context);
  vm.runInContext(liveGateBlock, context);
  vm.runInContext(publishNowBlock, context);
  assert.equal(typeof context.publishPostNow, "function", "publishPostNow should load in the sandbox");
  return { publishPostNow: context.publishPostNow, calls, state };
}

// Gate OFF (even with a DIFFERENT channel's gate on — the exact hole from the audit):
{
  const { publishPostNow, calls, state } = makeHarness({ ENABLE_LIVE_X_POSTING: "true" });
  await assert.rejects(
    () => publishPostNow("post-1", { actor: { id: "owner" }, requestId: "req-1" }),
    (error) => {
      assert.match(error.message, /live posting is disabled/i, "block message should explain the live gate");
      assert.equal(error.errorCode, "live_gate_disabled", "error should carry the scheduled publisher errorCode");
      assert.equal(error.readiness?.status, "blocked_live_gate", "readiness detail should mark the live-gate block");
      return true;
    }
  );
  assert.equal(calls.provider.length, 0, "the provider must never be called while the channel gate is off");
  assert.equal(calls.claimsAcquired, 0, "no publish claim may be acquired while the channel gate is off");
  const post = state.posts[0];
  assert.equal(post.status, "approved", "gate-blocked post should keep its approved status");
  assert.equal(post.publishingStatus, "blocked_live_gate", "gate-blocked post should record blocked_live_gate");
  assert.match(post.publishErrorSummary, /live posting is disabled/i, "gate block should be logged on the post");
  const gateEvents = calls.events.filter((event) => event.errorCode === "live_gate_disabled");
  assert.equal(gateEvents.length, 1, "one live_gate_disabled publish event should be recorded");
  assert.equal(gateEvents[0].eventType, "blocked", "the live-gate event should be a blocked event");
}

// Gate ON for the post's channel: publish proceeds to the provider.
{
  const { publishPostNow, calls, state } = makeHarness({ ENABLE_LIVE_LINKEDIN_POSTING: "true" });
  const outcome = await publishPostNow("post-1", { actor: { id: "owner" }, requestId: "req-2" });
  assert.equal(outcome.result.externalPostId, "ext-1", "publish result should surface the provider id");
  assert.deepEqual(calls.provider, ["linkedin"], "the provider should be called exactly once with the gate on");
  assert.equal(calls.claimsAcquired, 1, "a publish claim should be acquired before the provider call");
  assert.deepEqual(calls.claimTransitions, ["publishing", "published"], "the claim should finish as published");
  assert.equal(state.posts[0].status, "posted", "post should be posted with the gate on");
}

// --- Layer 3: the HTTP hardening shield ------------------------------------------------------
const port = Number(process.env.TEST_PUBLISH_NOW_GATE_PORT || 3971);
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-publish-now-gate-"));
const seedPath = path.join(dataDir, "social-command-center.seed.json");
await writeFile(seedPath, JSON.stringify({ settings: {}, posts: [basePost()], publishEvents: [], activityEvents: [], auditHistory: [], socialAccounts: [] }, null, 2));

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    // Local-operator mode: auth not required, so the request reaches the hardening guard
    // as the local owner actor (sessions + CSRF are covered by the auth suites).
    COMMAND_CENTER_REQUIRE_AUTH: "false",
    LOCAL_DEMO_MODE: "true",
    STORAGE_BACKEND: "json",
    COMMAND_CENTER_DATA_PATH: path.join(dataDir, "state.json"),
    COMMAND_CENTER_SEED_PATH: seedPath,
    // Even with the channel's live gate ON, the endpoint-hardening rule refuses the route
    // today; publishPostNow's own gate (layer 2) is the defense if this shield is relaxed.
    ENABLE_LIVE_LINKEDIN_POSTING: "true",
    NODE_ENV: "test",
    NODE_DISABLE_COMPILE_CACHE: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (!logs.includes("LegalEase preview server ready")) {
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    if (Date.now() - startedAt > 12000) throw new Error(`Timed out waiting for server: ${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const response = await fetch(`http://127.0.0.1:${port}/api/posts/post-1/publish-now`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 403, "the hardening layer should refuse publish-now over HTTP");
  assert.equal(payload.code, "forbidden_external_action_blocked", "the refusal should come from the endpoint hardening guard");
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
}

console.log("publish-now live gate tests passed.");

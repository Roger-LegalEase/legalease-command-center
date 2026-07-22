import assert from "node:assert/strict";
import {
  createSessionService,
  credentialRole,
  csrfCookie,
  SESSION_TTL_MS,
  sessionCookie
} from "./session-auth.mjs";
import { consumeRateLimit } from "./security-rate-limit.mjs";
import { operationalMetrics } from "./observability.mjs";

process.env.SKIP_ENV_LOCAL_FILE = "1";

let nowMs = 1_000;
const sessionRecords = new Map();
const rateBuckets = new Map();
const authCalls = { createSession:0, getSession:0, deleteSession:0, revokeSessions:0, consumeRateLimit:0 };
const sessionLookupKeys = [];
const rateInputs = [];
const authStore = {
  backend:"memory",
  configured:true,
  async createSession(row, ttlMs) {
    authCalls.createSession += 1;
    assert.equal(ttlMs, SESSION_TTL_MS);
    if (sessionRecords.has(row.tokenHash)) return false;
    sessionRecords.set(row.tokenHash, structuredClone(row));
    return true;
  },
  async getSession(tokenHash) {
    authCalls.getSession += 1;
    sessionLookupKeys.push(tokenHash);
    return sessionRecords.has(tokenHash) ? structuredClone(sessionRecords.get(tokenHash)) : null;
  },
  async deleteSession(tokenHash) {
    authCalls.deleteSession += 1;
    return sessionRecords.delete(tokenHash);
  },
  async revokeSessions(predicate) {
    authCalls.revokeSessions += 1;
    let count = 0;
    for (const [tokenHash, row] of sessionRecords) {
      if (!predicate(structuredClone(row))) continue;
      sessionRecords.delete(tokenHash);
      count += 1;
    }
    return count;
  },
  async consumeRateLimit(input) {
    authCalls.consumeRateLimit += 1;
    rateInputs.push(structuredClone(input));
    const bucketKey = `${input.scope}:${input.subjectHash}:${Math.floor(input.now / input.windowMs)}`;
    const count = (rateBuckets.get(bucketKey) || 0) + 1;
    rateBuckets.set(bucketKey, count);
    const resetAt = (Math.floor(input.now / input.windowMs) + 1) * input.windowMs;
    return {
      allowed:count <= input.limit,
      count,
      remaining:Math.max(0, input.limit - count),
      retryAfterSeconds:Math.max(1, Math.ceil((resetAt - input.now) / 1_000)),
      resetAt
    };
  }
};

const businessCalls = { readState:0, writeCollections:0, mutateCollectionItem:0, claimCollectionItems:0 };
const poisonBusinessStore = Object.fromEntries(Object.keys(businessCalls).map((method) => [method, async () => {
  businessCalls[method] += 1;
  throw new Error(`Business store ${method} must not be used for authentication.`);
}]));

const env = {
  NODE_ENV:"production",
  COMMAND_CENTER_SESSION_SECRET:"9q-session-A7v!m2Zx#4Lp8Wc6Rk3Tn5Ys1Hd0",
  COMMAND_CENTER_OWNER_TOKEN:"9q-owner-A7v!m2Zx#4Lp8Wc6Rk3Tn5Ys1Hd0"
};
const sessions = createSessionService({ authStore, store:poisonBusinessStore, env, now:() => nowMs });
assert.equal(credentialRole(env.COMMAND_CENTER_OWNER_TOKEN, env), "owner");

const created = await sessions.create("owner", { userAgent:"synthetic-test" });
assert.equal(authCalls.createSession, 1);
assert.deepEqual(Object.keys(created.row).sort(), [
  "createdAt", "csrfHash", "expiresAt", "generation", "id", "revokedAt", "role", "tokenHash", "userAgentHash"
]);
assert(!JSON.stringify([...sessionRecords.values()]).includes(created.token));
assert(!JSON.stringify([...sessionRecords.values()]).includes(created.csrfToken));
assert(!JSON.stringify([...sessionRecords.values()]).includes("synthetic-test"));

const cookie = sessionCookie(created.token, { env });
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Lax/);
assert.match(cookie, /Max-Age=/);
assert.match(csrfCookie(created.csrfToken, { env }), /Secure/);

const request = { headers:{ cookie:`leos_session=${encodeURIComponent(created.token)}`, "x-csrf-token":created.csrfToken } };
const getCallsBeforeAuthentication = authCalls.getSession;
const actor = await sessions.authenticate(request);
assert.equal(authCalls.getSession, getCallsBeforeAuthentication + 1);
assert.equal(sessionLookupKeys.at(-1), created.row.tokenHash);
assert.notEqual(sessionLookupKeys.at(-1), created.token);
assert.equal(actor.role, "owner");
assert.equal(sessions.csrfValid(request, actor), true);
assert.equal(sessions.csrfValid({ headers:{ cookie:request.headers.cookie } }, actor), false);
await sessions.revoke(request);
assert.equal(await sessions.authenticate(request), null);

const expiring = await sessions.create("viewer");
const expiringRequest = { headers:{ cookie:`leos_session=${encodeURIComponent(expiring.token)}` } };
nowMs += SESSION_TTL_MS + 1;
assert.equal(await sessions.authenticate(expiringRequest), null);

const owner = await sessions.create("owner");
const admin = await sessions.create("admin");
assert.equal(await sessions.revokeAll((row) => row.role === "owner"), 1);
assert.equal(await sessions.authenticate({ headers:{ cookie:`leos_session=${encodeURIComponent(owner.token)}` } }), null);
assert.equal((await sessions.authenticate({ headers:{ cookie:`leos_session=${encodeURIComponent(admin.token)}` } })).role, "admin");

const rotated = await sessions.rotate(
  { headers:{ cookie:`leos_session=${encodeURIComponent(admin.token)}`, "user-agent":"synthetic-rotate" } },
  "operator"
);
assert.equal(await sessions.authenticate({ headers:{ cookie:`leos_session=${encodeURIComponent(admin.token)}` } }), null);
assert.equal((await sessions.authenticate({ headers:{ cookie:`leos_session=${encodeURIComponent(rotated.token)}` } })).role, "operator");

const decisions = [];
for (let attempt = 1; attempt <= 7; attempt += 1) {
  decisions.push(await consumeRateLimit({
    authStore,
    store:poisonBusinessStore,
    scope:"login",
    subject:"synthetic-client",
    limit:6,
    windowMs:60_000,
    now:2_000,
    secret:env.COMMAND_CENTER_SESSION_SECRET
  }));
}
assert(decisions.slice(0, 6).every((decision) => decision.allowed));
assert.equal(decisions[6].allowed, false);
assert(decisions[6].retryAfterSeconds > 0);
assert.equal(authCalls.consumeRateLimit, 7);
assert(rateInputs.every((input) => input.subjectHash !== "synthetic-client"));
assert(rateInputs.every((input) => !JSON.stringify(input).includes("synthetic-client")));

assert.deepEqual(businessCalls, {
  readState:0,
  writeCollections:0,
  mutateCollectionItem:0,
  claimCollectionItems:0
});

const metrics = operationalMetrics({
  securityMetrics:{ counters:{ webhook_rejections:2, auth_failures:999, auth_throttled:999 } }
}, {}, {
  auth_failures:3,
  auth_throttled:1,
  auth_logins:4
});
assert.equal(metrics.counters.webhook_rejections, 2, "Unrelated business security metrics must remain intact.");
assert.equal(metrics.counters.auth_failures, 3, "Auth metrics must come from the auth runtime store, not legacy Supabase counters.");
assert.equal(metrics.counters.auth_throttled, 1);
assert.equal(metrics.counters.auth_logins, 4);

console.log("session security tests passed");

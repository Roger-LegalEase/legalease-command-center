import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { jsonRequest, startPreviewServer } from "./test-support/preview-server-harness.mjs";

process.env.SKIP_ENV_LOCAL_FILE = "1";

const SERVICE_ROLE_KEY = "synthetic-service-role-key-A7v9-Q4m8-2026";
const SESSION_SECRET = "hosted-login-session-secret-A7v9-Q4m8-2026";
const UPSTASH_TOKEN = "synthetic-upstash-write-token-A7v9-Q4m8-2026";
const SESSION_PREFIX = "leos:auth:v1:session:";
const SESSION_FIELDS = [
  "createdAt",
  "csrfHash",
  "expiresAt",
  "generation",
  "id",
  "revokedAt",
  "role",
  "tokenHash",
  "userAgentHash"
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const hmac = (value) => crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");

function sendJson(response, body, status = 200) {
  response.writeHead(status, { "content-type":"application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

async function startHangingSupabase() {
  const requests = [];
  const server = http.createServer((request) => {
    requests.push({
      method:String(request.method || "GET").toUpperCase(),
      pathname:new URL(request.url || "/", "http://fixture.invalid").pathname
    });
    request.resume();
    // Intentionally never answer. If authentication regresses into Supabase, its bounded
    // request timeout keeps the test finite and the request counter identifies the violation.
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    requests,
    async stop() { await close(server); }
  };
}

async function startFakeUpstash() {
  const sessions = new Map();
  const rates = new Map();
  const metrics = new Map();
  const requests = [];
  const unavailable = new Set();

  function liveSession(key) {
    const entry = sessions.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      sessions.delete(key);
      return null;
    }
    return entry;
  }

  const server = http.createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${UPSTASH_TOKEN}`) {
      sendJson(response, { error:"unauthorized" }, 401);
      return;
    }
    let command;
    try {
      command = await readJson(request);
    } catch {
      sendJson(response, { error:"invalid request" }, 400);
      return;
    }
    const name = String(command?.[0] || "").toUpperCase();
    requests.push({ name, command, bodyBytes:Buffer.byteLength(JSON.stringify(command || [])) });
    if (unavailable.has(name)) {
      sendJson(response, { error:"synthetic unavailable" }, 503);
      return;
    }

    if (name === "PING") {
      sendJson(response, { result:"PONG" });
      return;
    }
    if (name === "EVAL") {
      const key = String(command[3] || "");
      const ttlMs = Math.max(1, Number(command[4] || 1));
      const current = rates.get(key);
      const count = current && current.expiresAt > Date.now() ? current.count + 1 : 1;
      const expiresAt = current && current.expiresAt > Date.now() ? current.expiresAt : Date.now() + ttlMs;
      rates.set(key, { count, expiresAt });
      sendJson(response, { result:[count, Math.max(1, expiresAt - Date.now())] });
      return;
    }
    if (name === "SET") {
      const key = String(command[1] || "");
      const ttlMs = Math.max(1, Number(command[4] || 1));
      if (liveSession(key)) sendJson(response, { result:null });
      else {
        sessions.set(key, { value:String(command[2] || ""), expiresAt:Date.now() + ttlMs });
        sendJson(response, { result:"OK" });
      }
      return;
    }
    if (name === "GET") {
      sendJson(response, { result:liveSession(String(command[1] || ""))?.value ?? null });
      return;
    }
    if (name === "DEL") {
      sendJson(response, { result:sessions.delete(String(command[1] || "")) ? 1 : 0 });
      return;
    }
    if (name === "HINCRBY") {
      const field = String(command[2] || "");
      const value = (metrics.get(field) || 0) + Number(command[3] || 0);
      metrics.set(field, value);
      sendJson(response, { result:value });
      return;
    }
    if (name === "HGETALL") {
      sendJson(response, { result:[...metrics].flatMap(([field, value]) => [field, String(value)]) });
      return;
    }
    if (name === "SCAN") {
      sendJson(response, { result:["0", [...sessions.keys()]] });
      return;
    }
    sendJson(response, { error:"unsupported command" }, 400);
  });

  const baseUrl = await listen(server);
  return {
    baseUrl,
    requests,
    fail(name, enabled = true) {
      const normalized = String(name || "").toUpperCase();
      if (enabled) unavailable.add(normalized);
      else unavailable.delete(normalized);
    },
    commands(name) {
      const normalized = String(name || "").toUpperCase();
      return requests.filter((item) => item.name === normalized);
    },
    resetRequests() { requests.length = 0; },
    seedSession(tokenHash, session, ttlMs = 30 * 60 * 1000) {
      sessions.set(`${SESSION_PREFIX}${tokenHash}`, {
        value:JSON.stringify(session),
        expiresAt:Date.now() + ttlMs
      });
    },
    sessionCount() {
      for (const key of sessions.keys()) liveSession(key);
      return sessions.size;
    },
    async stop() { await close(server); }
  };
}

function hostedTestEnvironment(supabase, redis, overrides = {}) {
  return {
    STORAGE_BACKEND:"supabase",
    LOCAL_DEMO_MODE:"false",
    COMMAND_CENTER_ALLOW_JSON:"false",
    SUPABASE_URL:supabase.baseUrl,
    SUPABASE_SERVICE_ROLE_KEY:SERVICE_ROLE_KEY,
    SUPABASE_REQUEST_TIMEOUT_MS:"100",
    STATE_CACHE_TTL_MS:"0",
    COMMAND_CENTER_SESSION_SECRET:SESSION_SECRET,
    UPSTASH_REDIS_REST_URL:redis.baseUrl,
    UPSTASH_REDIS_REST_TOKEN:UPSTASH_TOKEN,
    AUTH_STORE_REQUEST_TIMEOUT_MS:"250",
    ...overrides
  };
}

async function startScenario() {
  const supabase = await startHangingSupabase();
  let redis;
  let preview;
  try {
    redis = await startFakeUpstash();
    preview = await startPreviewServer({ env:hostedTestEnvironment(supabase, redis) });
    return {
      supabase,
      redis,
      preview,
      async stop() {
        await preview.stop();
        await redis.stop();
        await supabase.stop();
      }
    };
  } catch (error) {
    if (preview) await preview.stop();
    if (redis) await redis.stop();
    await supabase.stop();
    throw error;
  }
}

async function login(server, credential, headers = {}) {
  return jsonRequest(server.baseUrl, "/api/auth/login", {
    method:"POST",
    headers:{ "content-type":"application/json", ...headers },
    body:JSON.stringify({ credential })
  });
}

function cookieValue(setCookie, name) {
  return String(setCookie || "").match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`))?.[1] || "";
}

function authEvents(logs) {
  return String(logs || "").split(/\r?\n/).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value?.area === "authentication" ? [value] : [];
    } catch {
      return [];
    }
  });
}

async function expectStage(preview, stage, status) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_000) {
    const event = authEvents(preview.logs()).findLast((item) => item.stage === stage && item.status === status);
    if (event) return event;
    await wait(10);
  }
  assert.fail(`Expected authentication stage ${stage} with status ${status}. Logs: ${preview.logs()}`);
}

function assertNoSecretLeak(text, secrets, label) {
  for (const secret of secrets.filter(Boolean)) {
    assert(!String(text).includes(secret), `${label} must not expose credentials or auth material.`);
  }
}

function assertSafeAuthEvents(preview, secrets = []) {
  const events = authEvents(preview.logs());
  assert(events.length > 0, "Authentication requests must emit safe stage events.");
  const allowed = new Set(["level", "requestId", "area", "stage", "status", "code", "backend", "durationMs"]);
  for (const event of events) {
    assert.deepEqual(Object.keys(event).filter((key) => !allowed.has(key)), [], "Auth logs must contain only the safe stage schema.");
  }
  assertNoSecretLeak(JSON.stringify(events), secrets, "Authentication stage logs");
}

function seededOwnerSession(rawToken) {
  const now = Date.now();
  const tokenHash = hmac(rawToken);
  return {
    tokenHash,
    record:{
      id:"synthetic-owner-session",
      tokenHash,
      csrfHash:hmac("synthetic-csrf-token"),
      role:"owner",
      createdAt:new Date(now).toISOString(),
      expiresAt:new Date(now + 30 * 60 * 1000).toISOString(),
      revokedAt:"",
      generation:1,
      userAgentHash:""
    }
  };
}

console.log("Hosted authentication runtime isolation regression tests");

// A. Supabase is unavailable, but rate limiting and session creation use healthy Redis.
{
  const fixture = await startScenario();
  const callerRequestId = "198.51.100.42";
  let sessionToken = "";
  let csrfToken = "";
  try {
    const startedAt = Date.now();
    const accepted = await login(fixture.preview, fixture.preview.ownerCredential, { "x-request-id":callerRequestId });
    const durationMs = Date.now() - startedAt;
    assert.equal(accepted.response.status, 200, "Healthy Redis must allow owner login while Supabase hangs.");
    assert.equal(accepted.json.role, "owner");
    assert(durationMs < 1_000, `Healthy auth must finish well below the hosted timeout; observed ${durationMs}ms.`);
    const setCookie = accepted.response.headers.get("set-cookie") || "";
    sessionToken = cookieValue(setCookie, "leos_session");
    csrfToken = cookieValue(setCookie, "leos_csrf");
    assert(sessionToken, "Successful login must set an opaque session cookie.");
    assert(csrfToken, "Successful login must set a CSRF cookie.");
    assert.match(setCookie, /leos_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax/);
    assert.equal(fixture.supabase.requests.length, 0, "Login must make zero Supabase requests.");
    assert.equal(fixture.redis.commands("EVAL").length, 1, "Login must make one atomic Redis rate-limit decision.");
    assert.equal(fixture.redis.commands("SET").length, 1, "Login must persist one Redis session.");
    assert(fixture.redis.requests.every((item) => item.bodyBytes < 2_048), "Authentication must not move a large company-state body.");
    await expectStage(fixture.preview, "rate_limit", 200);
    await expectStage(fixture.preview, "credential_check", 200);
    await expectStage(fixture.preview, "session_create", 200);
    const version = await jsonRequest(fixture.preview.baseUrl, "/api/version");
    assert.equal(version.response.status, 200, "Public version health must remain available without a session lookup.");
    assert.equal(version.json.storageBackend, "supabase");
    assert.equal(version.json.authStoreBackend, "upstash");
    assert.equal(version.json.authStoreConnected, true);
    assert.equal(version.json.supabaseConnected, false);
    assert.equal(fixture.supabase.requests.length, 2, "Version health may make only the initial Supabase read and its one eligible retry.");
    const persistedSession = JSON.parse(fixture.redis.commands("SET")[0].command[2]);
    const redisBodies = fixture.redis.requests.map((item) => JSON.stringify(item.command)).join("\n");
    assertNoSecretLeak(redisBodies, [fixture.preview.ownerCredential, sessionToken, csrfToken, "127.0.0.1"], "Redis command bodies");
    assertNoSecretLeak(accepted.text + "\n" + fixture.preview.logs(), [
      fixture.preview.ownerCredential,
      SERVICE_ROLE_KEY,
      SESSION_SECRET,
      UPSTASH_TOKEN,
      sessionToken,
      csrfToken,
      persistedSession.tokenHash,
      persistedSession.csrfHash,
      callerRequestId
    ], "Successful login body and logs");
    assertSafeAuthEvents(fixture.preview, [fixture.preview.ownerCredential, sessionToken, csrfToken, persistedSession.tokenHash, persistedSession.csrfHash, callerRequestId]);
  } finally {
    await fixture.stop();
  }
  console.log("  ✓ healthy Redis login returns 200 with zero Supabase requests");
}

// B. A valid Redis session authenticates with one targeted GET and no state hydration.
{
  const fixture = await startScenario();
  const rawToken = "synthetic-existing-session-token-B-Q4m8";
  const seeded = seededOwnerSession(rawToken);
  fixture.redis.seedSession(seeded.tokenHash, seeded.record);
  fixture.redis.resetRequests();
  try {
    const diagnostics = await jsonRequest(fixture.preview.baseUrl, "/api/auth/diagnostics", {
      headers:{ cookie:`leos_session=${encodeURIComponent(rawToken)}` }
    });
    assert.equal(diagnostics.response.status, 200, "A valid Redis session must authenticate while Supabase hangs.");
    assert.equal(diagnostics.json.sessionAuthenticated, true);
    assert.equal(diagnostics.json.role, "owner");
    assert.equal(diagnostics.json.authStore.backend, "upstash");
    assert.equal(diagnostics.json.authStore.connected, true);
    assert.equal(fixture.supabase.requests.length, 0, "Session authentication must make zero Supabase requests.");
    assert.equal(fixture.redis.commands("GET").length, 1, "Session lookup must use one targeted Redis GET.");
    assert.equal(fixture.redis.commands("PING").length, 1, "Protected diagnostics may probe only auth-store health after authentication.");
    const get = fixture.redis.commands("GET")[0];
    assert.equal(get.command.length, 2);
    assert.equal(get.command[1], `${SESSION_PREFIX}${seeded.tokenHash}`);
    assert(get.bodyBytes < 256, "Targeted session lookup must not carry a company-state body.");
    await expectStage(fixture.preview, "session_lookup", 200);
    const readiness = await jsonRequest(fixture.preview.baseUrl, "/api/ready", {
      headers:{ cookie:`leos_session=${encodeURIComponent(rawToken)}` }
    });
    assert.equal(readiness.response.status, 503, "Business readiness must remain honest while Supabase is unavailable.");
    assert.equal(readiness.json.ready, false);
    assert.equal(readiness.json.authStore.connected, true, "Readiness must distinguish healthy auth from unavailable business storage.");
    assert.deepEqual(Object.keys(readiness.json.authStore).sort(), [
      "backend", "configured", "connected", "errorCode", "lastCheckedAt", "latencyMs"
    ].sort(), "Readiness auth health must expose only safe fields.");
    assertNoSecretLeak(diagnostics.text + "\n" + readiness.text + "\n" + fixture.preview.logs(), [
      rawToken,
      seeded.tokenHash,
      SERVICE_ROLE_KEY,
      SESSION_SECRET,
      UPSTASH_TOKEN
    ], "Session diagnostics body and logs");
    assertSafeAuthEvents(fixture.preview, [rawToken, seeded.tokenHash]);
  } finally {
    await fixture.stop();
  }
  console.log("  ✓ existing session uses one targeted Redis GET and zero business hydration");
}

// C. An unavailable atomic rate-limit decision fails closed and is not retried.
{
  const fixture = await startScenario();
  fixture.redis.fail("EVAL");
  try {
    const unavailable = await login(fixture.preview, fixture.preview.ownerCredential);
    assert.equal(unavailable.response.status, 503, "Unavailable Redis rate limiting must fail closed.");
    assert.equal(unavailable.json.error, "Authentication is temporarily unavailable. No successful session was returned.");
    assert.equal(fixture.redis.commands("EVAL").length, 1, "Atomic rate limiting must never be blindly retried.");
    assert.equal(fixture.redis.commands("SET").length, 0, "No session may be created without a rate-limit decision.");
    assert.equal(fixture.supabase.requests.length, 0, "Rate-limit failure must not fall back to Supabase.");
    const stage = await expectStage(fixture.preview, "rate_limit", 503);
    assert.equal(stage.code, "AUTH_STORE_UNAVAILABLE");
    assertNoSecretLeak(unavailable.text + "\n" + fixture.preview.logs(), [fixture.preview.ownerCredential, SERVICE_ROLE_KEY, SESSION_SECRET, UPSTASH_TOKEN], "Rate-limit failure");
    assertSafeAuthEvents(fixture.preview, [fixture.preview.ownerCredential]);
  } finally {
    await fixture.stop();
  }
  console.log("  ✓ unavailable Redis rate limit returns safe 503 at rate_limit without retry or fallback");
}

// D. An unavailable SET and verification GET never return a successful session cookie.
{
  const fixture = await startScenario();
  fixture.redis.fail("SET");
  fixture.redis.fail("GET");
  try {
    const unavailable = await login(fixture.preview, fixture.preview.ownerCredential);
    assert.equal(unavailable.response.status, 503, "Unavailable Redis session persistence must return 503.");
    assert.equal(unavailable.json.error, "Authentication is temporarily unavailable. No successful session was returned.");
    assert.equal(cookieValue(unavailable.response.headers.get("set-cookie"), "leos_session"), "", "A failed session write must not set a success cookie.");
    assert.equal(fixture.redis.commands("SET").length, 1, "Session creation must use one stable SET NX attempt.");
    assert.equal(fixture.redis.commands("GET").length, 2, "Uncertain SET outcome verification may use one retried read.");
    assert.equal(fixture.redis.sessionCount(), 0, "Failed persistence must not create a session in the fixture.");
    assert.equal(fixture.supabase.requests.length, 0, "Session creation failure must not fall back to Supabase.");
    const setCommand = fixture.redis.commands("SET")[0].command;
    const sessionRecord = JSON.parse(setCommand[2]);
    assert.deepEqual(Object.keys(sessionRecord).sort(), SESSION_FIELDS, "Redis session values must contain only the server-side session record.");
    const stage = await expectStage(fixture.preview, "session_create", 503);
    assert.equal(stage.code, "AUTH_STORE_UNAVAILABLE");
    assertNoSecretLeak(unavailable.text + "\n" + fixture.preview.logs(), [fixture.preview.ownerCredential, SERVICE_ROLE_KEY, SESSION_SECRET, UPSTASH_TOKEN], "Session creation failure");
    assertSafeAuthEvents(fixture.preview, [fixture.preview.ownerCredential]);
  } finally {
    await fixture.stop();
  }
  console.log("  ✓ unavailable SET/verification returns safe 503 at session_create with no cookie");
}

// E/F. Valid and invalid attempts share one bucket; invalid stays 401 and seventh is 429.
{
  const fixture = await startScenario();
  fixture.redis.fail("HINCRBY");
  const invalidCredentials = [];
  let sessionToken = "";
  let csrfToken = "";
  try {
    const accepted = await login(fixture.preview, fixture.preview.ownerCredential);
    assert.equal(accepted.response.status, 200, "A valid first attempt must be evaluated normally.");
    const setCookie = accepted.response.headers.get("set-cookie") || "";
    sessionToken = cookieValue(setCookie, "leos_session");
    csrfToken = cookieValue(setCookie, "leos_csrf");
    assert(sessionToken && csrfToken, "The valid attempt must create its session before later throttling.");
    for (let attempt = 2; attempt <= 6; attempt += 1) {
      const credential = `synthetic-invalid-owner-${attempt}-Q4m8`;
      invalidCredentials.push(credential);
      const denied = await login(fixture.preview, credential);
      assert.equal(denied.response.status, 401, `Invalid attempt ${attempt} must remain a credential decision.`);
    }
    const seventhCredential = "synthetic-invalid-owner-7-Q4m8";
    invalidCredentials.push(seventhCredential);
    const throttled = await login(fixture.preview, seventhCredential);
    assert.equal(throttled.response.status, 429, "The seventh attempt must be throttled.");
    assert(Number(throttled.response.headers.get("retry-after")) > 0, "A throttled login must include Retry-After.");
    assert.equal(fixture.redis.commands("EVAL").length, 7, "Valid and invalid attempts must consume one durable Redis bucket.");
    assert.equal(fixture.redis.commands("SET").length, 1, "Only the valid attempt may create a session.");
    assert(fixture.redis.commands("HINCRBY").length > 0, "The fixture must exercise unavailable best-effort auth metrics.");
    assert.equal(fixture.supabase.requests.length, 0, "Credential checks and throttling must make zero Supabase requests.");
    await expectStage(fixture.preview, "credential_check", 401);
    await expectStage(fixture.preview, "rate_limit", 429);
    assertNoSecretLeak(throttled.text + "\n" + fixture.preview.logs(), [
      ...invalidCredentials,
      SERVICE_ROLE_KEY,
      SESSION_SECRET,
      UPSTASH_TOKEN,
      sessionToken,
      csrfToken
    ], "Invalid and throttled login logs");
    assertSafeAuthEvents(fixture.preview, [fixture.preview.ownerCredential, ...invalidCredentials, sessionToken, csrfToken]);
  } finally {
    await fixture.stop();
  }
  console.log("  ✓ valid and invalid attempts share one bucket; invalid is 401 and seventh is 429");
}

// G. A Redis lookup failure returns before authorization and never falls back to Supabase.
{
  const fixture = await startScenario();
  const rawToken = "synthetic-existing-session-token-G-A7v9";
  const seeded = seededOwnerSession(rawToken);
  fixture.redis.seedSession(seeded.tokenHash, seeded.record);
  fixture.redis.resetRequests();
  fixture.redis.fail("GET");
  try {
    const unavailable = await jsonRequest(fixture.preview.baseUrl, "/api/auth/diagnostics", {
      headers:{ cookie:`leos_session=${encodeURIComponent(rawToken)}` }
    });
    assert.equal(unavailable.response.status, 503, "Unavailable Redis session lookup must fail safely.");
    assert.equal(unavailable.json.error, "Authentication is temporarily unavailable. No successful session was returned.");
    assert.equal(fixture.redis.commands("GET").length, 2, "Read-only session lookup may retry once and no more.");
    assert.equal(fixture.redis.commands("PING").length, 0, "The protected route must not execute after session lookup fails.");
    assert.equal(fixture.supabase.requests.length, 0, "Session lookup must never fall back to Supabase.");
    const stage = await expectStage(fixture.preview, "session_lookup", 503);
    assert.equal(stage.code, "AUTH_STORE_UNAVAILABLE");
    assertNoSecretLeak(unavailable.text + "\n" + fixture.preview.logs(), [rawToken, seeded.tokenHash, SERVICE_ROLE_KEY, SESSION_SECRET, UPSTASH_TOKEN], "Session lookup failure");
    assertSafeAuthEvents(fixture.preview, [rawToken, seeded.tokenHash]);
  } finally {
    await fixture.stop();
  }
  console.log("  ✓ unavailable session GET returns safe 503 at session_lookup with no Supabase fallback");
}

console.log("hosted authentication runtime isolation regression tests passed");

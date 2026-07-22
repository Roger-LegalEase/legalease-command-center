import assert from "node:assert/strict";
import {
  AUTH_RUNTIME_KEY_PREFIX,
  AUTH_STORE_ERROR_CODES,
  AuthRuntimeStoreError,
  authStoreRequestTimeoutMs,
  createAuthRuntimeStore,
  createMemoryAuthRuntimeStore,
  createUpstashAuthRuntimeStore
} from "./auth-runtime-store.mjs";

process.env.SKIP_ENV_LOCAL_FILE = "1";

const SYNTHETIC_WRITE_TOKEN = "synthetic-upstash-write-token-A7v9-Q4m8-2026";
const SYNTHETIC_RESPONSE_SECRET = "synthetic-response-secret-T8m4-V2p7-2026";

async function assertConcurrentSessionCheckpoints(env) {
  const values = new Map();
  let releaseSlowSet;
  let markSlowSetStarted;
  const slowSetGate = new Promise((resolve) => { releaseSlowSet = resolve; });
  const slowSetStarted = new Promise((resolve) => { markSlowSetStarted = resolve; });
  const slowHash = "4".repeat(64);
  const fastHash = "5".repeat(64);
  const checkpointFor = (key) => key.endsWith(slowHash) ? "synthetic-slow-checkpoint" : "synthetic-fast-checkpoint";
  const fetchImpl = async (_url, options = {}) => {
    const command = JSON.parse(options.body);
    const operation = String(command[0] || "").toUpperCase();
    const key = String(command[1] || "");
    if (operation === "SET") {
      values.set(key, command[2]);
      if (key.endsWith(slowHash)) {
        markSlowSetStarted();
        await slowSetGate;
      }
    } else if (operation === "GET") {
      assert.equal(
        options.headers["upstash-sync-token"],
        checkpointFor(key),
        "Concurrent sessions must retain independent read-your-writes checkpoints."
      );
    }
    return new Response(JSON.stringify({ result:operation === "SET" ? "OK" : values.get(key) ?? null }), {
      status:200,
      headers:{ "content-type":"application/json", "upstash-sync-token":checkpointFor(key) }
    });
  };
  const store = createUpstashAuthRuntimeStore({ env, fetchImpl });
  const slow = syntheticSession({ id:"concurrent-slow", tokenCharacter:"4" });
  const fast = syntheticSession({ id:"concurrent-fast", tokenCharacter:"5" });
  const slowCreate = store.createSession(slow, 60_000);
  await slowSetStarted;
  await store.createSession(fast, 60_000);
  releaseSlowSet();
  await slowCreate;
  assert.equal((await store.getSession(slowHash)).id, slow.id);
  assert.equal((await store.getSession(fastHash)).id, fast.id);
}

async function startFakeUpstash() {
  const strings = new Map();
  const hashes = new Map();
  const calls = [];
  const syncHeaders = [];
  const failures = new Map();
  let uncertainSet = false;
  let syncSequence = 0;

  function unexpired(key) {
    const entry = strings.get(key);
    if (entry && entry.expiresAt <= Date.now()) strings.delete(key);
    return strings.get(key) || null;
  }

  const response = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers:{
      "content-type":"application/json",
      "upstash-sync-token":`synthetic-sync-${++syncSequence}`
    }
  });

  const fetchImpl = async (url, options = {}) => {
    assert.equal(url, "https://synthetic-upstash.example.com");
    const command = JSON.parse(options.body);
    const operation = String(command[0] || "").toUpperCase();
    calls.push(operation);
    syncHeaders.push(String(options.headers["upstash-sync-token"] || ""));
    assert.equal(options.headers.authorization, `Bearer ${SYNTHETIC_WRITE_TOKEN}`);

    const queuedFailure = failures.get(operation);
    if (queuedFailure) {
      failures.delete(operation);
      return response({ error:queuedFailure.body }, queuedFailure.status);
    }

    if (operation === "SET") {
      const [, key, value, pxName, ttlValue, nxName] = command;
      assert.equal(String(pxName).toUpperCase(), "PX");
      assert.equal(String(nxName).toUpperCase(), "NX");
      if (unexpired(key)) {
        return response({ result:null });
      }
      strings.set(key, { value, expiresAt:Date.now() + Number(ttlValue) });
      if (uncertainSet) {
        uncertainSet = false;
        await new Promise((resolve, reject) => {
          const delayed = setTimeout(resolve, 500);
          const aborted = () => {
            clearTimeout(delayed);
            reject(new DOMException("synthetic abort", "AbortError"));
          };
          options.signal?.addEventListener("abort", aborted, { once:true });
        });
        return response({ result:"OK" });
      }
      return response({ result:"OK" });
    }

    if (operation === "GET") {
      const entry = unexpired(command[1]);
      return response({ result:entry?.value ?? null });
    }

    if (operation === "DEL") {
      const existed = Boolean(unexpired(command[1]));
      strings.delete(command[1]);
      return response({ result:existed ? 1 : 0 });
    }

    if (operation === "EVAL") {
      const key = command[3];
      const ttlMs = Number(command[4]);
      const existing = unexpired(key);
      const count = Number(existing?.value || 0) + 1;
      const expiresAt = existing?.expiresAt || Date.now() + ttlMs;
      strings.set(key, { value:String(count), expiresAt });
      return response({ result:[count, Math.max(1, expiresAt - Date.now())] });
    }

    if (operation === "HINCRBY") {
      const [, key, field, amount] = command;
      const hash = hashes.get(key) || new Map();
      const count = Number(hash.get(field) || 0) + Number(amount);
      hash.set(field, count);
      hashes.set(key, hash);
      return response({ result:count });
    }

    if (operation === "HGETALL") {
      const hash = hashes.get(command[1]) || new Map();
      return response({ result:[...hash.entries()].flatMap(([key, value]) => [key, String(value)]) });
    }

    if (operation === "SCAN") {
      const match = String(command[3] || "").replace(/\*$/, "");
      const keys = [...strings.keys()].filter((key) => key.startsWith(match) && unexpired(key));
      return response({ result:["0", keys] });
    }

    if (operation === "PING") {
      return response({ result:"PONG" });
    }

    return response({ error:"unsupported synthetic command" }, 400);
  };

  return {
    url:"https://synthetic-upstash.example.com",
    fetchImpl,
    strings,
    calls,
    syncHeaders,
    failOnce(operation, status, body = "synthetic failure") {
      failures.set(operation, { status, body });
    },
    makeNextSetUncertain() {
      uncertainSet = true;
    },
    count(operation) {
      return calls.filter((value) => value === operation).length;
    },
    async stop() {}
  };
}

function syntheticSession({ id, tokenCharacter, role = "owner", now = Date.now() }) {
  return {
    id,
    tokenHash:tokenCharacter.repeat(64),
    csrfHash:"c".repeat(64),
    role,
    createdAt:new Date(now).toISOString(),
    expiresAt:new Date(now + 60_000).toISOString(),
    revokedAt:"",
    generation:1,
    userAgentHash:"d".repeat(16),
    ignoredCredential:"must-not-be-serialized"
  };
}

console.log("Auth runtime store focused tests");

{
  let clock = 1_800_000_000_000;
  const store = createMemoryAuthRuntimeStore({ now:() => clock });
  const session = syntheticSession({ id:"memory-session", tokenCharacter:"a", now:clock });
  await store.createSession(session, 1_000);
  assert.deepEqual(Object.keys(await store.getSession(session.tokenHash)).sort(), [
    "createdAt",
    "csrfHash",
    "expiresAt",
    "generation",
    "id",
    "revokedAt",
    "role",
    "tokenHash",
    "userAgentHash"
  ]);
  clock += 1_001;
  assert.equal(await store.getSession(session.tokenHash), null, "Expired memory sessions must disappear.");

  const revokeOwner = syntheticSession({ id:"memory-owner", tokenCharacter:"b", now:clock });
  const keepViewer = syntheticSession({ id:"memory-viewer", tokenCharacter:"c", role:"viewer", now:clock });
  await store.createSession(revokeOwner, 60_000);
  await store.createSession(keepViewer, 60_000);
  assert.equal(await store.revokeSessions((row) => row.role === "owner"), 1);
  assert.equal(await store.getSession(revokeOwner.tokenHash), null);
  assert.equal((await store.getSession(keepViewer.tokenHash)).role, "viewer");
  assert.equal(await store.deleteSession(keepViewer.tokenHash), true);
  assert.equal((await store.health()).connected, true);
  console.log("  ✓ in-memory create, targeted get, expiry, revoke, delete, and health");
}

const fake = await startFakeUpstash();
try {
  const env = {
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"1",
    UPSTASH_REDIS_REST_URL:fake.url,
    UPSTASH_REDIS_REST_TOKEN:SYNTHETIC_WRITE_TOKEN,
    AUTH_STORE_REQUEST_TIMEOUT_MS:"250"
  };
  const store = createUpstashAuthRuntimeStore({ env, fetchImpl:fake.fetchImpl, healthCacheMs:250 });
  assert.equal(store.backend, "upstash");
  assert.equal(store.configured, true);

  const first = syntheticSession({ id:"upstash-session-one", tokenCharacter:"1" });
  await store.createSession(first, 60_000);
  assert.equal((await store.getSession(first.tokenHash)).id, first.id);
  assert.equal(fake.syncHeaders[0], "", "The first request must not invent an Upstash sync token.");
  assert.equal(fake.syncHeaders[1], "synthetic-sync-1", "The next request must carry the prior response sync token for read-your-writes consistency.");
  const storedValue = [...fake.strings.entries()].find(([key]) => key === `${AUTH_RUNTIME_KEY_PREFIX}:session:${first.tokenHash}`)?.[1]?.value;
  assert(storedValue, "The fake Redis fixture must contain the targeted session value.");
  assert.deepEqual(Object.keys(JSON.parse(storedValue)).sort(), [
    "createdAt",
    "csrfHash",
    "expiresAt",
    "generation",
    "id",
    "revokedAt",
    "role",
    "tokenHash",
    "userAgentHash"
  ]);
  assert(!storedValue.includes(first.ignoredCredential), "Only the server-side session allowlist may be serialized.");

  fake.failOnce("GET", 503);
  const getCountBeforeRetry = fake.count("GET");
  const syncHeaderCountBeforeRetry = fake.syncHeaders.length;
  assert.equal((await store.getSession(first.tokenHash)).id, first.id);
  assert.equal(fake.count("GET") - getCountBeforeRetry, 2, "A transient targeted GET must retry exactly once.");
  assert.equal(fake.syncHeaders[syncHeaderCountBeforeRetry], "synthetic-sync-2");
  assert.equal(fake.syncHeaders[syncHeaderCountBeforeRetry + 1], "synthetic-sync-2", "Error-response sync tokens must not poison a retry checkpoint.");

  await assertConcurrentSessionCheckpoints(env);

  for (let attempt = 1; attempt <= 7; attempt += 1) {
    const decision = await store.consumeRateLimit({
      scope:"login",
      subjectHash:"e".repeat(32),
      limit:6,
      windowMs:60_000,
      now:1_800_000_000_000
    });
    assert.equal(decision.count, attempt);
    assert.equal(decision.allowed, attempt <= 6);
    if (attempt === 7) {
      assert.equal(decision.remaining, 0);
      assert(decision.retryAfterSeconds > 0);
    }
  }

  fake.failOnce("EVAL", 503, SYNTHETIC_RESPONSE_SECRET);
  const evalCountBeforeFailure = fake.count("EVAL");
  let rateError;
  try {
    await store.consumeRateLimit({
      scope:"login",
      subjectHash:"f".repeat(32),
      limit:6,
      windowMs:60_000,
      now:1_800_000_000_000
    });
  } catch (error) {
    rateError = error;
  }
  assert(rateError instanceof AuthRuntimeStoreError);
  assert.equal(rateError.code, AUTH_STORE_ERROR_CODES.unavailable);
  assert.equal(fake.count("EVAL") - evalCountBeforeFailure, 1, "Atomic rate-limit writes must never retry blindly.");
  assert(!String(rateError).includes(SYNTHETIC_RESPONSE_SECRET));

  const uncertain = syntheticSession({ id:"uncertain-session", tokenCharacter:"2" });
  fake.makeNextSetUncertain();
  const setCountBeforeUncertain = fake.count("SET");
  assert.equal(await store.createSession(uncertain, 60_000), true);
  assert.equal(fake.count("SET") - setCountBeforeUncertain, 1, "An uncertain SET NX outcome must not issue a second SET.");
  assert.equal((await store.getSession(uncertain.tokenHash)).id, uncertain.id, "Uncertain SET NX success must be verified by GET.");

  const viewer = syntheticSession({ id:"upstash-viewer", tokenCharacter:"3", role:"viewer" });
  await store.createSession(viewer, 60_000);
  assert.equal(await store.revokeSessions((row) => row.role === "viewer", { maxSessions:20 }), 1);
  assert.equal(await store.getSession(viewer.tokenHash), null);
  assert.equal(await store.deleteSession(first.tokenHash), true);
  assert.equal(await store.getSession(first.tokenHash), null);

  assert.equal(await store.incrementMetric("auth_logins"), 1);
  assert.equal(await store.incrementMetric("auth_logins", 2), 3);
  assert.deepEqual(await store.readMetrics(), { auth_logins:3 });

  const pingCountBeforeHealth = fake.count("PING");
  const healthy = await store.health();
  const cached = await store.health();
  assert.deepEqual(cached, healthy);
  assert.equal(healthy.backend, "upstash");
  assert.equal(healthy.configured, true);
  assert.equal(healthy.connected, true);
  assert.equal(healthy.errorCode, "");
  assert.equal(fake.count("PING") - pingCountBeforeHealth, 1, "Health results must be short-cached.");

  fake.failOnce("PING", 500, `${SYNTHETIC_RESPONSE_SECRET}:${SYNTHETIC_WRITE_TOKEN}:${fake.url}`);
  const unhealthy = await store.health({ force:true });
  assert.equal(unhealthy.connected, false);
  assert.equal(unhealthy.errorCode, AUTH_STORE_ERROR_CODES.error);
  const safeFailure = JSON.stringify(unhealthy);
  for (const secret of [SYNTHETIC_RESPONSE_SECRET, SYNTHETIC_WRITE_TOKEN, fake.url]) {
    assert(!safeFailure.includes(secret), "Health failures must never expose endpoint, token, or Redis response data.");
  }

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    store.getSession(uncertain.tokenHash, { signal:controller.signal }),
    (error) => error?.code === AUTH_STORE_ERROR_CODES.aborted
  );

  assert.equal(authStoreRequestTimeoutMs({ AUTH_STORE_REQUEST_TIMEOUT_MS:"1" }), 250);
  assert.equal(authStoreRequestTimeoutMs({ AUTH_STORE_REQUEST_TIMEOUT_MS:"9000" }), 5_000);
  assert.equal(authStoreRequestTimeoutMs({ AUTH_STORE_REQUEST_TIMEOUT_MS:"" }), 2_500);
  assert.equal(authStoreRequestTimeoutMs({ AUTH_STORE_REQUEST_TIMEOUT_MS:"not-a-number" }), 2_500);
  assert.equal(authStoreRequestTimeoutMs({}), 2_500);
  assert.equal(createAuthRuntimeStore({ env }).backend, "upstash");
  assert.equal(createAuthRuntimeStore({ env:{ NODE_ENV:"test", COMMAND_CENTER_TEST_MODE:"1" } }).backend, "memory");
  const hostedMissing = createAuthRuntimeStore({ env:{ NODE_ENV:"production" } });
  assert.equal(hostedMissing.backend, "upstash", "Hosted production must never fall back to memory.");
  assert.equal(hostedMissing.configured, false);
  assert.equal((await hostedMissing.health()).connected, false);
  const renderWithTestFlags = createAuthRuntimeStore({
    env:{ RENDER:"true", NODE_ENV:"test", COMMAND_CENTER_TEST_MODE:"true" }
  });
  assert.equal(renderWithTestFlags.backend, "upstash", "Definitive Render hosting must never permit the test memory fallback.");
  assert.equal(renderWithTestFlags.configured, false);

  console.log("  ✓ Upstash sessions, Redis read retry, atomic seventh-attempt throttle, and no blind write retry");
  console.log("  ✓ uncertain SET NX verification, bounded SCAN revoke, metrics, cached health, aborts, and secret safety");
} finally {
  await fake.stop();
}

console.log("auth runtime store tests passed");

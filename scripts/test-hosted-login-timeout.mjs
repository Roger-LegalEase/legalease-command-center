import assert from "node:assert/strict";
import http from "node:http";
import { jsonRequest, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const SERVICE_ROLE_KEY = "fake-service-role-key-A7v9-Q4m8-2026";
const SESSION_SECRET = "hosted-login-session-secret-A7v9-Q4m8-2026";

function json(response, body, status = 200, headers = {}) {
  response.writeHead(status, { "content-type":"application/json", ...headers });
  response.end(JSON.stringify(body));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
}

async function startFakeSupabase({ conflictRateLimitOnce = false, hangRateLimitRead = false, failSessionWrites = false } = {}) {
  const records = new Map();
  const requests = [];
  let rateLimitConflictsRemaining = conflictRateLimitOnce ? 1 : 0;
  let fullHydrationRequests = 0;
  let targetedRateLimitReads = 0;
  let rateLimitCasRequests = 0;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const method = String(request.method || "GET").toUpperCase();
    const collectionFilter = url.searchParams.get("collection") || "";
    const select = url.searchParams.get("select") || "";
    const isRecordsRoute = url.pathname === "/rest/v1/leos_core_records";
    const isRateLimitRead = method === "GET" && isRecordsRoute && collectionFilter === "eq.securityMetrics";
    requests.push({ method, pathname:url.pathname, collectionFilter, select });

    if (isRateLimitRead) {
      targetedRateLimitReads += 1;
      if (hangRateLimitRead) {
        const delayed = setTimeout(() => {
          if (!response.destroyed) json(response, []);
        }, 2_000);
        delayed.unref?.();
        request.once("close", () => clearTimeout(delayed));
        return;
      }
      const row = records.get("securityMetrics/singleton");
      json(response, row ? [row] : []);
      return;
    }

    if (method === "GET" && isRecordsRoute) {
      if (select.includes("updated_at") || url.searchParams.has("order")) fullHydrationRequests += 1;
      json(response, [], 200, { "content-range":"*/0" });
      return;
    }

    if (method === "POST" && url.pathname === "/rest/v1/rpc/leos_upsert_record_cas") {
      const body = await requestBody(request);
      if (body?.p_collection === "securityMetrics") {
        rateLimitCasRequests += 1;
        if (rateLimitConflictsRemaining > 0) {
          rateLimitConflictsRemaining -= 1;
          json(response, { code:"40001", message:"version_conflict" }, 409);
          return;
        }
      }
      const key = `${body.p_collection}/${body.p_item_id}`;
      const current = records.get(key);
      const version = Number(current?.version || 0) + 1;
      records.set(key, {
        collection:body.p_collection,
        item_id:String(body.p_item_id),
        payload:body.p_payload,
        version,
        updated_at:new Date().toISOString()
      });
      json(response, [{ version }]);
      return;
    }

    if (method === "POST" && isRecordsRoute && url.searchParams.has("on_conflict")) {
      const rows = await requestBody(request);
      if (failSessionWrites && rows.some((row) => row.collection === "authSessions")) {
        json(response, { message:"storage unavailable" }, 503);
        return;
      }
      const inserted = [];
      for (const row of rows) {
        const key = `${row.collection}/${row.item_id}`;
        if (records.has(key)) continue;
        records.set(key, { ...row, updated_at:new Date().toISOString() });
        inserted.push({ item_id:row.item_id });
      }
      json(response, inserted, 201);
      return;
    }

    json(response, { message:"unexpected fake Supabase request" }, 500);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    records,
    requests,
    metrics:() => ({ fullHydrationRequests, targetedRateLimitReads, rateLimitCasRequests }),
    authSessions:() => [...records.values()].filter((row) => row.collection === "authSessions"),
    async stop() {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

function hostedTestEnvironment(fake, overrides = {}) {
  return {
    STORAGE_BACKEND:"supabase",
    LOCAL_DEMO_MODE:"false",
    COMMAND_CENTER_ALLOW_JSON:"false",
    SUPABASE_URL:fake.baseUrl,
    SUPABASE_SERVICE_ROLE_KEY:SERVICE_ROLE_KEY,
    COMMAND_CENTER_SESSION_SECRET:SESSION_SECRET,
    SUPABASE_REQUEST_TIMEOUT_MS:"500",
    STATE_CACHE_TTL_MS:"0",
    ...overrides
  };
}

async function login(server, credential) {
  return jsonRequest(server.baseUrl, "/api/auth/login", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ credential })
  });
}

function assertNoSecretLeak(text, secrets, label) {
  for (const secret of secrets) assert(!String(text).includes(secret), `${label} must not expose a credential or secret.`);
}

console.log("Hosted owner-login timeout regression tests");

{
  const fake = await startFakeSupabase({ conflictRateLimitOnce:true });
  const preview = await startPreviewServer({ env:hostedTestEnvironment(fake) });
  const responseBodies = [];
  let sessionCookieValue = "";
  let csrfCookieValue = "";
  try {
    const accepted = await login(preview, preview.ownerCredential);
    responseBodies.push(accepted.text);
    assert.equal(accepted.response.status, 200, "A correct owner credential must return 200.");
    assert.equal(accepted.json.role, "owner");
    const cookies = accepted.response.headers.get("set-cookie") || "";
    sessionCookieValue = cookies.match(/leos_session=([^;]+)/)?.[1] || "";
    csrfCookieValue = cookies.match(/leos_csrf=([^;]+)/)?.[1] || "";
    assert(sessionCookieValue, "Correct login must set the opaque HttpOnly session cookie.");
    assert(csrfCookieValue, "Correct login must set the CSRF cookie.");
    assert.match(cookies, /leos_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax/);
    assert.equal(fake.authSessions().length, 1, "Correct login must durably create exactly one authSessions record.");
    assert.equal(fake.metrics().fullHydrationRequests, 0, "Successful rate-limit CAS must not trigger complete-state hydration.");
    assert.equal(fake.metrics().targetedRateLimitReads, 2, "One synthetic conflict must retry the exact securityMetrics row read.");
    assert.equal(fake.metrics().rateLimitCasRequests, 2, "One synthetic conflict must retry the atomic CAS and then succeed.");

    const invalid = await login(preview, "invalid-owner-credential-A7v9-Q4m8-2026");
    responseBodies.push(invalid.text);
    assert.equal(invalid.response.status, 401, "Invalid credentials must remain 401.");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const denied = await login(preview, `invalid-owner-credential-${attempt}-A7v9-Q4m8`);
      responseBodies.push(denied.text);
      assert.equal(denied.response.status, 401, "The first six durable attempts must remain credential decisions.");
    }
    const throttled = await login(preview, "invalid-owner-credential-rate-limited-A7v9");
    responseBodies.push(throttled.text);
    assert.equal(throttled.response.status, 429, "The seventh durable attempt must remain rate-limited.");
    assert(Number(throttled.response.headers.get("retry-after")) > 0, "Rate-limited responses must retain safe retry guidance.");
    assert.equal(fake.authSessions().length, 1, "Rejected and throttled requests must not create sessions.");
    assert.equal(fake.metrics().fullHydrationRequests, 0, "Auth security-metric writes must remain targeted.");
    const securityMetrics = fake.records.get("securityMetrics/singleton")?.payload || {};
    const bucketCounts = Object.values(securityMetrics.rateLimitBuckets || {}).map((bucket) => Number(bucket.count || 0));
    assert.deepEqual(bucketCounts, [7], "The rate-limit bucket must remain durably persisted through enforcement.");
    assert.equal(securityMetrics.counters?.auth_failures, 5, "Invalid credential audit counts must remain durable.");
    assert.equal(securityMetrics.counters?.auth_throttled, 1, "Throttle audit counts must remain durable.");

    const safeSurface = responseBodies.join("\n") + "\n" + preview.logs();
    assertNoSecretLeak(safeSurface, [preview.ownerCredential, SERVICE_ROLE_KEY, SESSION_SECRET, sessionCookieValue, csrfCookieValue], "Login bodies and logs");
  } finally {
    await preview.stop();
    await fake.stop();
  }
  console.log("  ✓ targeted CAS, conflict retry, 200/401/429, cookies, durable sessions, and secret safety");
}

{
  const fake = await startFakeSupabase({ hangRateLimitRead:true });
  const preview = await startPreviewServer({ env:hostedTestEnvironment(fake, { SUPABASE_REQUEST_TIMEOUT_MS:"100" }) });
  try {
    const startedAt = Date.now();
    const unavailable = await login(preview, preview.ownerCredential);
    const elapsedMs = Date.now() - startedAt;
    assert.equal(unavailable.response.status, 503, "A Supabase timeout must return 503.");
    assert(elapsedMs < 1_500, `Login timeout must beat the proxy-style deadline; observed ${elapsedMs}ms.`);
    assert.equal(unavailable.json.error, "Authentication is temporarily unavailable. No successful session was returned.");
    assert.equal(fake.authSessions().length, 0, "A rate-limit timeout must not create a false successful session.");
    assertNoSecretLeak(unavailable.text + "\n" + preview.logs(), [preview.ownerCredential, SERVICE_ROLE_KEY, SESSION_SECRET], "Timeout response and logs");
  } finally {
    await preview.stop();
    await fake.stop();
  }
  console.log("  ✓ hanging Supabase rate-limit read aborts within the fixture bound and returns safe 503");
}

{
  const fake = await startFakeSupabase({ failSessionWrites:true });
  const preview = await startPreviewServer({ env:hostedTestEnvironment(fake) });
  try {
    const unavailable = await login(preview, preview.ownerCredential);
    assert.equal(unavailable.response.status, 503, "Unavailable session persistence must return 503.");
    assert.equal(unavailable.json.error, "Authentication is temporarily unavailable. No successful session was returned.");
    assert.equal(fake.authSessions().length, 0, "Unavailable session persistence must not report or store a successful session.");
    assertNoSecretLeak(unavailable.text + "\n" + preview.logs(), [preview.ownerCredential, SERVICE_ROLE_KEY, SESSION_SECRET], "Session failure response and logs");
  } finally {
    await preview.stop();
    await fake.stop();
  }
  console.log("  ✓ unavailable session persistence returns safe 503 without false success");
}

{
  const fake = await startFakeSupabase({ hangRateLimitRead:true });
  const previous = {
    url:process.env.SUPABASE_URL,
    key:process.env.SUPABASE_SERVICE_ROLE_KEY,
    timeout:process.env.SUPABASE_REQUEST_TIMEOUT_MS
  };
  try {
    process.env.SUPABASE_URL = fake.baseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.SUPABASE_REQUEST_TIMEOUT_MS = "500";
    const { supabaseRequestTimeoutMs, supabaseRestRequest } = await import(`./storage.mjs?hosted-login-timeout=${Date.now()}`);
    assert.equal(supabaseRequestTimeoutMs({}), 8_000, "The default Supabase timeout must be eight seconds.");
    assert.equal(supabaseRequestTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS:"1" }), 100, "The timeout override must clamp to the safe minimum.");
    assert.equal(supabaseRequestTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS:"60000" }), 15_000, "The timeout override must clamp below the hosted request deadline.");
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), 25);
    await assert.rejects(
      () => supabaseRestRequest("leos_core_records?select=collection,item_id,payload,version&collection=eq.securityMetrics&item_id=eq.singleton&limit=1", { signal:controller.signal }),
      (error) => error?.code === "SUPABASE_ABORTED" && error?.status === 503,
      "A caller AbortSignal must be combined with the storage timeout and converted safely."
    );
    clearTimeout(abort);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.timeout === undefined) delete process.env.SUPABASE_REQUEST_TIMEOUT_MS; else process.env.SUPABASE_REQUEST_TIMEOUT_MS = previous.timeout;
    await fake.stop();
  }
  console.log("  ✓ timeout default/clamps and caller AbortSignal composition are enforced");
}

console.log("hosted owner-login timeout regression tests passed");

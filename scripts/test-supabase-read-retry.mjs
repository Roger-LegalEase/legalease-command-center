import assert from "node:assert/strict";

process.env.SKIP_ENV_LOCAL_FILE = "1";
process.env.NODE_ENV = "test";
process.env.COMMAND_CENTER_TEST_MODE = "true";

const counts = new Map();
const count = (key) => {
  const next = (counts.get(key) || 0) + 1;
  counts.set(key, next);
  return next;
};

function response(method, status, body = { ok:true }) {
  return new Response(method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers:{ "content-type":"application/json" }
  });
}

function rejectWhenAborted(signal) {
  return new Promise((resolve, reject) => {
    const fixtureGuard = setTimeout(() => reject(new Error("Synthetic fetch was not aborted.")), 1_000);
    const abort = () => {
      clearTimeout(fixtureGuard);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once:true });
  });
}

const fakeFetch = async (url, options = {}) => {
  const method = String(options.method || "GET").toUpperCase();
  const route = new URL(url).pathname.replace(/^\/rest\/v1\//, "");
  const attempt = count(`${method}:${route}`);
  if (route === "retry-http") {
    return response(method, attempt === 1 ? 503 : 200, attempt === 1 ? { message:"temporary" } : { ok:true });
  }
  if (route === "retry-head") return response(method, attempt === 1 ? 504 : 200);
  if (route === "retry-network") {
    if (attempt === 1) throw new TypeError("Synthetic connection failure");
    return response(method, 200);
  }
  if (route === "retry-timeout" && attempt === 1) return rejectWhenAborted(options.signal);
  if (route === "retry-timeout") return response(method, 200);
  if (route === "timeout-final" || route === "caller-abort") return rejectWhenAborted(options.signal);
  if (route === "abort-backoff") return response(method, 503, { message:"temporary" });
  if (route === "write-transient") return response(method, 503, { message:"write unavailable" });
  if (route === "read-permanent") return response(method, 401, { message:"unauthorized" });
  if (route === "read-transient-final") return response(method, 502, { message:"temporary" });
  return response(method, 404, { message:"not found" });
};

const previous = {
  fetch:globalThis.fetch,
  url:process.env.SUPABASE_URL,
  serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY,
  timeout:process.env.SUPABASE_REQUEST_TIMEOUT_MS
};
globalThis.fetch = fakeFetch;
process.env.SUPABASE_URL = "https://supabase-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-key-for-local-fixture";
process.env.SUPABASE_REQUEST_TIMEOUT_MS = "100";

try {
  const { supabaseRestRequest } = await import(`./storage.mjs?read-retry=${Date.now()}`);

  assert.deepEqual(await supabaseRestRequest("retry-http"), { ok:true });
  assert.equal(counts.get("GET:retry-http"), 2, "A transient 503 GET should retry exactly once.");

  assert.equal(await supabaseRestRequest("retry-head", { method:"HEAD" }), null);
  assert.equal(counts.get("HEAD:retry-head"), 2, "A transient 504 HEAD should retry exactly once.");

  assert.deepEqual(await supabaseRestRequest("retry-network"), { ok:true });
  assert.equal(counts.get("GET:retry-network"), 2, "A transient network GET failure should retry exactly once.");

  assert.deepEqual(await supabaseRestRequest("retry-timeout"), { ok:true });
  assert.equal(counts.get("GET:retry-timeout"), 2, "A timed-out GET should retry exactly once.");

  await assert.rejects(
    () => supabaseRestRequest("timeout-final"),
    (error) => error?.code === "SUPABASE_TIMEOUT" && error?.status === 503
  );
  assert.equal(counts.get("GET:timeout-final"), 2, "A read must have at most one retry.");

  await assert.rejects(
    () => supabaseRestRequest("write-transient", { method:"POST", body:{ fixture:"synthetic" } }),
    (error) => error?.status === 503
  );
  assert.equal(counts.get("POST:write-transient"), 1, "A write with an uncertain outcome must not retry.");

  await assert.rejects(
    () => supabaseRestRequest("read-permanent"),
    (error) => error?.status === 401
  );
  assert.equal(counts.get("GET:read-permanent"), 1, "A permanent read failure must not retry.");

  await assert.rejects(
    () => supabaseRestRequest("read-transient-final"),
    (error) => error?.status === 502
  );
  assert.equal(counts.get("GET:read-transient-final"), 2, "A repeated transient read failure must stop after one retry.");

  const callerAbort = new AbortController();
  const abortTimer = setTimeout(() => callerAbort.abort(), 20);
  await assert.rejects(
    () => supabaseRestRequest("caller-abort", { signal:callerAbort.signal }),
    (error) => error?.code === "SUPABASE_ABORTED" && error?.status === 503
  );
  clearTimeout(abortTimer);
  assert.equal(counts.get("GET:caller-abort"), 1, "An explicit caller abort must not retry.");

  const backoffAbort = new AbortController();
  const backoffAbortTimer = setTimeout(() => backoffAbort.abort(), 20);
  await assert.rejects(
    () => supabaseRestRequest("abort-backoff", { signal:backoffAbort.signal }),
    (error) => error?.code === "SUPABASE_ABORTED" && error?.status === 503
  );
  clearTimeout(backoffAbortTimer);
  assert.equal(counts.get("GET:abort-backoff"), 1, "A caller abort during backoff must prevent the retry.");
} finally {
  globalThis.fetch = previous.fetch;
  if (previous.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = previous.url;
  if (previous.serviceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
  if (previous.timeout === undefined) delete process.env.SUPABASE_REQUEST_TIMEOUT_MS;
  else process.env.SUPABASE_REQUEST_TIMEOUT_MS = previous.timeout;
}

console.log("Supabase read retry tests passed");

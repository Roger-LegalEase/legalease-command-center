import { isHostedProduction } from "./runtime-security.mjs";

export const AUTH_RUNTIME_KEY_PREFIX = "leos:auth:v1";
export const AUTH_STORE_DEFAULT_TIMEOUT_MS = 2_500;
export const AUTH_STORE_ERROR_CODES = Object.freeze({
  timeout: "AUTH_STORE_TIMEOUT",
  aborted: "AUTH_STORE_ABORTED",
  unavailable: "AUTH_STORE_UNAVAILABLE",
  unauthorized: "AUTH_STORE_UNAUTHORIZED",
  error: "AUTH_STORE_ERROR"
});

const SESSION_KEY_PREFIX = `${AUTH_RUNTIME_KEY_PREFIX}:session:`;
const RATE_KEY_PREFIX = `${AUTH_RUNTIME_KEY_PREFIX}:rate:`;
const METRICS_KEY = `${AUTH_RUNTIME_KEY_PREFIX}:metrics`;
const MIN_REQUEST_TIMEOUT_MS = 250;
const MAX_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_CACHE_MS = 5_000;
const DEFAULT_SCAN_LIMIT = 1_000;
const MAX_SCAN_LIMIT = 5_000;
const SESSION_FIELDS = Object.freeze([
  "id",
  "tokenHash",
  "csrfHash",
  "role",
  "createdAt",
  "expiresAt",
  "revokedAt",
  "generation",
  "userAgentHash"
]);

const RATE_LIMIT_SCRIPT = [
  "local count = redis.call('INCR', KEYS[1])",
  "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "return {count, ttl}"
].join("\n");

const SAFE_MESSAGES = Object.freeze({
  AUTH_STORE_TIMEOUT: "Authentication runtime request timed out.",
  AUTH_STORE_ABORTED: "Authentication runtime request was aborted.",
  AUTH_STORE_UNAVAILABLE: "Authentication runtime is unavailable.",
  AUTH_STORE_UNAUTHORIZED: "Authentication runtime authorization failed.",
  AUTH_STORE_ERROR: "Authentication runtime request failed."
});

const clean = (value = "") => String(value ?? "").trim();
const finiteInteger = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export class AuthRuntimeStoreError extends Error {
  constructor(code = AUTH_STORE_ERROR_CODES.error, { retryable = false } = {}) {
    const safeCode = Object.values(AUTH_STORE_ERROR_CODES).includes(code) ? code : AUTH_STORE_ERROR_CODES.error;
    super(SAFE_MESSAGES[safeCode]);
    this.name = "AuthRuntimeStoreError";
    this.code = safeCode;
    this.status = 503;
    Object.defineProperty(this, "retryable", { value: Boolean(retryable), enumerable: false });
  }

  toJSON() {
    return { name:this.name, code:this.code, status:this.status, message:this.message };
  }
}

export function isAuthRuntimeStoreError(error) {
  return error instanceof AuthRuntimeStoreError && Object.values(AUTH_STORE_ERROR_CODES).includes(error.code);
}

export function authStoreRequestTimeoutMs(env = process.env) {
  const raw = clean(env.AUTH_STORE_REQUEST_TIMEOUT_MS);
  const requested = raw ? finiteInteger(raw, AUTH_STORE_DEFAULT_TIMEOUT_MS) : AUTH_STORE_DEFAULT_TIMEOUT_MS;
  return clamp(requested, MIN_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS);
}

function safeStoreError(error, fallback = AUTH_STORE_ERROR_CODES.error) {
  return isAuthRuntimeStoreError(error) ? error : new AuthRuntimeStoreError(fallback);
}

function safeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function assertTokenHash(tokenHash) {
  const value = clean(tokenHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  return value;
}

function safeString(value, maximum = 256) {
  const text = String(value ?? "");
  if (text.length > maximum) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  return text;
}

function sessionRecord(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }
  const record = {
    id: safeString(session.id, 128),
    tokenHash: assertTokenHash(session.tokenHash),
    csrfHash: safeString(session.csrfHash, 128),
    role: safeString(session.role, 64),
    createdAt: safeString(session.createdAt, 64),
    expiresAt: safeString(session.expiresAt, 64),
    revokedAt: safeString(session.revokedAt, 64),
    generation: Math.max(1, finiteInteger(session.generation, 1)),
    userAgentHash: safeString(session.userAgentHash, 128)
  };
  if (!record.id || !/^[a-f0-9]{64}$/i.test(record.csrfHash)) {
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }
  if (!Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.expiresAt))) {
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }
  if (record.revokedAt && !Number.isFinite(Date.parse(record.revokedAt))) {
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }
  return record;
}

function deserializeSession(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return sessionRecord(parsed);
  } catch (error) {
    throw safeStoreError(error);
  }
}

function sessionKey(tokenHash) {
  // tokenHash is already a COMMAND_CENTER_SESSION_SECRET HMAC; raw tokens never enter keys.
  return `${SESSION_KEY_PREFIX}${assertTokenHash(tokenHash)}`;
}

function safeScope(scope) {
  const value = clean(scope).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  return value;
}

function safeSubjectHash(subjectHash) {
  const value = clean(subjectHash).toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(value)) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  return value;
}

function rateLimitInput(input = {}, currentTime = Date.now()) {
  const scope = safeScope(input.scope);
  const subjectHash = safeSubjectHash(input.subjectHash);
  const windowMs = finiteInteger(input.windowMs);
  const limit = finiteInteger(input.limit);
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Number(currentTime);
  if (windowMs < 1 || limit < 1 || !Number.isFinite(now)) {
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }
  const windowBucket = input.windowBucket === undefined
    ? Math.floor(now / windowMs)
    : finiteInteger(input.windowBucket, -1);
  if (windowBucket < 0) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  const resetAt = (windowBucket + 1) * windowMs;
  return {
    scope,
    subjectHash,
    windowMs,
    limit,
    now,
    windowBucket,
    resetAt,
    key:`${RATE_KEY_PREFIX}${scope}:${subjectHash}:${windowBucket}`
  };
}

function rateLimitDecision(input, count, ttlMs = 0) {
  const safeCount = Math.max(0, finiteInteger(count));
  const boundaryRemainingMs = Math.max(1, input.resetAt - input.now);
  const remainingMs = Number(ttlMs) > 0 ? Math.min(boundaryRemainingMs, Number(ttlMs)) : boundaryRemainingMs;
  return {
    allowed:safeCount <= input.limit,
    count:safeCount,
    remaining:Math.max(0, input.limit - safeCount),
    retryAfterSeconds:Math.max(1, Math.ceil(remainingMs / 1_000)),
    resetAt:input.resetAt
  };
}

function metricName(name) {
  const value = clean(name).toLowerCase();
  if (!/^[a-z][a-z0-9_:-]{0,63}$/.test(value)) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  return value;
}

function metricAmount(amount) {
  const value = finiteInteger(amount, Number.NaN);
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }
  return value;
}

function endpointConfiguration(env, suppliedUrl, suppliedToken) {
  const url = clean(suppliedUrl ?? env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, "");
  const token = clean(suppliedToken ?? env.UPSTASH_REDIS_REST_TOKEN);
  const hosted = isHostedProduction(env);
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === "https:" || (!hosted && parsed.protocol === "http:");
  } catch {
    validUrl = false;
  }
  return { url, token, hosted, configured:Boolean(validUrl && token) };
}

async function defaultDelay(milliseconds, signal) {
  if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
  await new Promise((resolve, reject) => {
    let timer;
    const aborted = () => {
      clearTimeout(timer);
      reject(new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", aborted, { once:true });
  });
}

function createRestRequester({ endpoint, requestTimeoutMs, fetchImpl, retryDelayMs, delayImpl }) {
  // Upstash writes are served by the primary while reads may use replicas. Keep a separate
  // opaque checkpoint for each session key and serialize only operations on that key. A
  // process-wide mutable token can regress when concurrent responses arrive out of order.
  const readYourWritesSyncTokens = new Map();
  const consistencyTails = new Map();

  async function singleRequest(command, callerSignal, readYourWritesSyncToken = "") {
    if (!endpoint.configured || typeof fetchImpl !== "function") {
      throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.unavailable);
    }
    if (callerSignal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);

    const controller = new AbortController();
    let timedOut = false;
    const callerAborted = () => controller.abort();
    callerSignal?.addEventListener("abort", callerAborted, { once:true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    timer.unref?.();

    try {
      const response = await fetchImpl(endpoint.url, {
        method:"POST",
        headers:{
          authorization:`Bearer ${endpoint.token}`,
          "content-type":"application/json",
          ...(readYourWritesSyncToken ? { "upstash-sync-token":readYourWritesSyncToken } : {})
        },
        body:JSON.stringify(command),
        signal:controller.signal
      });
      if (response.status === 401 || response.status === 403) {
        throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.unauthorized);
      }
      if ([502, 503, 504].includes(response.status)) {
        throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.unavailable, { retryable:true });
      }
      if (!response.ok) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
      }
      if (!payload || typeof payload !== "object" || Object.hasOwn(payload, "error")) {
        throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
      }
      return {
        result:payload.result,
        syncToken:clean(response.headers?.get?.("upstash-sync-token"))
      };
    } catch (error) {
      if (callerSignal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
      if (timedOut) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.timeout, { retryable:true });
      if (isAuthRuntimeStoreError(error)) throw error;
      throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.unavailable, { retryable:true });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", callerAborted);
    }
  }

  async function execute(command, { signal, retry, consistencyKey }) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await singleRequest(
          command,
          signal,
          consistencyKey ? readYourWritesSyncTokens.get(consistencyKey) || "" : ""
        );
        if (consistencyKey && response.syncToken) {
          readYourWritesSyncTokens.set(consistencyKey, response.syncToken);
        }
        return response.result;
      } catch (error) {
        const safeError = safeStoreError(error);
        if (!retry || attempt > 0 || !safeError.retryable || safeError.code === AUTH_STORE_ERROR_CODES.aborted) {
          throw safeError;
        }
        await delayImpl(retryDelayMs, signal);
      }
    }
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }

  return async function request(command, { signal, retry = false, consistencyKey = "" } = {}) {
    const key = clean(consistencyKey);
    if (!key) return execute(command, { signal, retry, consistencyKey:"" });

    const previous = consistencyTails.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    consistencyTails.set(key, tail);
    await previous.catch(() => {});
    try {
      return await execute(command, { signal, retry, consistencyKey:key });
    } finally {
      release();
      if (consistencyTails.get(key) === tail) consistencyTails.delete(key);
    }
  };
}

function safeHealthResult({ backend, configured, connected, latencyMs, checkedAt, errorCode = "" }) {
  return Object.freeze({
    backend,
    configured:Boolean(configured),
    connected:Boolean(connected),
    latencyMs:Math.max(0, finiteInteger(latencyMs)),
    lastCheckedAt:safeTimestamp(checkedAt),
    errorCode:clean(errorCode)
  });
}

export function createUpstashAuthRuntimeStore({
  env = process.env,
  url,
  token,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  retryDelayMs = 50,
  delayImpl = defaultDelay,
  healthCacheMs = DEFAULT_HEALTH_CACHE_MS
} = {}) {
  const endpoint = endpointConfiguration(env, url, token);
  const timeoutMs = authStoreRequestTimeoutMs(env);
  const retryDelay = clamp(finiteInteger(retryDelayMs, 50), 10, 250);
  const healthTtl = clamp(finiteInteger(healthCacheMs, DEFAULT_HEALTH_CACHE_MS), 250, 60_000);
  const request = createRestRequester({
    endpoint,
    requestTimeoutMs:timeoutMs,
    fetchImpl,
    retryDelayMs:retryDelay,
    delayImpl
  });
  let cachedHealth = null;
  let cachedHealthAt = 0;

  async function createSession(session, ttlMs, { signal } = {}) {
    const record = sessionRecord(session);
    const ttl = finiteInteger(ttlMs);
    if (ttl < 1) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    const key = sessionKey(record.tokenHash);
    const command = ["SET", key, JSON.stringify(record), "PX", String(ttl), "NX"];
    try {
      const result = await request(command, { signal, consistencyKey:key });
      if (clean(result).toUpperCase() !== "OK") throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
      return true;
    } catch (error) {
      const safeError = safeStoreError(error);
      if (![AUTH_STORE_ERROR_CODES.timeout, AUTH_STORE_ERROR_CODES.unavailable].includes(safeError.code) || signal?.aborted) {
        throw safeError;
      }
      try {
        const stored = await getSession(record.tokenHash, { signal });
        if (stored?.id === record.id && stored.tokenHash === record.tokenHash) return true;
      } catch {
        // The original safe error is the most precise outcome when verification also fails.
      }
      throw safeError;
    }
  }

  async function getSession(tokenHash, { signal } = {}) {
    const key = sessionKey(tokenHash);
    const result = await request(["GET", key], { signal, retry:true, consistencyKey:key });
    return deserializeSession(result);
  }

  async function deleteSession(tokenHash, { signal } = {}) {
    const key = sessionKey(tokenHash);
    const result = await request(["DEL", key], { signal, retry:true, consistencyKey:key });
    return finiteInteger(result) > 0;
  }

  async function revokeSessions(predicate = () => true, { signal, maxSessions = DEFAULT_SCAN_LIMIT } = {}) {
    if (typeof predicate !== "function") throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    const maximum = clamp(finiteInteger(maxSessions, DEFAULT_SCAN_LIMIT), 1, MAX_SCAN_LIMIT);
    const seen = new Set();
    let cursor = "0";
    let inspected = 0;
    let deleted = 0;
    let pages = 0;
    do {
      const remaining = maximum - inspected;
      if (remaining <= 0 || pages >= 1_000) break;
      const result = await request([
        "SCAN",
        cursor,
        "MATCH",
        `${SESSION_KEY_PREFIX}*`,
        "COUNT",
        String(Math.min(100, remaining))
      ], { signal, retry:true });
      if (!Array.isArray(result) || !Array.isArray(result[1])) {
        throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
      }
      cursor = clean(result[0]) || "0";
      pages += 1;
      for (const key of result[1]) {
        if (inspected >= maximum) break;
        const textKey = clean(key);
        if (!textKey.startsWith(SESSION_KEY_PREFIX) || seen.has(textKey)) continue;
        seen.add(textKey);
        inspected += 1;
        const tokenHash = textKey.slice(SESSION_KEY_PREFIX.length);
        let session;
        try {
          session = await getSession(tokenHash, { signal });
        } catch (error) {
          if (safeStoreError(error).code === AUTH_STORE_ERROR_CODES.error) continue;
          throw error;
        }
        if (session && predicate(session) && await deleteSession(tokenHash, { signal })) deleted += 1;
      }
    } while (cursor !== "0");
    return deleted;
  }

  async function consumeRateLimit(input = {}) {
    const normalized = rateLimitInput(input, now());
    const ttlMs = Math.max(1, normalized.resetAt - normalized.now);
    const result = await request([
      "EVAL",
      RATE_LIMIT_SCRIPT,
      "1",
      normalized.key,
      String(ttlMs)
    ], { signal:input.signal, retry:false });
    if (!Array.isArray(result) || result.length < 1) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    return rateLimitDecision(normalized, result[0], result[1]);
  }

  async function incrementMetric(name, amount = 1, { signal } = {}) {
    const result = await request([
      "HINCRBY",
      METRICS_KEY,
      metricName(name),
      String(metricAmount(amount))
    ], { signal, retry:false });
    const count = finiteInteger(result, Number.NaN);
    if (!Number.isFinite(count)) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    return count;
  }

  async function readMetrics({ signal } = {}) {
    const result = await request(["HGETALL", METRICS_KEY], { signal, retry:true });
    if (result === null) return {};
    const output = {};
    if (Array.isArray(result)) {
      for (let index = 0; index + 1 < result.length; index += 2) {
        output[metricName(result[index])] = finiteInteger(result[index + 1]);
      }
      return output;
    }
    if (typeof result === "object") {
      for (const [name, value] of Object.entries(result)) output[metricName(name)] = finiteInteger(value);
      return output;
    }
    throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
  }

  async function health({ signal, force = false } = {}) {
    const checkedAt = now();
    if (!force && cachedHealth && checkedAt - cachedHealthAt < healthTtl) return cachedHealth;
    const startedAt = Date.now();
    let result;
    if (!endpoint.configured) {
      result = safeHealthResult({
        backend:"upstash",
        configured:false,
        connected:false,
        latencyMs:0,
        checkedAt,
        errorCode:AUTH_STORE_ERROR_CODES.unavailable
      });
    } else {
      try {
        const pong = await request(["PING"], { signal, retry:true });
        if (clean(pong).toUpperCase() !== "PONG") throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
        result = safeHealthResult({
          backend:"upstash",
          configured:true,
          connected:true,
          latencyMs:Date.now() - startedAt,
          checkedAt
        });
      } catch (error) {
        result = safeHealthResult({
          backend:"upstash",
          configured:true,
          connected:false,
          latencyMs:Date.now() - startedAt,
          checkedAt,
          errorCode:safeStoreError(error).code
        });
      }
    }
    cachedHealth = result;
    cachedHealthAt = checkedAt;
    return result;
  }

  return Object.freeze({
    backend:"upstash",
    configured:endpoint.configured,
    createSession,
    getSession,
    deleteSession,
    revokeSessions,
    consumeRateLimit,
    incrementMetric,
    readMetrics,
    health
  });
}

export function createMemoryAuthRuntimeStore({ now = () => Date.now() } = {}) {
  const sessions = new Map();
  const rates = new Map();
  const metrics = new Map();

  function liveSession(tokenHash) {
    const key = sessionKey(tokenHash);
    const entry = sessions.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= now()) {
      sessions.delete(key);
      return null;
    }
    return sessionRecord(entry.session);
  }

  async function createSession(session, ttlMs, { signal } = {}) {
    if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
    const record = sessionRecord(session);
    const ttl = finiteInteger(ttlMs);
    if (ttl < 1) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    const key = sessionKey(record.tokenHash);
    if (liveSession(record.tokenHash)) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    sessions.set(key, { session:record, expiresAtMs:now() + ttl });
    return true;
  }

  async function getSession(tokenHash, { signal } = {}) {
    if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
    return liveSession(tokenHash);
  }

  async function deleteSession(tokenHash, { signal } = {}) {
    if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
    return sessions.delete(sessionKey(tokenHash));
  }

  async function revokeSessions(predicate = () => true, { signal, maxSessions = DEFAULT_SCAN_LIMIT } = {}) {
    if (typeof predicate !== "function") throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.error);
    const maximum = clamp(finiteInteger(maxSessions, DEFAULT_SCAN_LIMIT), 1, MAX_SCAN_LIMIT);
    let inspected = 0;
    let deleted = 0;
    for (const [key, entry] of sessions) {
      if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
      if (inspected >= maximum) break;
      if (entry.expiresAtMs <= now()) {
        sessions.delete(key);
        continue;
      }
      inspected += 1;
      const record = sessionRecord(entry.session);
      if (predicate(record) && sessions.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async function consumeRateLimit(input = {}) {
    if (input.signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
    const normalized = rateLimitInput(input, now());
    let bucket = rates.get(normalized.key);
    if (!bucket || bucket.resetAt <= normalized.now) bucket = { count:0, resetAt:normalized.resetAt };
    bucket.count += 1;
    rates.set(normalized.key, bucket);
    return rateLimitDecision(normalized, bucket.count, bucket.resetAt - normalized.now);
  }

  async function incrementMetric(name, amount = 1, { signal } = {}) {
    if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
    const field = metricName(name);
    const count = (metrics.get(field) || 0) + metricAmount(amount);
    metrics.set(field, count);
    return count;
  }

  async function readMetrics({ signal } = {}) {
    if (signal?.aborted) throw new AuthRuntimeStoreError(AUTH_STORE_ERROR_CODES.aborted);
    return Object.fromEntries(metrics);
  }

  async function health() {
    return safeHealthResult({
      backend:"memory",
      configured:true,
      connected:true,
      latencyMs:0,
      checkedAt:now()
    });
  }

  return Object.freeze({
    backend:"memory",
    configured:true,
    createSession,
    getSession,
    deleteSession,
    revokeSessions,
    consumeRateLimit,
    incrementMetric,
    readMetrics,
    health
  });
}

export function createAuthRuntimeStore({ env = process.env, authStore, ...options } = {}) {
  const hosted = isHostedProduction(env);
  if (!hosted && authStore) return authStore;
  const hasUpstashConfiguration = Boolean(
    clean(options.url ?? env.UPSTASH_REDIS_REST_URL)
    && clean(options.token ?? env.UPSTASH_REDIS_REST_TOKEN)
  );
  if (hosted || hasUpstashConfiguration) return createUpstashAuthRuntimeStore({ env, ...options });
  return createMemoryAuthRuntimeStore(options);
}

export const AUTH_RUNTIME_SESSION_FIELDS = SESSION_FIELDS;

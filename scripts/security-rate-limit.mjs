import crypto from "node:crypto";

const clean = (value = "") => String(value ?? "").trim();

export function rateLimitKey(scope, value, secret = "") {
  const pepper = clean(secret) || "development-only-rate-limit";
  return crypto.createHmac("sha256", pepper).update(`${scope}:${clean(value)}`).digest("hex").slice(0, 32);
}

export async function consumeRateLimit({ store, scope, subject, limit, windowMs, now = Date.now(), secret = "" } = {}) {
  if (!store || !scope || !Number.isFinite(limit) || !Number.isFinite(windowMs)) throw new Error("Rate-limit configuration is invalid.");
  const bucketKey = rateLimitKey(scope, subject, secret);
  let decision = { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  await store.mutateCollectionItem("securityMetrics", "singleton", (current) => {
    const buckets = { ...(current?.rateLimitBuckets || {}) };
    for (const [key, bucket] of Object.entries(buckets)) {
      if (Number(bucket?.resetAt || 0) + windowMs < now) delete buckets[key];
    }
    const existing = buckets[bucketKey];
    const bucket = !existing || Number(existing.resetAt || 0) <= now
      ? { count: 0, resetAt: now + windowMs }
      : { count: Number(existing.count || 0), resetAt: Number(existing.resetAt) };
    bucket.count += 1;
    buckets[bucketKey] = bucket;
    decision = {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
    return { ...(current || {}), id: "singleton", rateLimitBuckets: buckets, updatedAt: new Date(now).toISOString() };
  }, { createIfMissing: true, maxRetries: 2, returnState:false });
  return decision;
}

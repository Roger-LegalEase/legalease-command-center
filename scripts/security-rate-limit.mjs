import crypto from "node:crypto";

const clean = (value = "") => String(value ?? "").trim();

export function rateLimitKey(scope, value, secret = "") {
  const pepper = clean(secret) || "development-only-rate-limit";
  return crypto.createHmac("sha256", pepper).update(`${scope}:${clean(value)}`).digest("hex").slice(0, 32);
}

export async function consumeRateLimit({ authStore, scope, subject, limit, windowMs, now = Date.now(), secret = "", signal } = {}) {
  if (!authStore || typeof authStore.consumeRateLimit !== "function" || !clean(scope)
    || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1
    || !Number.isFinite(now)) {
    throw new Error("Rate-limit configuration is invalid.");
  }
  const subjectHash = rateLimitKey(scope, subject, secret);
  const decision = await authStore.consumeRateLimit({
    scope: clean(scope),
    subjectHash,
    limit,
    windowMs,
    now,
    signal
  });
  if (!decision || typeof decision.allowed !== "boolean"
    || !Number.isInteger(decision.count) || decision.count < 1
    || decision.allowed !== (decision.count <= limit)
    || !Number.isInteger(decision.remaining) || decision.remaining !== Math.max(0, limit - decision.count)
    || !Number.isFinite(decision.retryAfterSeconds) || decision.retryAfterSeconds < 1
    || !Number.isFinite(decision.resetAt) || decision.resetAt <= now) {
    const error = new Error("Rate-limit decision is unavailable.");
    error.code = "AUTH_STORE_ERROR";
    throw error;
  }
  return decision;
}

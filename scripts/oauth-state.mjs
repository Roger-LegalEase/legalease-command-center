import crypto from "node:crypto";
import { isHostedProduction } from "./runtime-security.mjs";

const MAX_AGE_MS = 10 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;

export function oauthSigningSecret(platform, env = process.env) {
  return env.OAUTH_STATE_SECRET || (!isHostedProduction(env) ? `development-oauth-state-${platform}` : "");
}

export function signOAuthState(platform, options = {}, { env = process.env, now = Date.now(), nonce = crypto.randomBytes(16).toString("hex") } = {}) {
  const secret = oauthSigningSecret(platform, env);
  if (!secret) throw new Error("OAuth state configuration is unavailable.");
  const payload = { platform, nonce, issuedAt:now, ...options };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(platform, state, { env = process.env, now = Date.now() } = {}) {
  const secret = oauthSigningSecret(platform, env);
  const [encoded = "", signature = "", extra = ""] = String(state || "").split(".");
  if (!secret || !encoded || !signature || extra) return { ok:false, error:"OAuth state is invalid." };
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok:false, error:"OAuth state is invalid." };
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const age = now - Number(payload.issuedAt || 0);
    if (payload.platform !== platform || !/^[a-f0-9]{32}$/.test(String(payload.nonce || "")) || age < -FUTURE_SKEW_MS || age > MAX_AGE_MS) return { ok:false, error:"OAuth state is invalid or expired." };
    return { ok:true, payload };
  } catch {
    return { ok:false, error:"OAuth state is invalid." };
  }
}

export function verifyOwnerStartedOAuthState(platform, state, { sessionId = "", callbackPath = "", returnTarget = "settings", env = process.env, now = Date.now() } = {}) {
  const verified = verifyOAuthState(platform, state, { env, now });
  if (!verified.ok) return verified;
  const role = String(verified.payload.startedByRole || "").toLowerCase();
  if (verified.payload.ownerStarted !== true || !["owner", "admin"].includes(role)) return { ok:false, error:"OAuth state is invalid." };
  if (!sessionId || verified.payload.sessionId !== sessionId) return { ok:false, error:"OAuth state is invalid." };
  if (!callbackPath || verified.payload.callbackPath !== callbackPath) return { ok:false, error:"OAuth state is invalid." };
  if (returnTarget && verified.payload.returnTarget !== returnTarget) return { ok:false, error:"OAuth state is invalid." };
  return verified;
}

export const OAUTH_STATE_MAX_AGE_MS = MAX_AGE_MS;
